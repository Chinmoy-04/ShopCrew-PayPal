import { money } from "@shopcrew/shared";
import { db } from "../db/client.js";
import {
  actions,
  competitorPrices,
  forecasts,
  orders,
  payouts,
  policies,
  products,
  proposals,
  purchaseOrders,
  refunds,
  salesDaily,
  simState,
  studioAiRuns,
  suppliers,
} from "../db/schema.js";
import { listOrderViews, listProposalViews } from "../db/views.js";
import { olsElasticity } from "../ml/elasticity.js";
import { holtWinters } from "../ml/holtWinters.js";
import { reorderPlan } from "../ml/reorder.js";

export async function inventoryRows() {
  const catalog = await db().select().from(products);
  const sales = await db().select().from(salesDaily);
  const rivals = await db().select().from(competitorPrices);
  return catalog.map((product) => {
    const series = sales.filter((row) => row.productId === product.id).sort((a, b) => a.simDay - b.simDay);
    const hw = holtWinters(series.map((row) => row.units));
    const fit = olsElasticity(series.map((row) => ({ price: row.price, units: row.units })));
    const daily = hw.forecast.slice(0, 7).reduce((sum, value) => sum + value, 0) / 7;
    const plan = reorderPlan({ stock: product.stock, daily, sigma: hw.sigma, leadTimeDays: product.leadTimeDays });
    const latest = Math.max(...rivals.filter((row) => row.productId === product.id).map((row) => row.simDay), -999);
    const competitorMin = Math.min(...rivals.filter((row) => row.productId === product.id && row.simDay === latest).map((row) => row.price));
    return {
      id: product.id,
      sku: product.sku,
      name: product.name,
      stock: product.stock,
      daysOfCover: Number(plan.daysOfCover.toFixed(1)),
      forecast: Number(daily.toFixed(2)),
      lower: Number((hw.lower[0] ?? 0).toFixed(2)),
      upper: Number((hw.upper[0] ?? 0).toFixed(2)),
      reorderPoint: Number(plan.reorderPoint.toFixed(1)),
      mape: Number(hw.mape.toFixed(3)),
      price: product.price,
      cost: product.cost,
      competitorMin: Number.isFinite(competitorMin) ? competitorMin : null,
      elasticity: Number(fit.elasticity.toFixed(2)),
      r2: Number(fit.r2.toFixed(2)),
      leadTimeDays: product.leadTimeDays,
      spark: series.slice(-28).map((row) => row.units),
      hue: product.hue,
    };
  });
}

export async function kpis() {
  const [sim] = await db().select().from(simState);
  const day = sim?.simDay ?? 0;
  const allOrders = await db().select().from(orders);
  const proposalRows = await db().select().from(proposals);
  const todayOrders = allOrders.filter((row) => row.simDay === day);
  const revenueToday = todayOrders.reduce((sum, row) => sum + row.total, 0);
  const decisions = proposalRows.filter((row) => row.simDay === day);
  const autoApproved = decisions.filter((row) => row.decidedBy === "policy" && ["confirmed", "submitted", "auto_approved", "executing"].includes(row.status)).length;
  const manualApproved = decisions.filter((row) => row.decidedBy === "owner").length;
  const pending = decisions.filter((row) => row.status === "pending_approval").length;
  const spend = decisions
    .filter((row) => ["payout", "refund"].includes(row.type) && ["confirmed", "submitted", "executing", "auto_approved"].includes(row.status))
    .reduce((sum, row) => sum + (row.amount ?? 0), 0);
  const policyRows = await db().select().from(policies);
  const budget = policyRows.reduce((sum, row) => sum + row.dailyBudget, 0);
  return {
    simDay: day,
    revenueToday: money(revenueToday),
    decisions: decisions.length,
    autoApproved,
    manualApproved,
    pending,
    spendToday: money(spend),
    budget,
    hoursSaved: Number((decisions.length * 0.15).toFixed(1)),
    summary: sim?.lastSummary ?? "",
    paused: sim?.pausedAll ?? false,
  };
}

export async function buildInsightsPayload() {
  const database = db();
  const [
    proposalRows,
    orderRows,
    inv,
    kpi,
    policyRows,
    payoutTable,
    pos,
    catalog,
    sales,
    refundRows,
    actionRows,
    studioRuns,
    supplierRows,
    forecastRows,
  ] = await Promise.all([
    listProposalViews(),
    listOrderViews(),
    inventoryRows(),
    kpis(),
    database.select().from(policies),
    database.select().from(payouts),
    database.select().from(purchaseOrders),
    database.select().from(products),
    database.select().from(salesDaily),
    database.select().from(refunds),
    database.select().from(actions),
    database.select().from(studioAiRuns),
    database.select().from(suppliers),
    database.select().from(forecasts),
  ]);

  const pathByProposal = new Map<string, string>();
  for (const row of proposalRows) {
    if (row.executionPath) pathByProposal.set(row.id, row.executionPath);
  }
  for (const action of actionRows) {
    const resp = action.responseJson as { executionPath?: string } | null;
    if (resp?.executionPath) pathByProposal.set(action.proposalId, resp.executionPath);
  }

  const salesBySkuDay = sales.map((row) => {
    const product = catalog.find((p) => p.id === row.productId);
    const fc = forecastRows.find((f) => f.productId === row.productId && f.simDay === row.simDay);
    const yhat = (fc?.yhatJson as number[] | undefined)?.[0];
    const lo = (fc?.loJson as number[] | undefined)?.[0];
    const hi = (fc?.hiJson as number[] | undefined)?.[0];
    return {
      id: row.id,
      sku: product?.sku ?? "",
      day: row.simDay,
      units: row.units,
      revenue: row.revenue,
      price: row.price,
      forecast: yhat ?? null,
      lower: lo ?? null,
      upper: hi ?? null,
    };
  });

  const refundSource = refundRows.map((row) => {
    const prop = proposalRows.find((p) => p.id === row.proposalId);
    return {
      id: row.id,
      order: row.orderId,
      amount: row.amount,
      status: row.status,
      day: prop?.simDay ?? 0,
      path: pathByProposal.get(row.proposalId) ?? (String(row.paypalRefundId ?? "").startsWith("DRY") ? "dry" : "toolkit"),
      agent: prop?.agent ?? "cs",
      proposalId: row.proposalId,
    };
  });

  const agentRunMap = new Map<string, { agent: string; day: number; decisions: number; spend: number }>();
  for (const row of proposalRows) {
    const key = `${row.agent}:${row.simDay}`;
    const cur = agentRunMap.get(key) ?? { agent: row.agent, day: row.simDay, decisions: 0, spend: 0 };
    cur.decisions += 1;
    if (["refund", "payout"].includes(row.type) && ["confirmed", "submitted", "auto_approved"].includes(row.status)) {
      cur.spend += row.amount ?? 0;
    }
    agentRunMap.set(key, cur);
  }
  const agentRuns = [...agentRunMap.values()].map((row) => ({
    id: `${row.agent}-${row.day}`,
    ...row,
    spend: money(row.spend),
  }));

  const budgetBurn = policyRows.map((policy) => {
    const spend = proposalRows
      .filter(
        (p) =>
          p.agent === policy.agent &&
          ["confirmed", "submitted", "auto_approved"].includes(p.status) &&
          ["refund", "payout"].includes(p.type),
      )
      .reduce((sum, p) => sum + (p.amount ?? 0), 0);
    const pending = proposalRows
      .filter((p) => p.agent === policy.agent && p.status === "pending_approval")
      .reduce((sum, p) => sum + (p.amount ?? 0), 0);
    return {
      agent: policy.agent,
      spent: money(spend),
      pending: money(pending),
      dailyBudget: policy.dailyBudget,
      burnPct: policy.dailyBudget > 0 ? spend / policy.dailyBudget : 0,
    };
  });

  const negotiations = pos
    .filter((po) => Array.isArray(po.negotiationJson) && (po.negotiationJson as unknown[]).length)
    .map((po) => {
      const product = catalog.find((p) => p.id === po.productId);
      const supplier = supplierRows.find((s) => s.id === po.supplierId);
      const transcript = po.negotiationJson as { unitCost?: number; round?: number }[];
      const list = transcript[0]?.unitCost ?? po.unitCost;
      const final = po.unitCost;
      const saving = money(Math.max(0, (list - final) * po.qty));
      return {
        id: po.id,
        supplier: supplier?.name ?? po.supplierId,
        sku: product?.sku ?? "",
        saving,
        rounds: transcript.length,
        listUnitCost: list,
        finalUnitCost: final,
        qty: po.qty,
      };
    });

  const payoutViews = payoutTable.map((row) => {
    const po = pos.find((item) => item.id === row.purchaseOrderId);
    const product = catalog.find((item) => item.id === po?.productId);
    return {
      id: row.id,
      amount: row.amount,
      status: row.status,
      receiver: row.receiver,
      sku: product?.sku ?? "",
      createdAt: row.createdAt,
    };
  });

  const studioAi = studioRuns.map((row) => ({
    id: row.id,
    threadId: row.threadId,
    runId: row.runId,
    agentId: row.agentId,
    query: row.query ?? "",
    status: row.status,
    toolCalls: (row.toolCallsJson as unknown[]) ?? [],
    usage: row.usageJson ?? {},
    error: row.error,
    createdAt: row.createdAt,
    finishedAt: row.finishedAt,
  }));

  return {
    kpis: { ...kpi, budgetBurn },
    policies: policyRows,
    proposals: proposalRows,
    orders: orderRows,
    inventory: inv,
    payouts: payoutViews,
    salesDaily: salesBySkuDay,
    refunds: refundSource,
    agentRuns,
    negotiations,
    studioAiRuns: studioAi,
  };
}

export { refundAnomalies } from "@shopcrew/shared";
