import { describe, expect, it } from "vitest";
import { csToolChoiceSchema } from "../src/agents/llm.js";

describe("CS tool choice schema", () => {
  it("accepts create_refund with amount", () => {
    const parsed = csToolChoiceSchema.parse({
      action: "create_refund",
      amount: 8,
      reasoning: "Partial refund for damaged goods.",
      confidence: 0.8,
    });
    expect(parsed.action).toBe("create_refund");
    expect(parsed.amount).toBe(8);
  });

  it("rejects unknown tools", () => {
    expect(() =>
      csToolChoiceSchema.parse({
        action: "wire_transfer",
        reasoning: "nope",
        confidence: 0.1,
      }),
    ).toThrow();
  });
});
