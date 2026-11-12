import type {
  AgPageState,
  AgReportState,
  AgWidgetLayoutState,
} from "ag-studio";
import type { ShopCrewRegistry } from "./registry";

const at = (
  xTrack: number,
  yTrack: number,
  xSpan: number,
  ySpan: number,
): AgWidgetLayoutState => ({
  xTrack,
  yTrack,
  xSpan,
  ySpan,
});

const title = (text: string) => ({ title: { enabled: true, text } });
const sum = (id: string) => ({ id, aggregation: "sum" as const });
const countd = (id: string) => ({ id, aggregation: "countd" as const });

const FONT = "Outfit, sans-serif";
const typography = (
  fontSize: number,
  fontWeight: "normal" | "bold" = "normal",
) => ({
  fontFamily: FONT,
  fontSize,
  fontWeight,
  fontStyle: "normal" as const,
});

const kpi = (
  text: string,
  value: { id: string; aggregation?: "sum" | "avg" | "countd" },
) => ({
  type: "value" as const,
  dataMapping: { value: [value] },
  format: {
    title: { enabled: true, text, typography: typography(13, "bold") },
    caption: { enabled: true, text: "", typography: typography(0) },
    style: { typography: typography(22, "bold") },
  },
});

const operations: AgPageState<ShopCrewRegistry> = {
  id: "operations",
  widgets: {
    brief: {
      type: "live-brief",
      dataMapping: { value: [{ id: "snapshot.brief" }] },
      format: { ...title("Live brief"), crossFilter: "none" },
    },
    "kpi-pending": {
      type: "daily-metric",
      dataMapping: { value: [sum("snapshot.pendingAll")] },
      format: {
        ...title("Needs review"),
        crossFilter: "none",
        style: { action: "pending" },
      },
    },
    "kpi-auto": {
      type: "daily-metric",
      dataMapping: { value: [sum("snapshot.policyApprovedToday")] },
      format: {
        ...title("Auto-approved today"),
        crossFilter: "none",
        style: { action: "auto", note: "Approved by policy" },
      },
    },
    "kpi-spend": {
      type: "daily-metric",
      dataMapping: { value: [sum("snapshot.committedToday")] },
      format: {
        ...title("Committed today"),
        crossFilter: "none",
        style: { action: "committed", note: "Refunds and payouts committed" },
      },
    },
    "kpi-hours": {
      type: "daily-metric",
      dataMapping: { value: [sum("snapshot.estimatedHours")] },
      format: {
        ...title("Estimated time saved today"),
        crossFilter: "none",
        style: { action: "today", note: "Hours · 0.15 per decision" },
      },
    },
    "status-stack": {
      type: "status-stack",
      dataMapping: {
        category: [{ id: "decisions.status" }],
        value: [countd("decisions.id")],
      },
      format: {
        ...title("Decision status · selected scope"),
        style: { barHeight: 18 },
      },
    },
    "budget-pulse": {
      type: "pulse-meter",
      dataMapping: {
        value: [{ id: "snapshot.budgetCommittedPct" }],
        amount: [{ id: "snapshot.committedToday" }],
        budget: [{ id: "snapshot.dailyBudget" }],
      },
      format: {
        ...title("Budget utilization today"),
        crossFilter: "none",
        style: { warnAt: 0.6, dangerAt: 0.85, valueFontSize: 40, unit: "%" },
      },
    },
    "agent-spend": {
      type: "column-chart-grouped",
      dataMapping: {
        categoryKey: [{ id: "decisions.agent" }],
        valueKey: [sum("decisions.amount")],
        legendKey: [{ id: "decisions.type" }],
      },
      format: {
        ...title("Proposed $ by agent and type"),
        style: { theme: { common: { legend: { enabled: true } } } },
      },
    },
    "decision-grid": {
      type: "grid",
      dataMapping: {
        cols: [
          { id: "decisions.id" },
          { id: "decisions.day" },
          { id: "decisions.agent" },
          { id: "decisions.type" },
          { id: "decisions.status" },
          { id: "decisions.summary" },
          { id: "decisions.amount" },
          { id: "decisions.movesMoney" },
        ],
      },
      sort: [{ field: { id: "decisions.day" }, direction: "desc" }],
      format: title("All agent decisions"),
    },
    "explorer-controls": {
      type: "explorer-controls",
      dataMapping: {},
      format: {
        title: { enabled: false, text: "Decision explorer" },
        crossFilter: "none",
      },
    },
  },
  widgetLayout: {
    brief: at(0, 0, 24, 5),
    "kpi-pending": at(0, 5, 6, 7),
    "kpi-auto": at(6, 5, 6, 7),
    "kpi-spend": at(12, 5, 6, 7),
    "kpi-hours": at(18, 5, 6, 7),
    "status-stack": at(0, 12, 16, 14),
    "budget-pulse": at(16, 12, 8, 14),
    "explorer-controls": at(0, 26, 24, 6),
    "agent-spend": at(0, 32, 24, 11),
    "decision-grid": at(0, 43, 24, 21),
  },
};

const money: AgPageState<ShopCrewRegistry> = {
  id: "money",
  widgets: {
    "kpi-revenue": kpi("Revenue today", sum("snapshot.revenueToday")),
    "kpi-order-total": kpi("Order total (all)", sum("orders.total")),
    "kpi-refunded": kpi("Refunded on orders", sum("orders.refunded")),
    "kpi-payouts": kpi("Supplier payouts", sum("payouts.amount")),
    "orders-by-source": {
      type: "donut-chart",
      dataMapping: {
        categoryKey: [{ id: "orders.source" }],
        valueKey: [sum("orders.total")],
      },
      format: {
        ...title("Order revenue by source"),
        style: {
          custom: {
            pieDataLabel: { enabled: true },
            totalLabel: { enabled: true },
          },
        },
      },
    },
    "orders-by-day": {
      type: "column-chart-grouped",
      dataMapping: {
        categoryKey: [{ id: "orders.day" }],
        valueKey: [sum("orders.total"), sum("orders.refunded")],
      },
      format: {
        ...title("Orders and refunds by sim day"),
        style: { theme: { common: { legend: { enabled: true } } } },
      },
    },
    "payout-grid": {
      type: "grid",
      dataMapping: {
        cols: [
          { id: "payouts.createdAt" },
          { id: "payouts.sku" },
          { id: "payouts.receiver" },
          { id: "payouts.status" },
          sum("payouts.amount"),
        ],
      },
      format: title("Supplier payouts"),
    },
    "budget-gauge": {
      type: "radial-gauge",
      dataMapping: { value: [{ id: "snapshot.budgetUsedPct" }] },
      format: {
        ...title("Budget used today"),
        style: {
          scaleLabel: { min: 0, max: 1 },
          label: { typography: typography(22, "bold") },
          secondaryLabel: {
            enabled: true,
            text: "of daily agent budget",
            typography: typography(12),
          },
        },
      },
    },
    "budget-pulse": {
      type: "pulse-meter",
      dataMapping: { value: [{ id: "snapshot.budgetUsedPct" }] },
      format: {
        ...title("Budget pulse"),
        style: { warnAt: 0.6, dangerAt: 0.85, valueFontSize: 32, unit: "%" },
      },
    },
    "payout-pipeline": {
      type: "payout-pipeline",
      dataMapping: {
        category: [{ id: "payouts.status" }],
        value: [sum("payouts.amount")],
      },
      format: title("Payout pipeline"),
    },
    "budget-burn": {
      type: "budget-burn",
      dataMapping: {
        category: [{ id: "daily_budget_burn.agent" }],
        value: [sum("daily_budget_burn.spent")],
        target: [sum("daily_budget_burn.dailyBudget")],
      },
      format: title("Per-agent budget burn"),
    },
  },
  widgetLayout: {
    "kpi-revenue": at(0, 0, 6, 6),
    "kpi-order-total": at(6, 0, 6, 6),
    "kpi-refunded": at(12, 0, 6, 6),
    "kpi-payouts": at(18, 0, 6, 6),
    "orders-by-source": at(0, 6, 8, 14),
    "orders-by-day": at(8, 6, 8, 14),
    "budget-gauge": at(16, 6, 4, 14),
    "budget-pulse": at(20, 6, 4, 14),
    "payout-pipeline": at(0, 20, 12, 12),
    "budget-burn": at(12, 20, 12, 12),
    "payout-grid": at(0, 32, 24, 16),
  },
};

const stock: AgPageState<ShopCrewRegistry> = {
  id: "inventory",
  widgets: {
    "kpi-skus": kpi("SKUs", countd("inventory.sku")),
    "kpi-units": kpi("Units on hand", sum("inventory.stock")),
    "reorder-donut": {
      type: "donut-chart",
      dataMapping: {
        categoryKey: [{ id: "inventory.needsReorder" }],
        valueKey: [countd("inventory.sku")],
      },
      format: {
        ...title("Needs reorder?"),
        style: {
          custom: {
            pieDataLabel: { enabled: true },
            totalLabel: { enabled: true },
          },
        },
      },
    },
    "stock-bars": {
      type: "bar-chart-grouped",
      dataMapping: {
        categoryKey: [{ id: "inventory.sku" }],
        valueKey: [sum("inventory.stock"), sum("inventory.reorderPoint")],
      },
      format: {
        ...title("Stock vs reorder point"),
        style: { theme: { common: { legend: { enabled: true } } } },
      },
    },
    "inventory-grid": {
      type: "grid",
      dataMapping: {
        cols: [
          { id: "inventory.sku" },
          { id: "inventory.name" },
          sum("inventory.stock"),
          sum("inventory.daysOfCover"),
          sum("inventory.forecast"),
          sum("inventory.reorderPoint"),
          { id: "inventory.needsReorder" },
          sum("inventory.price"),
        ],
      },
      sort: [{ field: sum("inventory.stock"), direction: "asc" }],
      format: title("Inventory detail"),
    },
    "policy-grid": {
      type: "grid",
      dataMapping: {
        cols: [
          { id: "policies.agent" },
          { id: "policies.enabled" },
          sum("policies.autoApproveMax"),
          sum("policies.dailyBudget"),
        ],
      },
      format: title("Agent policies"),
    },
    "cover-heat": {
      type: "cover-heat",
      dataMapping: {
        category: [{ id: "inventory.sku" }],
        value: [sum("inventory.daysOfCover")],
        threshold: [sum("inventory.leadTimeDays")],
      },
      format: title("Cover vs lead time"),
    },
  },
  widgetLayout: {
    "kpi-skus": at(0, 0, 6, 6),
    "kpi-units": at(6, 0, 6, 6),
    "reorder-donut": at(12, 0, 12, 14),
    "stock-bars": at(0, 6, 12, 14),
    "cover-heat": at(0, 20, 24, 12),
    "inventory-grid": at(0, 32, 16, 16),
    "policy-grid": at(16, 32, 8, 16),
  },
};

const liveAgents: AgPageState<ShopCrewRegistry> = {
  id: "live-agents",
  widgets: {
    "decision-ticker": {
      type: "decision-ticker",
      dataMapping: {
        rows: [
          { id: "decisions.summary" },
          { id: "decisions.status" },
          { id: "decisions.amount" },
          { id: "decisions.agent" },
          { id: "decisions.day" },
        ],
      },
      format: { ...title("Decision ticker"), style: { maxRows: 12 } },
    },
    "agent-roster": {
      type: "grid",
      dataMapping: {
        cols: [
          { id: "agent_runs.agent" },
          { id: "agent_runs.day" },
          sum("agent_runs.decisions"),
          sum("agent_runs.spend"),
        ],
      },
      format: title("Agent roster (runs by day)"),
    },
    "studio-ai-activity": {
      type: "grid",
      dataMapping: {
        cols: [
          { id: "studio_ai_runs.createdAt" },
          { id: "studio_ai_runs.agentId" },
          { id: "studio_ai_runs.status" },
          { id: "studio_ai_runs.query" },
          sum("studio_ai_runs.toolCount"),
        ],
      },
      sort: [{ field: { id: "studio_ai_runs.createdAt" }, direction: "desc" }],
      format: title("Studio AI activity"),
    },
    "refund-anomaly": {
      type: "refund-anomaly-strip",
      dataMapping: {
        category: [{ id: "refunds.day" }],
        value: [sum("refunds.amount")],
        series: [{ id: "refunds.agent" }],
      },
      format: { ...title("Refund anomaly strip"), style: { sigma: 2 } },
    },
  },
  widgetLayout: {
    "decision-ticker": at(0, 0, 12, 18),
    "refund-anomaly": at(12, 0, 12, 18),
    "agent-roster": at(0, 18, 12, 18),
    "studio-ai-activity": at(12, 18, 12, 18),
  },
};

export const shopCrewReport: AgReportState<ShopCrewRegistry> = {
  selectedPageId: operations.id,
  panels: { filters: { collapsed: true } },
  pages: [operations, money, stock, liveAgents],
};

export { REPORT_KEY as STUDIO_STATE_KEY } from "./report-state";
