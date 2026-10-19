import { useEffect, useState } from "react";
import type { AgWidgetParams } from "ag-studio";
import type { PulseMeterData } from "../registry";
import { fieldRowKey } from "./fieldKey";

function readNumber(row: Record<string, unknown>, key: string): number {
  const direct = key ? row[key] : undefined;
  if (typeof direct === "number") return direct;
  const first = Object.values(row).find((v) => typeof v === "number");
  return typeof first === "number" ? first : 0;
}

/** ShopCrew pulse meter — single KPI with warn/danger colour bands. */
export function PulseMeter(params: AgWidgetParams<PulseMeterData>) {
  const [value, setValue] = useState<number | null>(null);
  const style = params.format?.style ?? {};
  const warnAt = style.warnAt ?? 0.7;
  const dangerAt = style.dangerAt ?? 0.9;
  const fontSize = style.valueFontSize ?? 36;
  const unit = style.unit ?? "";

  useEffect(() => {
    let cancelled = false;
    const field = params.dataMapping.value?.[0];
    if (!field) {
      params.widgetApi.setDisplayState("incompleteDataMapping");
      setValue(null);
      return;
    }

    params.widgetApi.setDisplayState("loading");
    void params.widgetApi
      .getData({ fields: [field] })
      .then((response) => {
        if (cancelled) return;
        const rows = response.results.rows ?? [];
        if (!rows.length) {
          params.widgetApi.setDisplayState("noData");
          setValue(null);
          return;
        }
        setValue(readNumber(rows[0], fieldRowKey(field)));
        params.widgetApi.setDisplayState("displayed");
      })
      .catch(() => {
        if (!cancelled) {
          params.widgetApi.setDisplayState("noData");
          setValue(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [params.dataMapping.value, params.widgetApi]);

  if (value == null) return null;

  const tone = value >= dangerAt ? "danger" : value >= warnAt ? "warn" : "ok";
  const display =
    Math.abs(value) <= 1 && unit === "%"
      ? `${Math.round(value * 100)}${unit}`
      : unit === "%"
        ? `${Math.round(value)}${unit}`
        : `${Number.isInteger(value) ? value : value.toFixed(2)}${unit}`;

  const pct = Math.max(0, Math.min(1, Math.abs(value) <= 1 ? value : value / 100));

  return (
    <div className={`sc-pulse sc-pulse--${tone}`}>
      {params.format?.title?.enabled !== false && params.format?.title?.text && (
        <div className="sc-pulse__title">{params.format.title.text}</div>
      )}
      <div className="sc-pulse__ring" style={{ ["--pulse" as string]: String(pct) }}>
        <span className="sc-pulse__value" style={{ fontSize }}>
          {display}
        </span>
      </div>
    </div>
  );
}
