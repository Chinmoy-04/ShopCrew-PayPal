export interface DayPlan {
  messages: string[];
  stock?: Record<string, number>;
  competitorFactor?: { sku: string; factor: number };
  unclaimedSku?: string;
  priceNudge?: boolean;
}

const DAYS: Record<number, DayPlan> = {
  1: {
    messages: ["small-damage", "high-value-angry", "general-burn"],
    stock: { NIGHT: 3 },
    competitorFactor: { sku: "NIGHT", factor: 0.85 },
    unclaimedSku: "CITRUS",
    priceNudge: true,
  },
  2: { messages: ["late-mild", "wrong-item", "not-as-described"] },
  3: { messages: ["suspicious-empty-box", "general-wick", "scent-love"] },
  4: { messages: ["burn-tunnel", "gift-note", "allergic"] },
  5: { messages: ["abuse-repeat", "double-charge"] },
  6: { messages: ["budget-a", "budget-b", "budget-c", "budget-d", "budget-e", "budget-big"] },
  7: { messages: ["general-soot", "thank-you", "cold-throw"] },
};

export function planFor(day: number): DayPlan {
  return DAYS[day] ?? { messages: ["general-wick", "color-off"] };
}
