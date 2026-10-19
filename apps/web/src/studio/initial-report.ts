import type { AgPageState, AgReportState, AgWidgetLayoutState } from "ag-studio";
import type { ShopCrewRegistry } from "./registry";

const at = (xTrack: number, yTrack: number, xSpan: number, ySpan: number): AgWidgetLayoutState => ({
  xTrack,
  yTrack,
  xSpan,
  ySpan,
});

const title = (text: string) => ({ title: { enabled: true, text } });
const sum = (id: string) => ({ id, aggregation: "sum" as const });
const countd = (id: string) => ({ id, aggregation: "countd" as const });

const FONT = "Outfit, sans-serif";
const typography = (fontSize: number, fontWeight: "normal" | "bold" = "normal") => ({
  fontFamily: FONT,
  fontSize,
  fontWeight,
  fontStyle: "normal" as const,
});

const kpi = (text: string, value: { id: string; aggregation?: "sum" | "avg" | "countd" }) => ({
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
      type: "text",
      dataMapping: {},
      format: {
        style: {
          text:
            "ShopCrew operations — Status stack and Budget pulse below. " +
            "Edit report → Widgets → ShopCrew to drag more. Use Moves money to filter charts.",
          typography: typography(14),
        },
      },
    },
    "kpi-pending": kpi("Pending approvals", sum("snapshot.pending")),
    "kpi-auto": kpi("Auto-approved", sum("snapshot.autoApproved")),
    "kpi-spend": kpi("Spend today", sum("snapshot.spendToday")),
    "kpi-hours": kpi("Hours saved", sum("snapshot.hoursSaved")),
    "status-stack": {
      type: "status-stack",
      dataMapping: {
        category: [{ id: "decisions.status" }],
        value: [countd("decisions.id")],
      },
      format: {
        ...title("Decision status mix"),
        style: { barHeight: 18 },
      },
    },
    "budget-pulse": {
      type: "pulse-meter",
      dataMapping: { value: [{ id: "snapshot.budgetUsedPct" }] },
      format: {
        ...title("Budget pulse"),
        style: { warnAt: 0.6, dangerAt: 0.85, valueFontSize: 40, unit: "%" },
      },
    },
    "status-donut": {
      type: "donut-chart",
      dataMapping: {
        categoryKey: [{ id: "decisions.status" }],
        valueKey: [countd("decisions.id")],
      },
      format: {
        ...title("Decisions by status"),
        style: { custom: { pieDataLabel: { enabled: true }, totalLabel: { enabled: true } } },
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
    "money-filter": {
      type: "button-filter",
      dataMapping: { value: [{ id: "decisions.movesMoney" }] },
      format: {
        ...title("Moves money?"),
        style: { selection: { type: "multiple" }, dimensions: { height: 28, minWidth: 48 } },
      },
    },
    "decision-grid": {
      type: "grid",
      dataMapping: {
        cols: [
          { id: "decisions.day" },
          { id: "decisions.agent" },
          { id: "decisions.type" },
          { id: "decisions.status" },
          { id: "decisions.summary" },
          sum("decisions.amount"),
          { id: "decisions.movesMoney" },
        ],
      },
      sort: [{ field: { id: "decisions.day" }, direction: "desc" }],
      format: title("All agent decisions"),
    },
  },
  widgetLayout: {
    brief: at(0, 0, 24, 3),
    "kpi-pending": at(0, 3, 6, 5),
    "kpi-auto": at(6, 3, 6, 5),
    "kpi-spend": at(12, 3, 6, 5),
    "kpi-hours": at(18, 3, 6, 5),
    // Custom React widgets — full-width row under KPIs so they are hard to miss
    "status-stack": at(0, 8, 16, 14),
    "budget-pulse": at(16, 8, 8, 14),
    "status-donut": at(0, 22, 8, 14),
    "agent-spend": at(8, 22, 12, 14),
    "money-filter": at(20, 22, 4, 14),
    "decision-grid": at(0, 36, 24, 20),
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
        style: { custom: { pieDataLabel: { enabled: true }, totalLabel: { enabled: true } } },
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
          secondaryLabel: { enabled: true, text: "of daily agent budget", typography: typography(12) },
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
  },
  widgetLayout: {
    "kpi-revenue": at(0, 0, 6, 6),
    "kpi-order-total": at(6, 0, 6, 6),
    "kpi-refunded": at(12, 0, 6, 6),
    "kpi-payouts": at(18, 0, 6, 6),
    "orders-by-source": at(0, 6, 8, 16),
    "orders-by-day": at(8, 6, 8, 16),
    "budget-gauge": at(16, 6, 4, 16),
    "budget-pulse": at(20, 6, 4, 16),
    "payout-grid": at(0, 22, 24, 18),
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
        style: { custom: { pieDataLabel: { enabled: true }, totalLabel: { enabled: true } } },
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
  },
  widgetLayout: {
    "kpi-skus": at(0, 0, 6, 6),
    "kpi-units": at(6, 0, 6, 6),
    "reorder-donut": at(12, 0, 12, 14),
    "stock-bars": at(0, 6, 12, 14),
    "inventory-grid": at(0, 20, 16, 18),
    "policy-grid": at(16, 20, 8, 18),
  },
};

export const shopCrewReport: AgReportState<ShopCrewRegistry> = {
  selectedPageId: operations.id,
  pages: [operations, money, stock],
};

export const STUDIO_STATE_KEY = "shopcrew-studio-report-v4";
