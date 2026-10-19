import { describe, expect, it } from "vitest";
import { explainProposal } from "../src/agents/explain.js";

const base = {
  id: "prop-test-1",
  agent: "cs",
  type: "refund",
  summary: "Refund $8.00 on ord-small",
  reasoning: "Customer reported damaged item within 14-day window. Under the $25 auto-approve threshold.",
  policyResult: "auto_approved",
  policyReasons: ["amount < autoApproveMax"],
  status: "auto_approved",
  amount: 8,
  paypalRef: "DRY-REFUND-001",
  inputs: { remaining: 49.99, customer: "Buyer Bob", messageId: "msg-test-1" },
};

describe("explainProposal", () => {
  it("answers amount questions from stored data", async () => {
    const { answer, source } = await explainProposal(base, "How much is the refund?");
    expect(answer).toContain("8");
    expect(["replay", "llm"]).toContain(source);
  });

  it("answers policy questions", async () => {
    const { answer } = await explainProposal(base, "Why did the policy approve this?");
    expect(answer.toLowerCase()).toMatch(/policy|auto|threshold|amount/);
  });

  it("answers paypal status questions", async () => {
    const { answer } = await explainProposal(base, "What is the PayPal status?");
    expect(answer).toContain("auto_approved");
  });

  it("falls back to replay without LLM credentials", async () => {
    const no_key = { ...base, id: "prop-no-key" };
    // narrate falls back to fallback string when no OPENAI_API_KEY is set
    const { answer } = await explainProposal(no_key, "Why?");
    expect(typeof answer).toBe("string");
    expect(answer.length).toBeGreaterThan(5);
  });
});
