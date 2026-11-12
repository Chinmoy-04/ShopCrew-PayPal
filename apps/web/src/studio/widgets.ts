import { createElement, type ComponentType } from "react";
import { readable } from "./widgets/InsightBars";
import type { CustomCellRendererProps } from "ag-grid-react";
import { studioWidget } from "./widgets/lifecycle";
import { DailyMetric, LiveBrief } from "./widgets/DailySummary";
import { ExplorerControls } from "./widgets/ExplorerControls";
import { InsightGrid } from "./widgets/InsightGrid";
import type {
  AgWidgetField,
  AgDefaultRegistry,
  AgWidgetFormParams,
  AgWidgetsConfig,
} from "ag-studio";
import { createWidgets } from "ag-studio-react";
import type {
  BudgetBurnData,
  CoverHeatData,
  DecisionTickerData,
  NegotiationScoreboardData,
  PayoutPipelineData,
  PulseMeterData,
  RefundAnomalyStripData,
  ShopCrewRegistry,
  StatusStackData,
} from "./registry";
import { BudgetBurn } from "./widgets/BudgetBurn";
import { CoverHeat } from "./widgets/CoverHeat";
import { DecisionTicker } from "./widgets/DecisionTicker";
import { NegotiationScoreboard } from "./widgets/NegotiationScoreboard";
import { PayoutPipeline } from "./widgets/PayoutPipeline";
import { PulseMeter } from "./widgets/PulseMeter";
import { RefundAnomalyStrip } from "./widgets/RefundAnomalyStrip";
import { StatusStack } from "./widgets/StatusStack";

const pulseIcon =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M8 12h2l1.5-4 3 8L16 12h2"/></svg>';

const stackIcon =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 18h16M4 12h12M4 6h8"/></svg>';

const anomalyIcon =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 20h18M6 16l6-12 6 12"/><path d="M12 9v3"/></svg>';

const pipelineIcon =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h4v12H4zM10 10h4v8h-4zM16 4h4v14h-4z"/></svg>';

const burnIcon =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v4M8 6h8v14H8z"/><path d="M10 14h4"/></svg>';

const heatIcon =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>';

const negoIcon =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 6h8l2 4v8H6V10z"/><path d="M9 14h6"/></svg>';

const tickerIcon =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16M4 12h10M4 18h14"/></svg>';

const SHOPCREW_WIDGET_IDS = [
  "pulse-meter",
  "status-stack",
  "refund-anomaly-strip",
  "payout-pipeline",
  "budget-burn",
  "cover-heat",
  "negotiation-scoreboard",
  "decision-ticker",
] as const;

/** ShopCrew custom widgets + default Studio menu. */
export function buildShopCrewWidgets(
  defaults: AgWidgetsConfig<AgDefaultRegistry>,
  decisionCell?: ComponentType<CustomCellRendererProps>,
): AgWidgetsConfig<ShopCrewRegistry> {
  const config = createWidgets<ShopCrewRegistry>({
    additionalTypes: [
      {
        id: "explorer-controls",
        label: "Decision explorer controls",
        icon: stackIcon,
        dataMapping: {},
        form: (params) => params.createDefaults({ dataMappingItems: [] }),
        comp: ExplorerControls,
        defaultSize: { width: 900, height: 110 },
        minSize: { width: 200, height: 90 },
      },
      {
        id: "daily-metric",
        label: "Daily metric",
        icon: pulseIcon,
        dataMapping: {
          value: {
            type: "field",
            supportedRoles: ["numeric"],
            requires: { cardinality: "one" },
            required: true,
          },
        },
        form: (params) => {
          const form = params.createDefaults({
            dataMappingItems: [{ key: "value", label: "Value" }],
          });
          form.items[1]?.items.push(
            {
              type: "textfield",
              id: "format.style.action",
              label: "Drill-down action",
              defaultValue: "",
            },
            {
              type: "textfield",
              id: "format.style.note",
              label: "Explanation",
              defaultValue: "",
            },
          );
          return form;
        },
        comp: studioWidget(DailyMetric),
        defaultSize: { width: 240, height: 110 },
        minSize: { width: 120, height: 90 },
      },
      {
        id: "live-brief",
        label: "Live brief",
        icon: tickerIcon,
        dataMapping: {
          value: {
            type: "field",
            supportedRoles: ["category"],
            requires: { cardinality: "one" },
            required: true,
          },
        },
        form: (params) =>
          params.createDefaults({
            dataMappingItems: [{ key: "value", label: "Brief text" }],
          }),
        comp: studioWidget(LiveBrief),
        defaultSize: { width: 600, height: 90 },
        minSize: { width: 200, height: 70 },
      },
      {
        id: "pulse-meter",
        label: "Pulse meter",
        icon: pulseIcon,
        dataMapping: {
          amount: {
            type: "field",
            supportedRoles: ["numeric"],
            requires: { cardinality: "one" },
            required: false,
          },
          budget: {
            type: "field",
            supportedRoles: ["numeric"],
            requires: { cardinality: "one" },
            required: false,
          },
          value: {
            type: "field",
            supportedRoles: ["numeric"],
            requires: { cardinality: "one" },
            required: true,
            aiDescription: "Single numeric KPI to display as a pulse meter.",
          },
        },
        form: (params: AgWidgetFormParams<PulseMeterData>) => {
          const form = params.createDefaults({
            dataMappingItems: [
              { key: "value", label: "Value" },
              { key: "amount", label: "Committed amount (optional)" },
              { key: "budget", label: "Budget (optional)" },
            ],
          });
          form.items[1]?.items.push(
            {
              type: "number",
              id: "format.style.warnAt",
              label: "Warn at",
              defaultValue: 0.7,
            },
            {
              type: "number",
              id: "format.style.dangerAt",
              label: "Danger at",
              defaultValue: 0.9,
            },
            {
              type: "number",
              id: "format.style.valueFontSize",
              label: "Value font size",
              defaultValue: 36,
            },
            {
              type: "textfield",
              id: "format.style.unit",
              label: "Unit (e.g. %)",
              defaultValue: "",
            },
          );
          return form;
        },
        comp: studioWidget(PulseMeter),
        defaultSize: { width: 280, height: 220 },
        minSize: { width: 160, height: 140 },
        ai: {
          description:
            "ShopCrew pulse meter for a single numeric KPI with warn/danger colour bands (budget used, spend, etc.).",
        },
      },
      {
        id: "status-stack",
        label: "Status stack",
        icon: stackIcon,
        dataMapping: {
          category: {
            type: "field",
            supportedRoles: ["category"],
            requires: { cardinality: "many" },
            required: true,
            aiDescription:
              "Category field for each bar (e.g. decision status).",
          },
          value: {
            type: "field",
            supportedRoles: ["numeric"],
            requires: { cardinality: "one" },
            required: true,
            aiDescription: "Numeric measure for each category bar.",
          },
        },
        form: (params: AgWidgetFormParams<StatusStackData>) => {
          const form = params.createDefaults({
            dataMappingItems: [
              { key: "category", label: "Category" },
              { key: "value", label: "Value" },
            ],
          });
          form.items[1]?.items.push({
            type: "number",
            id: "format.style.barHeight",
            label: "Bar height",
            defaultValue: 22,
          });
          return form;
        },
        comp: studioWidget(StatusStack),
        defaultSize: { width: 360, height: 280 },
        minSize: { width: 200, height: 160 },
        ai: {
          description:
            "ShopCrew status stack — ranked horizontal bars for categorical totals such as decisions by status.",
        },
      },
      {
        id: "refund-anomaly-strip",
        label: "Refund anomaly strip",
        icon: anomalyIcon,
        dataMapping: {
          category: {
            type: "field",
            supportedRoles: ["category", "temporal"],
            requires: { cardinality: "many" },
            required: true,
            aiDescription:
              "Day or date bucket for each bar (e.g. refunds.day).",
          },
          value: {
            type: "field",
            supportedRoles: ["numeric"],
            requires: { cardinality: "one" },
            required: true,
            aiDescription: "Sum of refund amount per day.",
          },
          series: {
            type: "field",
            supportedRoles: ["category"],
            requires: { cardinality: "many" },
            required: false,
            aiDescription:
              "Optional agent or series split (e.g. refunds.agent).",
          },
        },
        form: (params: AgWidgetFormParams<RefundAnomalyStripData>) => {
          const form = params.createDefaults({
            dataMappingItems: [
              { key: "category", label: "Day" },
              { key: "value", label: "Refund amount" },
              { key: "series", label: "Series (optional)" },
            ],
          });
          form.items[1]?.items.push({
            type: "number",
            id: "format.style.sigma",
            label: "Anomaly sigma",
            defaultValue: 2,
          });
          return form;
        },
        comp: studioWidget(RefundAnomalyStrip),
        defaultSize: { width: 420, height: 220 },
        minSize: { width: 240, height: 160 },
        ai: {
          description:
            "Refund dollars per day with days above N standard deviations highlighted — use for refund spike detection.",
        },
      },
      {
        id: "payout-pipeline",
        label: "Payout pipeline",
        icon: pipelineIcon,
        dataMapping: {
          category: {
            type: "field",
            supportedRoles: ["category"],
            requires: { cardinality: "many" },
            required: true,
            aiDescription: "Payout status stage (e.g. payouts.status).",
          },
          value: {
            type: "field",
            supportedRoles: ["numeric"],
            requires: { cardinality: "one" },
            required: true,
            aiDescription: "Sum of payout amount per status.",
          },
        },
        form: (params: AgWidgetFormParams<PayoutPipelineData>) =>
          params.createDefaults({
            dataMappingItems: [
              { key: "category", label: "Status" },
              { key: "value", label: "Amount" },
            ],
          }),
        comp: studioWidget(PayoutPipeline),
        defaultSize: { width: 360, height: 300 },
        minSize: { width: 220, height: 180 },
        ai: {
          description:
            "Supplier payout pipeline — dollar totals by status from proposed through success or canceled.",
        },
      },
      {
        id: "budget-burn",
        label: "Budget burn",
        icon: burnIcon,
        dataMapping: {
          category: {
            type: "field",
            supportedRoles: ["category"],
            requires: { cardinality: "many" },
            required: true,
            aiDescription:
              "Agent name (e.g. policies.agent or decisions.agent).",
          },
          value: {
            type: "field",
            supportedRoles: ["numeric"],
            requires: { cardinality: "one" },
            required: true,
            aiDescription: "Spend or exposure amount per agent.",
          },
          target: {
            type: "field",
            supportedRoles: ["numeric"],
            requires: { cardinality: "one" },
            required: true,
            aiDescription:
              "Daily budget cap per agent (e.g. policies.dailyBudget).",
          },
        },
        form: (params: AgWidgetFormParams<BudgetBurnData>) =>
          params.createDefaults({
            dataMappingItems: [
              { key: "category", label: "Agent" },
              { key: "value", label: "Spend" },
              { key: "target", label: "Budget" },
            ],
          }),
        comp: studioWidget(BudgetBurn),
        defaultSize: { width: 360, height: 280 },
        minSize: { width: 220, height: 160 },
        ai: {
          description:
            "Per-agent spend vs daily budget with warn/danger bands when burn is high.",
        },
      },
      {
        id: "cover-heat",
        label: "Cover heat",
        icon: heatIcon,
        dataMapping: {
          category: {
            type: "field",
            supportedRoles: ["category"],
            requires: { cardinality: "many" },
            required: true,
            aiDescription: "SKU identifier (inventory.sku).",
          },
          value: {
            type: "field",
            supportedRoles: ["numeric"],
            requires: { cardinality: "one" },
            required: true,
            aiDescription: "Days of cover for the SKU (inventory.daysOfCover).",
          },
          threshold: {
            type: "field",
            supportedRoles: ["numeric"],
            requires: { cardinality: "one" },
            required: true,
            aiDescription:
              "Supplier lead time in days (inventory.leadTimeDays).",
          },
        },
        form: (params: AgWidgetFormParams<CoverHeatData>) =>
          params.createDefaults({
            dataMappingItems: [
              { key: "category", label: "SKU" },
              { key: "value", label: "Days of cover" },
              { key: "threshold", label: "Lead time" },
            ],
          }),
        comp: studioWidget(CoverHeat),
        defaultSize: { width: 400, height: 280 },
        minSize: { width: 240, height: 180 },
        ai: {
          description:
            "Inventory cover heatmap — days of cover per SKU compared to supplier lead time (red when under-covered).",
        },
      },
      {
        id: "negotiation-scoreboard",
        label: "Negotiation scoreboard",
        icon: negoIcon,
        dataMapping: {
          category: {
            type: "field",
            supportedRoles: ["category"],
            requires: { cardinality: "many" },
            required: true,
            aiDescription: "Supplier or receiver name.",
          },
          value: {
            type: "field",
            supportedRoles: ["numeric"],
            requires: { cardinality: "one" },
            required: true,
            aiDescription: "Negotiated savings vs list price.",
          },
        },
        form: (params: AgWidgetFormParams<NegotiationScoreboardData>) => {
          const form = params.createDefaults({
            dataMappingItems: [
              { key: "category", label: "Supplier" },
              { key: "value", label: "Saving" },
            ],
          });
          form.items[1]?.items.push({
            type: "number",
            id: "format.style.maxRows",
            label: "Max rows",
            defaultValue: 8,
          });
          return form;
        },
        comp: studioWidget(NegotiationScoreboard),
        defaultSize: { width: 360, height: 300 },
        minSize: { width: 220, height: 180 },
        ai: {
          description:
            "Ranked supplier negotiation scoreboard — savings per supplier against list price.",
        },
      },
      {
        id: "decision-ticker",
        label: "Decision ticker",
        icon: tickerIcon,
        dataMapping: {
          rows: {
            type: "fieldset",
            supportedRoles: ["category", "temporal", "numeric"],
            requires: { cardinality: "many" },
            required: true,
            sort: true,
            aiDescription:
              "Decision row columns: summary, status, amount, agent (map decisions.summary, decisions.status, decisions.amount, decisions.agent).",
          },
        },
        form: (params: AgWidgetFormParams<DecisionTickerData>) => {
          const form = params.createDefaults({
            dataMappingItems: [{ key: "rows", label: "Decision columns" }],
          });
          form.items[1]?.items.push({
            type: "number",
            id: "format.style.maxRows",
            label: "Max rows",
            defaultValue: 12,
          });
          return form;
        },
        comp: studioWidget(DecisionTicker),
        defaultSize: { width: 400, height: 320 },
        minSize: { width: 260, height: 200 },
        ai: {
          description:
            "Live decision ticker — newest agent decisions with status chips, amount, and agent name. Sort by sim day descending.",
        },
      },
    ],
    menu: [
      ...defaults.menu,
      {
        label: "ShopCrew",
        widgetIds: [...SHOPCREW_WIDGET_IDS],
      },
    ],
  });
  const StatusCell = (params: CustomCellRendererProps) =>
    createElement("span", null, readable(String(params.value ?? "")));
  return {
    ...config,
    widgets: config.widgets.map((widget) =>
      widget.id === "grid"
        ? {
            ...widget,
            comp: InsightGrid,
            options: {
              ...(widget.options as object),
              createCellRenderer: (field: AgWidgetField) =>
                field.fieldId === "decisions.id"
                  ? decisionCell
                  : String(field.fieldId).endsWith(".status")
                    ? StatusCell
                    : undefined,
            },
          }
        : widget,
    ),
  } as AgWidgetsConfig<ShopCrewRegistry>;
}
