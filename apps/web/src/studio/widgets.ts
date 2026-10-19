import type { AgDefaultRegistry, AgWidgetFormParams, AgWidgetsConfig } from "ag-studio";
import { createWidgets } from "ag-studio-react";
import type { PulseMeterData, ShopCrewRegistry, StatusStackData } from "./registry";
import { PulseMeter } from "./widgets/PulseMeter";
import { StatusStack } from "./widgets/StatusStack";

const pulseIcon =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M8 12h2l1.5-4 3 8L16 12h2"/></svg>';

const stackIcon =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 18h16M4 12h12M4 6h8"/></svg>';

/** ShopCrew custom widgets + default Studio menu. */
export function buildShopCrewWidgets(
  defaults: AgWidgetsConfig<AgDefaultRegistry>,
): AgWidgetsConfig<ShopCrewRegistry> {
  return createWidgets<ShopCrewRegistry>({
    additionalTypes: [
      {
        id: "pulse-meter",
        label: "Pulse meter",
        icon: pulseIcon,
        dataMapping: {
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
            dataMappingItems: [{ key: "value", label: "Value" }],
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
        comp: PulseMeter,
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
            aiDescription: "Category field for each bar (e.g. decision status).",
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
        comp: StatusStack,
        defaultSize: { width: 360, height: 280 },
        minSize: { width: 200, height: 160 },
        ai: {
          description:
            "ShopCrew status stack — ranked horizontal bars for categorical totals such as decisions by status.",
        },
      },
    ],
    menu: [
      ...defaults.menu,
      {
        label: "ShopCrew",
        widgetIds: ["pulse-meter", "status-stack"],
      },
    ],
  });
}
