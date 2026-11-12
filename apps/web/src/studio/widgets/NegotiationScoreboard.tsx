import { InsightBars } from "./InsightBars";
import type { AgWidgetParams } from "ag-studio";
import type { NegotiationScoreboardData } from "../registry";
import { readNumber, readString, useWidgetRows } from "./useWidgetRows";

type ScoreRow = { supplier: string; saving: number };

/** Ranked supplier savings from negotiations. */
export function NegotiationScoreboard(
  params: AgWidgetParams<NegotiationScoreboardData>,
) {
  const category = params.dataMapping.category?.[0];
  const value = params.dataMapping.value?.[0];
  const maxRows = params.format?.style?.maxRows ?? 8;

  const rows = useWidgetRows<ScoreRow[]>(
    params.widgetApi,
    {
      fields: [category, value],
      sort: params.sort,
      ready: !!(category && value),
      select: (raw, keys) => {
        const [catKey, valKey] = keys;
        return raw
          .map((row) => ({
            supplier: readString(row, catKey),
            saving: readNumber(row, valKey),
          }))
          .filter((r) => r.saving > 0)
          .sort((a, b) => b.saving - a.saving)
          .slice(0, maxRows);
      },
    },
    [
      params.dataMapping.category,
      params.dataMapping.value,
      params.sort,
      maxRows,
    ],
  );

  if (!rows?.length) return null;

  return (
    <InsightBars
      rows={rows.map((row) => ({ label: row.supplier, value: row.saving }))}
      unit="USD"
    />
  );
}
