import { describe, expect, it } from "vitest";
import { evaluatePolicy } from "../src/policy/engine.js";

const base = {
  agent: "cs" as const,
  type: "refund" as const,
  amount: 8,
  pausedAll: false,
  agentEnabled: true,
  autoApproveMax: 15,
  dailyBudget: 150,
  spentToday: 0,
  maxPctOfOrder: 0.5,
  maxPriceChangePct: 20,
  minMarginPct: 25,
  autoApprovePct: 5,
  orderTotal: 36,
  refundedAlready: 0,
  customerRefunds30d: 0,
};

describe("policy engine", () => {
  it("auto-approves a small refund", () => {
    expect(evaluatePolicy(base).decision).toBe("auto_approved");
  });

  it("holds a refund over the threshold", () => {
    expect(evaluatePolicy({ ...base, amount: 45, orderTotal: 45 }).decision).toBe("pending_approval");
  });

  it("holds repeat refunders", () => {
    expect(evaluatePolicy({ ...base, customerRefunds30d: 3 }).decision).toBe("pending_approval");
  });

  it("blocks a refund past the daily budget", () => {
    expect(evaluatePolicy({ ...base, amount: 20, orderTotal: 80, spentToday: 140 }).decision).toBe("blocked");
  });

  it("blocks a discount that breaks the margin floor", () => {
    expect(
      evaluatePolicy({
        ...base,
        agent: "pricing",
        type: "price_change",
        amount: 0,
        priceChangePct: -10,
        marginPct: 10,
      }).decision,
    ).toBe("blocked");
  });

  it("auto-approves a small price change", () => {
    expect(
      evaluatePolicy({
        ...base,
        agent: "pricing",
        type: "price_change",
        amount: 0,
        priceChangePct: 4,
        marginPct: 40,
      }).decision,
    ).toBe("auto_approved");
  });

  it("blocks everything when paused", () => {
    expect(evaluatePolicy({ ...base, pausedAll: true }).decision).toBe("blocked");
  });
});
