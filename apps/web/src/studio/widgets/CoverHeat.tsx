import { InsightBars } from "./InsightBars";
import type { AgWidgetParams } from "ag-studio";
import type { CoverHeatData } from "../registry";
import { readNumber, readString, useWidgetRows } from "./useWidgetRows";

type HeatRow = { sku: string; cover: number; lead: number };

/** Days of cover per SKU vs supplier lead time. */
export function CoverHeat(params: AgWidgetParams<CoverHeatData>) {
  const category = params.dataMapping.category?.[0];
  const value = params.dataMapping.value?.[0];
  const threshold = params.dataMapping.threshold?.[0];

  const rows = useWidgetRows<HeatRow[]>(
    params.widgetApi,
    {
      fields: [category, value, threshold],
      sort: params.sort,
      ready: !!(category && value && threshold),
      select: (raw, keys) => {
        const [catKey, valKey, thrKey] = keys;
        return raw
          .map((row) => ({
            sku: readString(row, catKey),
            cover: readNumber(row, valKey),
            lead: readNumber(row, thrKey),
          }))
          .sort(
            (a, b) =>
              a.cover / Math.max(a.lead, 1) - b.cover / Math.max(b.lead, 1),
          );
      },
    },
    [
      params.dataMapping.category,
      params.dataMapping.value,
      params.dataMapping.threshold,
      params.sort,
    ],
  );

  if (!rows?.length) return null;

  return (
    <InsightBars
      rows={rows.map((row) => ({
        label: row.sku,
        value: row.cover,
        target: row.lead,
      }))}
      unit="days"
      targetLabel="Lead time"
    />
  );
}
