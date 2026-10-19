import type { AgDefaultWidgetDefinition, AgWidgetData, AgWidgetDataFormat } from "ag-studio";
import type { AgRegistry, AgWidgetDefinition } from "ag-studio-react";

export interface PulseMeterData
  extends AgWidgetData<
    { value: unknown },
    AgWidgetDataFormat<{
      warnAt?: number;
      dangerAt?: number;
      valueFontSize?: number;
      unit?: string;
    }>
  > {
  type: "pulse-meter";
}

export interface StatusStackData
  extends AgWidgetData<
    { category: unknown; value: unknown },
    AgWidgetDataFormat<{
      barHeight?: number;
    }>
  > {
  type: "status-stack";
}

export type PulseMeterDefinition = AgWidgetDefinition<"pulse-meter", PulseMeterData>;
export type StatusStackDefinition = AgWidgetDefinition<"status-stack", StatusStackData>;

/** Registry that adds ShopCrew custom widgets on top of Studio defaults. */
export interface ShopCrewRegistry extends AgRegistry {
  widgets: readonly (AgDefaultWidgetDefinition | PulseMeterDefinition | StatusStackDefinition)[];
}
