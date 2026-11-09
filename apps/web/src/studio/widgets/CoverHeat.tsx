import type { AgWidgetParams } from "ag-studio";
import type { CoverHeatData } from "../registry";
import { readNumber, readString, useWidgetRows } from "./useWidgetRows";

type HeatRow = { sku: string; cover: number; lead: number };

function heatClass(cover: number, lead: number): "ok" | "warn" | "bad" {
  if (lead <= 0) return cover >= 7 ? "ok" : "warn";
  if (cover >= lead * 1.25) return "ok";
  if (cover >= lead) return "warn";
  return "bad";
}

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
          .sort((a, b) => a.cover / Math.max(a.lead, 1) - b.cover / Math.max(b.lead, 1));
      },
    },
    [params.dataMapping.category, params.dataMapping.value, params.dataMapping.threshold, params.sort],
  );

  if (!rows?.length) return null;

  return (
    <div className="sc-heat">
      {params.format?.title?.enabled !== false && params.format?.title?.text && (
        <div className="sc-heat__title">{params.format.title.text}</div>
      )}
      <ul className="sc-heat__grid">
        {rows.map((row) => {
          const cls = heatClass(row.cover, row.lead);
          return (
            <li key={row.sku} className={`sc-heat__cell sc-heat__cell--${cls}`}>
              <span className="sc-heat__sku">{row.sku}</span>
              <span className="sc-heat__cover">{row.cover.toFixed(1)}d</span>
              <span className="sc-heat__lead">LT {row.lead}d</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
