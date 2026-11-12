import { InsightBars, readable, statusColor } from "./InsightBars";
import type { AgWidgetParams } from "ag-studio";
import type { StatusStackData } from "../registry";
import { readNumber, readString, useWidgetRows } from "./useWidgetRows";

type StackRow = { label: string; value: number };

/** Horizontal stacked bars for categorical totals (e.g. decision status mix). */
export function StatusStack(params: AgWidgetParams<StatusStackData>) {
  const barHeight = params.format?.style?.barHeight ?? 22;
  const category = params.dataMapping.category?.[0];
  const value = params.dataMapping.value?.[0];

  const rows = useWidgetRows<StackRow[]>(
    params.widgetApi,
    {
      fields: [category, value],
      sort: params.sort,
      ready: !!(category && value),
      select: (raw, keys) => {
        const [catKey, valKey] = keys;
        return raw
          .map((row) => ({
            label: readString(row, catKey),
            value: readNumber(row, valKey),
          }))
          .filter((r) => r.value > 0)
          .sort((a, b) => b.value - a.value);
      },
    },
    [params.dataMapping.category, params.dataMapping.value, params.sort],
  );

  if (!rows?.length) return null;

  const selections = params.widgetApi.getCrossFilterSelections() ?? [];
  const selected = selections.flatMap((selection) =>
    selection.type === "value"
      ? selection.values.map(String).map(readable)
      : [],
  );
  return (
    <InsightBars
      unit="decisions"
      barHeight={barHeight}
      rows={rows.map((row) => ({
        label: readable(row.label),
        value: row.value,
        color: statusColor(row.label),
      }))}
      selected={selected}
      onSelect={(index) =>
        params.widgetApi.toggleCrossFilter({
          type: "value",
          field: category!,
          value: rows[index].label,
          group: 0,
        })
      }
    />
  );
}
