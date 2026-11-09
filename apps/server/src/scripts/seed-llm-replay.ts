/**
 * Seeds fixtures/llm-replay.json with deterministic CS tool choices for Days 1–7.
 * Hashes match agents/cs/agent.ts prompt construction (DRY captures from seed).
 * Re-run after changing the CS system prompt or complaint fixtures:
 *   npx tsx apps/server/src/scripts/seed-llm-replay.ts
 * With a live LLM, prefer LLM_RECORD=1 through a full Advance cycle instead.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { money } from "@shopcrew/shared";
import { createRefundToolSchema } from "../paypal/toolkit.js";
import { planFor } from "../sim/scenario.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

interface Template {
  id: string;
  category: string;
  sentiment: string;
  intent: "partial_refund" | "full_refund" | "reply_only" | "escalate";
  refundAmount: number;
  orderId: string;
  body: string;
}

const ORDER_TOTALS: Record<string, number> = {
  "ord-small": 36,
  "ord-large": 45,
  "ord-mid": 28,
  "ord-late": 24,
  "ord-wrong": 32,
  "ord-desc": 26,
  "ord-abuse": 28,
  "ord-b1": 40,
  "ord-b2": 40,
  "ord-b3": 40,
  "ord-b4": 40,
  "ord-b5": 40,
  "ord-big": 90,
};

const CUSTOMERS: Record<string, string> = {
  "ord-small": "Jonah Hale",
  "ord-large": "Priya Shah",
  "ord-mid": "Avery Cole",
  "ord-late": "Jonah Hale",
  "ord-wrong": "Avery Cole",
  "ord-desc": "Priya Shah",
  "ord-abuse": "Riley Moss",
  "ord-b1": "Avery Cole",
  "ord-b2": "Jonah Hale",
  "ord-b3": "Priya Shah",
  "ord-b4": "Avery Cole",
  "ord-b5": "Jonah Hale",
  "ord-big": "Priya Shah",
};

function dryCapture(orderId: string): string {
  return `DRY-CAP-${orderId.replace("ord-", "").toUpperCase().padEnd(12, "0")}`.slice(0, 22);
}

function key(system: string, prompt: string): string {
  return createHash("sha256").update(`${system}\n${prompt}`).digest("hex");
}

function ruleFallback(
  template: Template,
  remaining: number,
  canRefund: boolean,
): { action: string; amount?: number; reasoning: string; confidence: number } {
  const intent = template.intent;
  if (!canRefund) {
    if (intent === "escalate") {
      return {
        action: "escalate_to_owner",
        amount: 0,
        reasoning:
          "I am not refunding this. It needs a person: the message is suspicious or I do not have a captured PayPal payment to refund.",
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
  const amount = intent === "full_refund" ? remaining : money(Math.min(template.refundAmount ?? 8, remaining));
  return {
    action: "create_refund",
    amount,
    reasoning: `I am refunding $${amount.toFixed(2)} of the $${remaining.toFixed(2)} still captured. Category: ${template.category}.`,
    confidence: intent === "full_refund" ? 0.62 : 0.81,
  };
}

const templates = JSON.parse(fs.readFileSync(path.join(root, "fixtures", "complaints.json"), "utf8")) as Template[];
const refundSchema = createRefundToolSchema();
const system = [
  "You are the ShopCrew customer service agent for a candle shop.",
  "Choose exactly one action: create_refund, send_reply, or escalate_to_owner.",
  "If refunding, amount must be <= remaining captured USD and use the PayPal create_refund tool.",
  `Tool schema: ${JSON.stringify(refundSchema)}`,
].join(" ");

const entries: { hash: string; object: unknown; note?: string }[] = [];
const seen = new Set<string>();

for (let day = 1; day <= 7; day++) {
  for (const id of planFor(day).messages) {
    const template = templates.find((t) => t.id === id);
    if (!template || seen.has(id)) continue;
    seen.add(id);
    const total = ORDER_TOTALS[template.orderId] ?? 0;
    const remaining = total;
    const capture = dryCapture(template.orderId);
    const intent = template.intent;
    const canRefund = Boolean(capture && remaining > 0 && intent !== "reply_only" && intent !== "escalate");
    const prompt = JSON.stringify({
      complaint: template.body,
      category: template.category,
      intentHint: intent,
      order: {
        id: template.orderId,
        capture_id: capture,
        total,
        refundedTotal: 0,
        remaining,
      },
      customer: CUSTOMERS[template.orderId],
    });
    const choice = ruleFallback(template, remaining, canRefund);
    entries.push({
      hash: key(system, prompt),
      object: choice,
      note: `day-${day}:${template.id}`,
    });
  }
}

const out = path.join(root, "fixtures", "llm-replay.json");
fs.writeFileSync(out, JSON.stringify({ entries, generatedBy: "seed-llm-replay.ts", count: entries.length }, null, 2) + "\n");
console.log(`Wrote ${entries.length} replay entries to ${out}`);
