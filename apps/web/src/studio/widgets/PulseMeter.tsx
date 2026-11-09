import type { AgWidgetParams } from "ag-studio";
import type { PulseMeterData } from "../registry";
import { readNumber, useWidgetRows } from "./useWidgetRows";

/** ShopCrew pulse meter — single KPI with warn/danger colour bands. */
export function PulseMeter(params: AgWidgetParams<PulseMeterData>) {
  const style = params.format?.style ?? {};
  const warnAt = style.warnAt ?? 0.7;
  const dangerAt = style.dangerAt ?? 0.9;
  const fontSize = style.valueFontSize ?? 36;
  const unit = style.unit ?? "";

  const value = useWidgetRows<number>(
    params.widgetApi,
    {
      fields: [params.dataMapping.value?.[0]],
      ready: !!params.dataMapping.value?.[0],
      select: (raw, keys) => readNumber(raw[0], keys[0]),
    },
    [params.dataMapping.value],
  );

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
