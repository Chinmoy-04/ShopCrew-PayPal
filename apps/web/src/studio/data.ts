import type { AgDataSourcesDefinition, AgFieldDefinition, AgFormat } from "ag-studio";
import type { InventoryRow, Kpis, OrderRow, Policy, Proposal } from "../api/client";

type FieldSpec = [id: string, name: string, format: AgFormat, hide?: boolean];

function fields(specs: FieldSpec[]): AgFieldDefinition[] {
  return specs.map(([id, name, format, hide]) => ({ id, name, format, ...(hide ? { hide: true } : {}) }));
}

export interface InsightsPayload {
  kpis: Kpis;
  policies: Policy[];
  proposals: Proposal[];
  orders: OrderRow[];
  inventory: InventoryRow[];
  payouts: { id: string; amount: number; status: string; receiver: string; sku: string; createdAt: string }[];
}

export function buildStudioData(payload: InsightsPayload): AgDataSourcesDefinition {
  const decisions = payload.proposals
    .filter((row) => row.id !== "pending-total")
    .map((row) => ({
      id: row.id,
      day: row.simDay,
      agent: row.agent,
      type: row.type,
      status: row.status,
      amount: row.amount ?? 0,
      summary: row.summary,
      reason: row.reason ?? "",
      decidedBy: row.decidedBy ?? "",
      risk: row.riskScore ?? 0,
      confidence: row.confidenceModel ?? 0,
      movesMoney: ["refund", "payout"].includes(row.type) ? "yes" : "no",
    }));

  const orders = payload.orders.map((row) => ({
    id: row.id,
    day: row.simDay,
    customer: row.customer,
    source: row.source,
    status: row.status,
    total: row.total,
    refunded: row.refundedTotal,
    createdAt: row.createdAt.slice(0, 10),
  }));

  const inventory = payload.inventory.map((row) => ({
    sku: row.sku,
    name: row.name,
    stock: row.stock,
    daysOfCover: row.daysOfCover >= 900 ? null : row.daysOfCover,
    forecast: row.forecast,
    reorderPoint: row.reorderPoint,
    price: row.price,
    leadTimeDays: row.leadTimeDays,
    needsReorder: row.stock < row.reorderPoint ? "yes" : "no",
  }));

  const payouts = payload.payouts.map((row) => ({
    id: row.id,
    amount: row.amount,
    status: row.status,
    receiver: row.receiver,
    sku: row.sku,
    createdAt: row.createdAt.slice(0, 10),
  }));

  const snapshot = [{
    id: "today",
    simDay: payload.kpis.simDay,
    revenueToday: payload.kpis.revenueToday,
    decisions: payload.kpis.decisions,
    autoApproved: payload.kpis.autoApproved,
    manualApproved: payload.kpis.manualApproved,
    pending: payload.kpis.pending,
    spendToday: payload.kpis.spendToday,
    budget: payload.kpis.budget,
    hoursSaved: payload.kpis.hoursSaved,
    budgetUsedPct: payload.kpis.budget > 0 ? payload.kpis.spendToday / payload.kpis.budget : 0,
  }];

  const policies = payload.policies.map((row) => ({
    agent: row.agent,
    enabled: row.enabled ? "on" : "off",
    autoApproveMax: row.autoApproveMax,
    dailyBudget: row.dailyBudget,
  }));

  return {
    description:
      "ShopCrew control-room data: AI agent decisions (refunds, replies, payouts, price changes), " +
      "shop orders, inventory cover, supplier payouts, and today's KPI snapshot. " +
      "Money amounts are USD. Advance a day in the Control room to generate more rows.",
    sources: [
      {
        id: "decisions",
        name: "Agent decisions",
        description: "Every proposal the CS, inventory, and pricing agents made. Replies do not move money.",
        data: decisions,
        fields: fields([
          ["id", "Decision ID", "textFormat", true],
          ["day", "Sim day", "integerFormat"],
          ["agent", "Agent", "textFormat"],
          ["type", "Type", "textFormat"],
          ["status", "Status", "textFormat"],
          ["amount", "Amount", "currencyFormat"],
          ["summary", "Summary", "textFormat"],
          ["reason", "Reason", "textFormat"],
          ["decidedBy", "Decided by", "textFormat"],
          ["risk", "Risk score", "decimalFormat"],
          ["confidence", "Model confidence", "percentageFormat"],
          ["movesMoney", "Moves money", "textFormat"],
        ]),
      },
      {
        id: "orders",
        name: "Orders",
        description: "Shop orders from simulation and live PayPal sandbox checkouts.",
        data: orders,
        fields: fields([
          ["id", "Order ID", "textFormat", true],
          ["day", "Sim day", "integerFormat"],
          ["customer", "Customer", "textFormat"],
          ["source", "Source", "textFormat"],
          ["status", "Order status", "textFormat"],
          ["total", "Order total", "currencyFormat"],
          ["refunded", "Refunded", "currencyFormat"],
          ["createdAt", "Order date", "dateFormat"],
        ]),
      },
      {
        id: "inventory",
        name: "Inventory",
        description: "SKU stock, forecast cover, and reorder flags.",
        data: inventory,
        fields: fields([
          ["sku", "SKU", "textFormat"],
          ["name", "Product", "textFormat"],
          ["stock", "Stock", "integerFormat"],
          ["daysOfCover", "Days of cover", "decimalFormat"],
          ["forecast", "Forecast / day", "decimalFormat"],
          ["reorderPoint", "Reorder point", "decimalFormat"],
          ["price", "Price", "currencyFormat"],
          ["leadTimeDays", "Lead time", "integerFormat"],
          ["needsReorder", "Needs reorder", "textFormat"],
        ]),
      },
      {
        id: "payouts",
        name: "Supplier payouts",
        description: "PayPal Payouts to suppliers after inventory negotiation.",
        data: payouts,
        fields: fields([
          ["id", "Payout ID", "textFormat", true],
          ["amount", "Payout amount", "currencyFormat"],
          ["status", "Payout status", "textFormat"],
          ["receiver", "Receiver", "textFormat"],
          ["sku", "SKU", "textFormat"],
          ["createdAt", "Payout date", "dateFormat"],
        ]),
      },
      {
        id: "snapshot",
        name: "Today snapshot",
        description: "Single-row KPI snapshot for the current sim day.",
        data: snapshot,
        fields: fields([
          ["id", "Snapshot ID", "textFormat", true],
          ["simDay", "Sim day", "integerFormat"],
          ["revenueToday", "Revenue today", "currencyFormat"],
          ["decisions", "Decisions", "integerFormat"],
          ["autoApproved", "Auto-approved", "integerFormat"],
          ["manualApproved", "Manual-approved", "integerFormat"],
          ["pending", "Pending", "integerFormat"],
          ["spendToday", "Spend today", "currencyFormat"],
          ["budget", "Daily budget", "currencyFormat"],
          ["hoursSaved", "Hours saved", "decimalFormat"],
          ["budgetUsedPct", "Budget used", "percentageFormat"],
        ]),
      },
      {
        id: "policies",
        name: "Policies",
        description: "Auto-approve limits and daily budgets per agent.",
        data: policies,
        fields: fields([
          ["agent", "Agent", "textFormat"],
          ["enabled", "Enabled", "textFormat"],
          ["autoApproveMax", "Auto-approve max", "currencyFormat"],
          ["dailyBudget", "Daily budget", "currencyFormat"],
        ]),
      },
    ],
  };
}
