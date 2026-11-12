import { InsightBars, readable, statusColor } from "./InsightBars";
import type { AgWidgetParams } from "ag-studio";
import type { PayoutPipelineData } from "../registry";
import { readNumber, readString, useWidgetRows } from "./useWidgetRows";
import { InsightEmptyState } from "./InsightEmptyState";

type Stage = { label: string; value: number };

const STAGE_ORDER = [
  "proposed",
  "approved",
  "submitted",
  "pending",
  "unclaimed",
  "success",
  "canceled",
  "cancelled",
  "failed",
];

function stageRank(label: string): number {
  const key = label.toLowerCase().replace(/\s+/g, "_");
  const idx = STAGE_ORDER.indexOf(key);
  return idx >= 0 ? idx : STAGE_ORDER.length + 1;
}

/** Payout status stages with dollar totals. */
export function PayoutPipeline(params: AgWidgetParams<PayoutPipelineData>) {
  const category = params.dataMapping.category?.[0];
  const value = params.dataMapping.value?.[0];

  const stages = useWidgetRows<Stage[]>(
    params.widgetApi,
    {
      fields: [category, value],
      sort: params.sort,
      ready: !!(category && value),
      emptyValue: [],
      select: (raw, keys) => {
        const [catKey, valKey] = keys;
        return raw
          .map((row) => ({
            label: readString(row, catKey),
            value: readNumber(row, valKey),
          }))
          .filter((s) => s.value > 0)
          .sort(
            (a, b) =>
              stageRank(a.label) - stageRank(b.label) || b.value - a.value,
          );
      },
    },
    [params.dataMapping.category, params.dataMapping.value, params.sort],
  );

  if (!stages) return null;
  if (!stages.length)
    return (
      <InsightEmptyState
        source="payouts"
        context={params.context ?? {}}
        filtered={params.context?.sourceCounts?.payouts > 0}
      />
    );

  return (
    <InsightBars
      rows={stages.map((row) => ({
        label: readable(row.label),
        value: row.value,
        color: statusColor(row.label),
      }))}
      unit="USD"
    />
  );
}
