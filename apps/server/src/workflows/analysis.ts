import { z } from "zod";
import { holtWinters } from "../ml/holtWinters.js";

export const snapshotSchema = z.object({
  simDay: z.number().int(),
  capturedAt: z.string().datetime(),
  products: z.array(z.object({
    sku: z.string(), stock: z.number(), leadTimeDays: z.number(),
    sales: z.array(z.number().nonnegative()),
  })),
  spend: z.array(z.object({ agent: z.string(), amount: z.number(), budget: z.number() })),
  pendingApprovals: z.number().int().nonnegative(),
});
export type OperationsSnapshot = z.infer<typeof snapshotSchema>;

export function analyzeInventory(snapshot: OperationsSnapshot) {
  return snapshot.products.map((product) => {
    const forecast = holtWinters(product.sales, 7).forecast;
    const daily = forecast.reduce((sum, n) => sum + n, 0) / Math.max(1, forecast.length);
    const daysOfCover = daily > 0 ? product.stock / daily : null;
    return {
      sku: product.sku, dailyForecast: Number(daily.toFixed(2)),
      daysOfCover: daysOfCover === null ? null : Number(daysOfCover.toFixed(2)),
      atRisk: daysOfCover !== null && daysOfCover < product.leadTimeDays + 2,
    };
  });
}

export function analyzeSpending(snapshot: OperationsSnapshot) {
  return snapshot.spend.map((row) => ({
    ...row, remaining: Number((row.budget - row.amount).toFixed(2)),
    nearLimit: row.budget > 0 && row.amount >= row.budget * 0.8,
  }));
}

export const reportSchema = z.object({
  requestId: z.string().uuid(), simDay: z.number().int(), capturedAt: z.string().datetime(),
  inventory: z.array(z.object({ sku: z.string(), dailyForecast: z.number(), daysOfCover: z.number().nullable(), atRisk: z.boolean() })),
  spending: z.array(z.object({ agent: z.string(), amount: z.number(), budget: z.number(), remaining: z.number(), nearLimit: z.boolean() })),
  pendingApprovals: z.number().int().nonnegative(), summary: z.string().max(2000),
});

export function buildReport(requestId: string, snapshot: OperationsSnapshot,
  inventory: ReturnType<typeof analyzeInventory>, spending: ReturnType<typeof analyzeSpending>) {
  const risk = inventory.filter((row) => row.atRisk).map((row) => row.sku);
  const budgets = spending.filter((row) => row.nearLimit).map((row) => row.agent);
  return reportSchema.parse({
    requestId, simDay: snapshot.simDay, capturedAt: snapshot.capturedAt,
    inventory, spending, pendingApprovals: snapshot.pendingApprovals,
    summary: `Day ${snapshot.simDay}: ${risk.length ? `restock risk for ${risk.join(", ")}` : "no immediate restock risk"}; ${budgets.length ? `budget attention for ${budgets.join(", ")}` : "spending within budget bands"}; ${snapshot.pendingApprovals} decisions await owner approval.`,
  });
}
