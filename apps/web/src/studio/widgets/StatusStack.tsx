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

  const max = Math.max(...rows.map((r) => r.value), 1);

  return (
    <div className="sc-stack">
      {params.format?.title?.enabled !== false && params.format?.title?.text && (
        <div className="sc-stack__title">{params.format.title.text}</div>
      )}
      <ul className="sc-stack__list">
        {rows.map((row, i) => (
          <li key={row.label} className="sc-stack__row">
            <div className="sc-stack__meta">
              <span>{row.label}</span>
              <strong>{row.value}</strong>
            </div>
            <div className="sc-stack__track" style={{ height: barHeight }}>
              <div
                className={`sc-stack__fill sc-stack__fill--${i % 6}`}
                style={{ width: `${(row.value / max) * 100}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
