import type { AgDataSourcesDefinition, AgFieldDefinition, AgFormat, AgRelationDefinition } from "ag-studio";
import type { InventoryRow, Kpis, OrderRow, Policy, Proposal } from "../api/client";

type FieldSpec = [id: string, name: string, format: AgFormat, hide?: boolean, description?: string];

function fields(specs: FieldSpec[]): AgFieldDefinition[] {
  return specs.map(([id, name, format, hide, description]) => ({
    id,
    name,
    format,
    ...(hide ? { hide: true } : {}),
    ...(description ? { description } : {}),
  }));
}

export interface InsightsPayload {
  kpis: Kpis & {
    budgetBurn?: { agent: string; spent: number; pending: number; dailyBudget: number; burnPct: number }[];
  };
  policies: Policy[];
  proposals: Proposal[];
  orders: OrderRow[];
  inventory: InventoryRow[];
  payouts: { id: string; amount: number; status: string; receiver: string; sku: string; createdAt: string }[];
  salesDaily?: {
    id: string;
    sku: string;
    day: number;
    units: number;
    revenue: number;
    price: number;
    forecast: number | null;
    lower: number | null;
    upper: number | null;
  }[];
  refunds?: {
    id: string;
    order: string;
    amount: number;
    status: string;
    day: number;
    path: string;
    agent: string;
    proposalId: string;
  }[];
  agentRuns?: { id: string; agent: string; day: number; decisions: number; spend: number }[];
  negotiations?: {
    id: string;
    supplier: string;
    sku: string;
    saving: number;
    rounds: number;
    listUnitCost: number;
    finalUnitCost: number;
    qty: number;
  }[];
  studioAiRuns?: {
    id: string;
    threadId: string;
    runId: string;
    agentId: string;
    query: string;
    status: string;
    toolCalls: unknown[];
    usage: unknown;
    error: string | null;
    createdAt: string;
    finishedAt: string | null;
  }[];
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
      simulated: (row.inputs as { simulated?: boolean } | null)?.simulated ? "yes" : "no",
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

  const burn = payload.kpis.budgetBurn ?? [];
  const avgBurn =
    burn.length > 0 ? burn.reduce((sum, row) => sum + row.burnPct, 0) / burn.length : payload.kpis.budget > 0 ? payload.kpis.spendToday / payload.kpis.budget : 0;

  const snapshot = [
    {
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
      budgetUsedPct: avgBurn,
      brief: payload.kpis.summary || "ShopCrew Insights — advance a day in the control room to generate live decisions.",
    },
  ];

  const policies = payload.policies.map((row) => ({
    agent: row.agent,
    enabled: row.enabled ? "on" : "off",
    autoApproveMax: row.autoApproveMax,
    dailyBudget: row.dailyBudget,
  }));

  const budgetBurn = burn.map((row) => ({
    agent: row.agent,
    spent: row.spent,
    pending: row.pending,
    dailyBudget: row.dailyBudget,
    burnPct: row.burnPct,
  }));

  const sales = (payload.salesDaily ?? []).map((row) => ({ ...row }));
  const refunds = (payload.refunds ?? []).map((row) => ({ ...row }));
  const agentRuns = (payload.agentRuns ?? []).map((row) => ({ ...row }));
  const negotiations = (payload.negotiations ?? []).map((row) => ({ ...row }));
  const studioAiRuns = (payload.studioAiRuns ?? []).map((row) => ({
    id: row.id,
    threadId: row.threadId,
    runId: row.runId,
    agentId: row.agentId,
    query: row.query,
    status: row.status,
    toolCount: Array.isArray(row.toolCalls) ? row.toolCalls.length : 0,
    createdAt: row.createdAt.slice(0, 19).replace("T", " "),
    finishedAt: row.finishedAt ? row.finishedAt.slice(0, 19).replace("T", " ") : "",
  }));

  const relations: AgRelationDefinition[] = [
    {
      id: "refunds-to-orders",
      type: "many-to-one",
      source: { tableId: "refunds", fieldId: "order" },
      target: { tableId: "orders", fieldId: "id" },
    },
    {
      id: "decisions-to-policies",
      type: "many-to-one",
      source: { tableId: "decisions", fieldId: "agent" },
      target: { tableId: "policies", fieldId: "agent" },
    },
    {
      id: "sales-to-inventory",
      type: "many-to-one",
      source: { tableId: "sales_daily", fieldId: "sku" },
      target: { tableId: "inventory", fieldId: "sku" },
    },
  ];

  return {
    description:
      "ShopCrew control-room data: AI agent decisions, refunds, sales history, inventory cover, supplier payouts, negotiations, Studio AI activity, and today's KPI snapshot. Money amounts are USD. Sim day is the shop clock.",
    relationships: relations,
    sources: [
      {
        id: "decisions",
        name: "Agent decisions",
        description: "Every proposal the CS, inventory, pricing, and supplier agents made. Includes seeded simulated history.",
        data: decisions,
        fields: fields([
          ["id", "Decision ID", "textFormat", true, "Unique proposal id"],
          ["day", "Sim day", "integerFormat", false, "Simulation day of the proposal"],
          ["agent", "Agent", "textFormat", false, "Owning agent id"],
          ["type", "Type", "textFormat", false, "refund, payout, price_change, discount, reply"],
          ["status", "Status", "textFormat", false, "Policy / execution status"],
          ["amount", "Amount", "currencyFormat", false, "USD amount proposed"],
          ["summary", "Summary", "textFormat", false, "One-line owner-facing summary"],
          ["reason", "Reason", "textFormat", false, "Complaint or pricing reason"],
          ["decidedBy", "Decided by", "textFormat", false, "policy or owner"],
          ["risk", "Risk score", "decimalFormat", false, "0–100 risk"],
          ["confidence", "Model confidence", "percentageFormat", false, "Model confidence 0–1"],
          ["movesMoney", "Moves money", "textFormat", false, "yes if refund or payout"],
          ["simulated", "Simulated", "textFormat", false, "yes if seeded history"],
        ]),
      },
      {
        id: "orders",
        name: "Orders",
        description: "Shop orders from simulation and live PayPal sandbox checkouts.",
        data: orders,
        fields: fields([
          ["id", "Order ID", "textFormat", true, "Order id"],
          ["day", "Sim day", "integerFormat", false, "Sim day"],
          ["customer", "Customer", "textFormat", false, "Customer name"],
          ["source", "Source", "textFormat", false, "paypal or other"],
          ["status", "Order status", "textFormat", false, "CAPTURED etc."],
          ["total", "Order total", "currencyFormat", false, "USD total"],
          ["refunded", "Refunded", "currencyFormat", false, "USD refunded so far"],
          ["createdAt", "Order date", "dateFormat", false, "ISO date"],
        ]),
      },
      {
        id: "inventory",
        name: "Inventory",
        description: "SKU stock, forecast cover, and reorder flags.",
        data: inventory,
        fields: fields([
          ["sku", "SKU", "textFormat", false, "Product SKU"],
          ["name", "Product", "textFormat", false, "Product name"],
          ["stock", "Stock", "integerFormat", false, "Units on hand"],
          ["daysOfCover", "Days of cover", "decimalFormat", false, "Cover at forecast demand"],
          ["forecast", "Forecast / day", "decimalFormat", false, "Forecast units per day"],
          ["reorderPoint", "Reorder point", "decimalFormat", false, "Reorder threshold"],
          ["price", "Price", "currencyFormat", false, "Shelf price"],
          ["leadTimeDays", "Lead time", "integerFormat", false, "Supplier lead time days"],
          ["needsReorder", "Needs reorder", "textFormat", false, "yes/no"],
        ]),
      },
      {
        id: "payouts",
        name: "Supplier payouts",
        description: "PayPal Payouts to suppliers after inventory negotiation.",
        data: payouts,
        fields: fields([
          ["id", "Payout ID", "textFormat", true, "Payout id"],
          ["amount", "Payout amount", "currencyFormat", false, "USD amount"],
          ["status", "Payout status", "textFormat", false, "SUCCESS, UNCLAIMED, etc."],
          ["receiver", "Receiver", "textFormat", false, "PayPal email"],
          ["sku", "SKU", "textFormat", false, "Related SKU"],
          ["createdAt", "Payout date", "dateFormat", false, "Created date"],
        ]),
      },
      {
        id: "snapshot",
        name: "Today snapshot",
        description: "Single-row KPI snapshot for the current sim day, including per-agent average burn.",
        data: snapshot,
        fields: fields([
          ["id", "Snapshot ID", "textFormat", true, "Always today"],
          ["simDay", "Sim day", "integerFormat", false, "Current sim day"],
          ["revenueToday", "Revenue today", "currencyFormat", false, "Order revenue today"],
          ["decisions", "Decisions", "integerFormat", false, "Decision count today"],
          ["autoApproved", "Auto-approved", "integerFormat", false, "Auto-approved count"],
          ["manualApproved", "Manual-approved", "integerFormat", false, "Owner approvals"],
          ["pending", "Pending", "integerFormat", false, "Awaiting owner"],
          ["spendToday", "Spend today", "currencyFormat", false, "Refund+payout spend"],
          ["budget", "Daily budget", "currencyFormat", false, "Sum of agent budgets"],
          ["hoursSaved", "Hours saved", "decimalFormat", false, "Estimated hours"],
          ["budgetUsedPct", "Budget used", "percentageFormat", false, "Average per-agent burn"],
          ["brief", "Brief", "textFormat", false, "Live operations brief text"],
        ]),
      },
      {
        id: "policies",
        name: "Policies",
        description: "Auto-approve limits and daily budgets per agent.",
        data: policies,
        fields: fields([
          ["agent", "Agent", "textFormat", false, "Agent id"],
          ["enabled", "Enabled", "textFormat", false, "on/off"],
          ["autoApproveMax", "Auto-approve max", "currencyFormat", false, "Auto-approve ceiling"],
          ["dailyBudget", "Daily budget", "currencyFormat", false, "Daily spend budget"],
        ]),
      },
      {
        id: "sales_daily",
        name: "Sales daily",
        description: "180 days of units, revenue, price and forecast bands by SKU.",
        data: sales,
        fields: fields([
          ["id", "Row ID", "textFormat", true, "Sale row id"],
          ["sku", "SKU", "textFormat", false, "Product SKU"],
          ["day", "Sim day", "integerFormat", false, "Historical sim day"],
          ["units", "Units", "integerFormat", false, "Units sold"],
          ["revenue", "Revenue", "currencyFormat", false, "Revenue USD"],
          ["price", "Price", "currencyFormat", false, "Price that day"],
          ["forecast", "Forecast", "decimalFormat", false, "Forecast units"],
          ["lower", "Lower band", "decimalFormat", false, "Forecast lower"],
          ["upper", "Upper band", "decimalFormat", false, "Forecast upper"],
        ]),
      },
      {
        id: "refunds",
        name: "Refunds",
        description: "Refund dollars by day with toolkit/REST/dry execution path.",
        data: refunds,
        fields: fields([
          ["id", "Refund ID", "textFormat", true, "Refund row id"],
          ["order", "Order", "textFormat", false, "Order id"],
          ["amount", "Amount", "currencyFormat", false, "USD refunded"],
          ["status", "Status", "textFormat", false, "Refund status"],
          ["day", "Sim day", "integerFormat", false, "Sim day"],
          ["path", "Path", "textFormat", false, "toolkit, rest, dry, dry_exhausted"],
          ["agent", "Agent", "textFormat", false, "Usually cs"],
          ["proposalId", "Proposal", "textFormat", true, "Linked proposal"],
        ]),
      },
      {
        id: "agent_runs",
        name: "Agent runs",
        description: "Decisions and spend per agent per sim day.",
        data: agentRuns,
        fields: fields([
          ["id", "Run ID", "textFormat", true, "agent-day key"],
          ["agent", "Agent", "textFormat", false, "Agent id"],
          ["day", "Sim day", "integerFormat", false, "Sim day"],
          ["decisions", "Decisions", "integerFormat", false, "Proposal count"],
          ["spend", "Spend", "currencyFormat", false, "Confirmed money moved"],
        ]),
      },
      {
        id: "budget_burn",
        name: "Budget burn",
        description: "Per-agent spent, pending exposure, and daily budget.",
        data: budgetBurn,
        fields: fields([
          ["agent", "Agent", "textFormat", false, "Agent id"],
          ["spent", "Spent", "currencyFormat", false, "Confirmed spend"],
          ["pending", "Pending", "currencyFormat", false, "Pending exposure"],
          ["dailyBudget", "Daily budget", "currencyFormat", false, "Budget"],
          ["burnPct", "Burn %", "percentageFormat", false, "spent / budget"],
        ]),
      },
      {
        id: "negotiations",
        name: "Negotiations",
        description: "Supplier negotiation savings vs opening list price.",
        data: negotiations,
        fields: fields([
          ["id", "PO ID", "textFormat", true, "Purchase order id"],
          ["supplier", "Supplier", "textFormat", false, "Supplier name"],
          ["sku", "SKU", "textFormat", false, "SKU"],
          ["saving", "Saving", "currencyFormat", false, "USD saved vs list"],
          ["rounds", "Rounds", "integerFormat", false, "Negotiation rounds"],
          ["listUnitCost", "List unit cost", "currencyFormat", false, "Opening unit cost"],
          ["finalUnitCost", "Final unit cost", "currencyFormat", false, "Agreed unit cost"],
          ["qty", "Qty", "integerFormat", false, "Units ordered"],
        ]),
      },
      {
        id: "studio_ai_runs",
        name: "Studio AI activity",
        description: "Custom Studio agent runs with tool-call counts.",
        data: studioAiRuns,
        fields: fields([
          ["id", "Row ID", "textFormat", true, "Run row id"],
          ["threadId", "Thread", "textFormat", false, "Chat thread id"],
          ["runId", "Run", "textFormat", false, "Run id"],
          ["agentId", "Agent", "textFormat", false, "Studio agent id"],
          ["query", "Query", "textFormat", false, "User prompt"],
          ["status", "Status", "textFormat", false, "ok / error / cancelled"],
          ["toolCount", "Tool calls", "integerFormat", false, "Number of tool calls"],
          ["createdAt", "Started", "textFormat", false, "Start time"],
          ["finishedAt", "Finished", "textFormat", false, "End time"],
        ]),
      },
    ],
  };
}
