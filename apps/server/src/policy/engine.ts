import type { AgentId, PolicyDecision, PolicyResult, ProposalType } from "@shopcrew/shared";

export interface PolicyInput {
  agent: AgentId;
  type: ProposalType;
  amount: number;
  pausedAll: boolean;
  agentEnabled: boolean;
  autoApproveMax: number;
  dailyBudget: number;
  spentToday: number;
  maxPctOfOrder: number;
  maxPriceChangePct: number;
  minMarginPct: number;
  autoApprovePct: number;
  orderTotal?: number;
  refundedAlready?: number;
  customerRefunds30d?: number;
  priceChangePct?: number;
  marginPct?: number;
  supplierPreferred?: boolean;
  suspicious?: boolean;
}

function riskFor(input: PolicyInput): number {
  const ratio = input.autoApproveMax > 0 ? input.amount / input.autoApproveMax : 0.4;
  return Math.round(Math.min(95, ratio * 40 + (input.suspicious ? 30 : 10)));
}

function done(decision: PolicyDecision, reasons: string[], risk: number): PolicyResult {
  return { decision, reasons, risk };
}

export function evaluatePolicy(input: PolicyInput): PolicyResult {
  if (input.pausedAll) return done("blocked", ["All agents are paused."], 90);
  if (!input.agentEnabled) return done("blocked", [`The ${input.agent} agent is disabled.`], 80);

  const spend = input.spentToday + Math.max(0, input.amount);
  if (input.dailyBudget > 0 && input.type !== "reply" && input.type !== "price_change" && spend > input.dailyBudget + 0.001) {
    return done("blocked", [`Daily budget $${input.dailyBudget.toFixed(2)} would be exceeded ($${spend.toFixed(2)}).`], 88);
  }

  if (input.type === "refund") {
    const remaining = (input.orderTotal ?? 0) - (input.refundedAlready ?? 0);
    if (input.amount > remaining + 0.001) {
      return done("blocked", ["Refund is larger than the remaining captured amount."], 95);
    }
    if ((input.customerRefunds30d ?? 0) > 2) {
      return done("pending_approval", ["This customer already has more than 2 refunds in 30 days."], 72);
    }
    if (input.suspicious) {
      return done("pending_approval", ["The message looks suspicious, so a person should decide."], 76);
    }
    const pct = input.orderTotal ? input.amount / input.orderTotal : 1;
    if (input.amount <= input.autoApproveMax + 0.001 && pct <= input.maxPctOfOrder + 0.001) {
      return done("auto_approved", [`Under $${input.autoApproveMax.toFixed(0)} and within ${Math.round(input.maxPctOfOrder * 100)}% of the order.`], riskFor(input));
    }
    return done("pending_approval", ["Above the auto-approve threshold."], Math.max(riskFor(input), 55));
  }

  if (input.type === "payout" || input.type === "purchase_order") {
    if (input.supplierPreferred && input.amount <= input.autoApproveMax + 0.001) {
      return done("auto_approved", [`Preferred supplier and at or under $${input.autoApproveMax.toFixed(0)}.`], riskFor(input));
    }
    return done("pending_approval", ["Supplier payment needs the owner's approval."], Math.max(riskFor(input), 48));
  }

  if (input.type === "price_change") {
    const pct = Math.abs(input.priceChangePct ?? 0);
    if (pct > input.maxPriceChangePct + 0.001) {
      return done("blocked", [`A ${pct.toFixed(1)}% move is over the ${input.maxPriceChangePct}% cap.`], 82);
    }
    if ((input.marginPct ?? 100) + 0.001 < input.minMarginPct) {
      return done("blocked", [`Margin would be ${(input.marginPct ?? 0).toFixed(1)}%, under the ${input.minMarginPct}% floor.`], 78);
    }
    if (pct <= input.autoApprovePct + 0.001) {
      return done("auto_approved", [`Within the ${input.autoApprovePct}% auto-approve band.`], riskFor(input));
    }
    return done("pending_approval", ["Price change is outside the auto-approve band."], Math.max(riskFor(input), 45));
  }

  return done("auto_approved", ["Replies do not move money."], 8);
}
