import { useEffect, useState } from "react";
import type { AgWidgetParams } from "ag-studio";
import type { StatusStackData } from "../registry";
import { fieldRowKey } from "./fieldKey";

type StackRow = { label: string; value: number };

/** Horizontal stacked bars for categorical totals (e.g. decision status mix). */
export function StatusStack(params: AgWidgetParams<StatusStackData>) {
  const [rows, setRows] = useState<StackRow[]>([]);
  const barHeight = params.format?.style?.barHeight ?? 22;

  useEffect(() => {
    let cancelled = false;
    const category = params.dataMapping.category?.[0];
    const value = params.dataMapping.value?.[0];
    if (!category || !value) {
      params.widgetApi.setDisplayState("incompleteDataMapping");
      setRows([]);
      return;
    }

    params.widgetApi.setDisplayState("loading");
    void params.widgetApi
      .getData({
        fields: [category, value],
        sort: params.sort?.map((s) => ({ field: s.field, direction: s.direction })),
      })
      .then((response) => {
        if (cancelled) return;
        const raw = response.results.rows ?? [];
        if (!raw.length) {
          params.widgetApi.setDisplayState("noData");
          setRows([]);
          return;
        }
        const catKey = fieldRowKey(category);
        const valKey = fieldRowKey(value);
        const next = raw
          .map((row) => ({
            label: String((catKey ? row[catKey] : Object.values(row)[0]) ?? "—"),
            value: Number((valKey ? row[valKey] : Object.values(row).find((v) => typeof v === "number")) ?? 0),
          }))
          .filter((r) => r.value > 0)
          .sort((a, b) => b.value - a.value);
        setRows(next);
        params.widgetApi.setDisplayState("displayed");
      })
      .catch(() => {
        if (!cancelled) {
          params.widgetApi.setDisplayState("noData");
          setRows([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [params.dataMapping.category, params.dataMapping.value, params.sort, params.widgetApi]);

  if (!rows.length) return null;

  const max = Math.max(...rows.map((r) => r.value), 1);
  const palette = ["#003087", "#0070e0", "#00a3e0", "#7c3aed", "#0d9488", "#c2410c"];

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
                className="sc-stack__fill"
                style={{
                  width: `${(row.value / max) * 100}%`,
                  background: palette[i % palette.length],
                }}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
