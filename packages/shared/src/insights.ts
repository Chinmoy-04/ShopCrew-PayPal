export const COMMITTED_STATUSES = [
  "confirmed",
  "submitted",
  "executing",
  "auto_approved",
] as const;
export interface InsightDecision {
  id: string;
  simDay: number;
  type: string;
  status: string;
  agent: string;
  amount: number | null;
  decidedBy?: string | null;
}
export function isCommitted(
  row: Pick<InsightDecision, "type" | "status">,
): boolean {
  return (
    ["refund", "payout"].includes(row.type) &&
    COMMITTED_STATUSES.some((status) => status === row.status)
  );
}
export function isPolicyApproved(
  row: Pick<InsightDecision, "decidedBy" | "status">,
): boolean {
  return (
    row.decidedBy === "policy" &&
    COMMITTED_STATUSES.some((status) => status === row.status)
  );
}
export function dailyInsights(
  rows: InsightDecision[],
  policies: { agent: string; dailyBudget: number }[],
  day: number,
) {
  const real = rows.filter((row) => row.id !== "pending-total");
  const today = real.filter((row) => row.simDay === day);
  const pending = real.filter((row) => row.status === "pending_approval");
  const committed =
    Math.round(
      today
        .filter(isCommitted)
        .reduce((sum, row) => sum + (row.amount ?? 0), 0) * 100,
    ) / 100;
  const budget = policies.reduce((sum, row) => sum + row.dailyBudget, 0);
  return {
    pendingAll: pending.length,
    pendingEarlier: pending.filter((row) => row.simDay < day).length,
    autoApproved: today.filter(isPolicyApproved).length,
    committed,
    budget,
    utilization: budget > 0 ? committed / budget : null,
    estimatedHours: Number((today.length * 0.15).toFixed(1)),
    decisions: today.length,
    agents: policies.map((policy) => ({
      agent: policy.agent,
      dailyBudget: policy.dailyBudget,
      spent: today
        .filter((row) => row.agent === policy.agent && isCommitted(row))
        .reduce((sum, row) => sum + (row.amount ?? 0), 0),
    })),
  };
}

/** Available-history daily totals, population standard deviation, inclusive threshold. */
export function refundAnomalies(
  refundRows: { day: number; amount: number }[],
  sigma = 2,
) {
  const totals = new Map<number, number>();
  for (const row of refundRows)
    totals.set(row.day, (totals.get(row.day) ?? 0) + row.amount);
  const days = [...totals.entries()].sort((a, b) => a[0] - b[0]);
  type Point = { day: number; amount: number; z: number };
  if (days.length < 3)
    return {
      spike: null as Point | null,
      series: days.map(([day, amount]) => ({ day, amount, z: 0 })),
      mean: 0,
      std: 0,
      sigma,
    };
  const mean = days.reduce((sum, [, amount]) => sum + amount, 0) / days.length;
  const std =
    Math.sqrt(
      days.reduce((sum, [, amount]) => sum + (amount - mean) ** 2, 0) /
        days.length,
    ) || 1;
  const series = days.map(([day, amount]) => ({
    day,
    amount,
    z: (amount - mean) / std,
  }));
  return {
    spike:
      series.filter((point) => point.z >= sigma).sort((a, b) => b.z - a.z)[0] ??
      null,
    series,
    mean,
    std,
    sigma,
  };
}
