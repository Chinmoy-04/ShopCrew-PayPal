import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { money } from "@shopcrew/shared";
import { repoRoot } from "../../config.js";
import { writeAudit } from "../../db/audit.js";
import { db } from "../../db/client.js";
import { customers, messages, orders } from "../../db/schema.js";
import { createRefundToolSchema } from "../../paypal/toolkit.js";
import { propose } from "../gate.js";
import { chooseTool, type CsToolChoice } from "../llm.js";

interface Template {
  id: string;
  category: string;
  sentiment: string;
  intent: "partial_refund" | "full_refund" | "reply_only" | "escalate";
  refundAmount: number;
  orderId: string;
  body: string;
}

export function loadComplaints(): Template[] {
  return JSON.parse(fs.readFileSync(path.join(repoRoot(), "fixtures", "complaints.json"), "utf8")) as Template[];
}

function ruleFallback(template: Template | undefined, remaining: number, canRefund: boolean): CsToolChoice {
  const intent = template?.intent ?? "reply_only";
  if (!canRefund) {
    if (intent === "escalate") {
      return {
        action: "escalate_to_owner",
        amount: 0,
        reasoning: "I am not refunding this. It needs a person: the message is suspicious or I do not have a captured PayPal payment to refund.",
        confidence: 0.6,
      };
    }
    return {
      action: "send_reply",
      amount: 0,
      reasoning: "No refund. I will answer the question and leave the payment alone.",
      confidence: 0.6,
    };
  }
  const amount = intent === "full_refund" ? remaining : money(Math.min(template?.refundAmount ?? 8, remaining));
  return {
    action: "create_refund",
    amount,
    reasoning: `I am refunding $${amount.toFixed(2)} of the $${remaining.toFixed(2)} still captured. Category: ${template?.category ?? "general"}.`,
    confidence: intent === "full_refund" ? 0.62 : 0.81,
  };
}

export async function runCustomerService(): Promise<number> {
  const open = await db().select().from(messages).where(eq(messages.status, "open"));
  const templates = loadComplaints();
  let count = 0;
  for (const message of open) {
    const template = templates.find((item) => item.id === message.templateId);
    const [order] = message.orderId ? await db().select().from(orders).where(eq(orders.id, message.orderId)) : [];
    const [customer] = await db().select().from(customers).where(eq(customers.id, message.customerId));
    const intent = template?.intent ?? "reply_only";
    const remaining = order ? money(order.total - order.refundedTotal) : 0;
    const canRefund = Boolean(order?.source === "paypal" && order.paypalCaptureId && remaining > 0 && intent !== "reply_only" && intent !== "escalate");

    const refundSchema = createRefundToolSchema();
    const system = [
      "You are the ShopCrew customer service agent for a candle shop.",
      "Choose exactly one action: create_refund, send_reply, or escalate_to_owner.",
      "If refunding, amount must be <= remaining captured USD and use the PayPal create_refund tool.",
      `Tool schema: ${JSON.stringify(refundSchema)}`,
    ].join(" ");
    const prompt = JSON.stringify({
      complaint: message.body,
      category: message.category,
      intentHint: intent,
      order: order
        ? {
            id: order.id,
            capture_id: order.paypalCaptureId,
            total: order.total,
            refundedTotal: order.refundedTotal,
            remaining,
          }
        : null,
      customer: customer?.name,
    });

    const fallback = ruleFallback(template, remaining, canRefund);
    let choice = await chooseTool(system, prompt, fallback);

    // Clamp / reject invalid model output; keep propose() as the policy gate.
    if (choice.action === "create_refund") {
      if (!order?.paypalCaptureId || remaining <= 0) {
        await writeAudit({
          actor: "system",
          agent: "cs",
          event: "agent.invalid_output",
          message: `Model chose create_refund without a refundable capture; falling back to ${fallback.action}.`,
        });
        choice = { ...fallback, action: fallback.action === "create_refund" ? "send_reply" : fallback.action };
      } else {
        const rawAmount = money(Number(choice.amount ?? 0));
        if (rawAmount <= 0 || rawAmount > remaining + 0.001) {
          await writeAudit({
            actor: "system",
            agent: "cs",
            event: "agent.invalid_output",
            message: `Refund amount $${rawAmount.toFixed(2)} invalid for remaining $${remaining.toFixed(2)}; clamped.`,
          });
          choice = { ...choice, amount: money(Math.min(Math.max(rawAmount, 0.01), remaining)) };
        }
      }
    }

    if (choice.action !== "create_refund" && choice.action !== "send_reply" && choice.action !== "escalate_to_owner") {
      await writeAudit({
        actor: "system",
        agent: "cs",
        event: "agent.invalid_output",
        message: `Unknown tool ${(choice as { action?: string }).action}; using fallback.`,
      });
      choice = fallback;
    }

    if (choice.action === "create_refund" && order?.paypalCaptureId) {
      const amount = money(Math.min(Number(choice.amount ?? 0), remaining));
      await propose({
        agent: "cs",
        type: "refund",
        targetRef: order.id,
        toolName: "create_refund",
        toolArgs: {
          capture_id: order.paypalCaptureId,
          amount: { currency_code: "USD", value: amount.toFixed(2) },
          note_to_payer: "Refund from Hearth & Wick",
        },
        reasoning: choice.reasoning,
        summary: `Refund $${amount.toFixed(2)} on ${order.id}`,
        reason: message.category,
        confidenceModel: choice.confidence,
        confidenceLlm: choice.confidence,
        amount,
        policyExtra: {
          orderTotal: order.total,
          refundedAlready: order.refundedTotal,
          customerRefunds30d: customer?.refunds30d ?? 0,
          suspicious: message.category === "suspicious",
        },
        inputs: {
          body: message.body,
          remaining,
          customer: customer?.name,
          messageId: message.id,
          llmAction: choice.action,
          customerRefunds30d: customer?.refunds30d ?? 0,
          suspicious: message.category === "suspicious",
        },
        trace: [
          { tool: "get_order", result: { id: order.id, capture_id: order.paypalCaptureId, remaining } },
          { tool: "create_refund", result: { amount, reasoning: choice.reasoning } },
        ],
      });
    } else {
      const tool = choice.action === "escalate_to_owner" ? "escalate_to_owner" : "send_reply";
      await propose({
        agent: "cs",
        type: "reply",
        targetRef: message.id,
        toolName: tool,
        toolArgs: { message_id: message.id, body: choice.reasoning, tone: tool === "escalate_to_owner" ? "firm" : "apologetic" },
        reasoning: choice.reasoning,
        summary: tool === "escalate_to_owner" ? `Escalate: ${message.category}` : `Reply only: ${message.category}`,
        reason: message.category,
        confidenceModel: choice.confidence,
        confidenceLlm: choice.confidence,
        amount: 0,
        inputs: { body: message.body, intent, messageId: message.id, customer: customer?.name, llmAction: choice.action },
        trace: [{ tool: choice.action, result: { reasoning: choice.reasoning } }],
      });
    }
    await db().update(messages).set({ status: "handled" }).where(eq(messages.id, message.id));
    count++;
  }
  return count;
}
