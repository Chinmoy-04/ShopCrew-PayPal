import type {
  AgDefaultWidgetDefinition,
  AgWidgetData,
  AgWidgetDataFormat,
} from "ag-studio";
import type { AgRegistry, AgWidgetDefinition } from "ag-studio-react";

export interface PulseMeterData extends AgWidgetData<
  { value: unknown; amount?: unknown; budget?: unknown },
  AgWidgetDataFormat<{
    warnAt?: number;
    dangerAt?: number;
    valueFontSize?: number;
    unit?: string;
  }>
> {
  type: "pulse-meter";
}

export interface StatusStackData extends AgWidgetData<
  { category: unknown; value: unknown },
  AgWidgetDataFormat<{
    barHeight?: number;
  }>
> {
  type: "status-stack";
}

export interface RefundAnomalyStripData extends AgWidgetData<
  { category: unknown; value: unknown; series?: unknown },
  AgWidgetDataFormat<{
    sigma?: number;
  }>
> {
  type: "refund-anomaly-strip";
}

export interface PayoutPipelineData extends AgWidgetData<
  { category: unknown; value: unknown },
  AgWidgetDataFormat<Record<string, never>>
> {
  type: "payout-pipeline";
}

export interface BudgetBurnData extends AgWidgetData<
  { category: unknown; value: unknown; target: unknown },
  AgWidgetDataFormat<Record<string, never>>
> {
  type: "budget-burn";
}

export interface CoverHeatData extends AgWidgetData<
  { category: unknown; value: unknown; threshold: unknown },
  AgWidgetDataFormat<Record<string, never>>
> {
  type: "cover-heat";
}

export interface NegotiationScoreboardData extends AgWidgetData<
  { category: unknown; value: unknown },
  AgWidgetDataFormat<{
    maxRows?: number;
  }>
> {
  type: "negotiation-scoreboard";
}

export interface DecisionTickerData extends AgWidgetData<
  { rows: unknown },
  AgWidgetDataFormat<{
    maxRows?: number;
  }>
> {
  type: "decision-ticker";
}

export type PulseMeterDefinition = AgWidgetDefinition<
  "pulse-meter",
  PulseMeterData
>;
export type StatusStackDefinition = AgWidgetDefinition<
  "status-stack",
  StatusStackData
>;
export type RefundAnomalyStripDefinition = AgWidgetDefinition<
  "refund-anomaly-strip",
  RefundAnomalyStripData
>;
export type PayoutPipelineDefinition = AgWidgetDefinition<
  "payout-pipeline",
  PayoutPipelineData
>;
export type BudgetBurnDefinition = AgWidgetDefinition<
  "budget-burn",
  BudgetBurnData
>;
export type CoverHeatDefinition = AgWidgetDefinition<
  "cover-heat",
  CoverHeatData
>;
export type NegotiationScoreboardDefinition = AgWidgetDefinition<
  "negotiation-scoreboard",
  NegotiationScoreboardData
>;
export type DecisionTickerDefinition = AgWidgetDefinition<
  "decision-ticker",
  DecisionTickerData
>;
export interface DailyMetricData extends AgWidgetData<
  { value: unknown },
  AgWidgetDataFormat<{ action?: string; note?: string }>
> {
  type: "daily-metric";
}
export interface LiveBriefData extends AgWidgetData<
  { value: unknown },
  AgWidgetDataFormat<Record<string, never>>
> {
  type: "live-brief";
}
export interface ExplorerControlsData extends AgWidgetData<
  Record<string, never>,
  AgWidgetDataFormat<Record<string, never>>
> {
  type: "explorer-controls";
}

/** Registry that adds ShopCrew custom widgets on top of Studio defaults. */
export interface ShopCrewRegistry extends AgRegistry {
  widgets: readonly (
    | AgDefaultWidgetDefinition
    | PulseMeterDefinition
    | StatusStackDefinition
    | RefundAnomalyStripDefinition
    | PayoutPipelineDefinition
    | BudgetBurnDefinition
    | CoverHeatDefinition
    | NegotiationScoreboardDefinition
    | DecisionTickerDefinition
    | AgWidgetDefinition<"daily-metric", DailyMetricData>
    | AgWidgetDefinition<"live-brief", LiveBriefData>
    | AgWidgetDefinition<"explorer-controls", ExplorerControlsData>
  )[];
}
