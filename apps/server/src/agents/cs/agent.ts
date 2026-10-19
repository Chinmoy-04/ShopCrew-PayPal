import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { money } from "@shopcrew/shared";
import { repoRoot } from "../../config.js";
import { db } from "../../db/client.js";
import { customers, messages, orders } from "../../db/schema.js";
import { propose } from "../gate.js";
import { narrate } from "../llm.js";

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
    const canRefund = order?.source === "paypal" && order.paypalCaptureId && remaining > 0 && intent !== "reply_only" && intent !== "escalate";
    if (!canRefund) {
      const tool = intent === "escalate" ? "escalate_to_owner" : "send_reply";
      const fallback = intent === "escalate"
        ? "I am not refunding this. It needs a person: the message is suspicious or I do not have a captured PayPal payment to refund."
        : "No refund. I will answer the question and leave the payment alone.";
      const reasoning = await narrate("You are the ShopCrew customer service agent. Write 2 sentences.", message.body, fallback);
      await propose({
        agent: "cs",
        type: "reply",
        targetRef: message.id,
        toolName: tool,
        toolArgs: { message_id: message.id, body: reasoning, tone: intent === "escalate" ? "firm" : "apologetic" },
        reasoning,
        summary: intent === "escalate" ? `Escalate: ${message.category}` : `Reply only: ${message.category}`,
        reason: message.category,
        confidenceModel: 0.74,
        confidenceLlm: 0.6,
        amount: 0,
        inputs: { body: message.body, intent, messageId: message.id, customer: customer?.name },
      });
    } else {
      const amount = intent === "full_refund" ? remaining : money(Math.min(template?.refundAmount ?? 8, remaining));
      const fallback = `I am refunding $${amount.toFixed(2)} of the $${remaining.toFixed(2)} still captured. Category: ${message.category}.`;
      const reasoning = await narrate("You are the ShopCrew customer service agent. Explain a refund in 2 sentences.", message.body, fallback);
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
        reasoning,
        summary: `${intent === "full_refund" ? "Full" : "Partial"} refund $${amount.toFixed(2)} on ${order.id}`,
        reason: message.category,
        confidenceModel: intent === "full_refund" ? 0.62 : 0.81,
        confidenceLlm: 0.66,
        amount,
        policyExtra: {
          orderTotal: order.total,
          refundedAlready: order.refundedTotal,
          customerRefunds30d: customer?.refunds30d ?? 0,
          suspicious: message.category === "suspicious",
        },
        inputs: { body: message.body, remaining, customer: customer?.name, messageId: message.id },
        trace: [{ tool: "get_order", result: { id: order.id, capture_id: order.paypalCaptureId, remaining } }],
      });
    }
    await db().update(messages).set({ status: "handled" }).where(eq(messages.id, message.id));
    count++;
  }
  return count;
}
