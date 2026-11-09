import type { AgWidgetParams } from "ag-studio";
import type { PayoutPipelineData } from "../registry";
import { readNumber, readString, useWidgetRows } from "./useWidgetRows";

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
      select: (raw, keys) => {
        const [catKey, valKey] = keys;
        return raw
          .map((row) => ({
            label: readString(row, catKey),
            value: readNumber(row, valKey),
          }))
          .filter((s) => s.value > 0)
          .sort((a, b) => stageRank(a.label) - stageRank(b.label) || b.value - a.value);
      },
    },
    [params.dataMapping.category, params.dataMapping.value, params.sort],
  );

  if (!stages?.length) return null;

  const max = Math.max(...stages.map((s) => s.value), 1);

  return (
    <div className="sc-pipeline">
      {params.format?.title?.enabled !== false && params.format?.title?.text && (
        <div className="sc-pipeline__title">{params.format.title.text}</div>
      )}
      <ol className="sc-pipeline__stages">
        {stages.map((stage) => (
          <li key={stage.label} className="sc-pipeline__stage">
            <div className="sc-pipeline__head">
              <span className="sc-pipeline__name">{stage.label}</span>
              <strong className="sc-pipeline__amt">${stage.value.toFixed(0)}</strong>
            </div>
            <div className="sc-pipeline__track">
              <div className="sc-pipeline__fill" style={{ width: `${(stage.value / max) * 100}%` }} />
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
