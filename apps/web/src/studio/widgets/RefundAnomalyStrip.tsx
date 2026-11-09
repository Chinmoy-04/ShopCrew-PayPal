import type { AgWidgetParams } from "ag-studio";
import type { RefundAnomalyStripData } from "../registry";
import { readNumber, readString, useWidgetRows } from "./useWidgetRows";

type DayPoint = { label: string; value: number; series?: string; anomaly: boolean };

function sigmaFlags(values: number[], sigma: number): boolean[] {
  if (values.length < 2) return values.map(() => false);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, v) => a + (v - mean) ** 2, 0) / values.length;
  const std = Math.sqrt(variance) || 1;
  const cutoff = mean + sigma * std;
  return values.map((v) => v > cutoff);
}

/** Daily refund totals with days above N-sigma highlighted. */
export function RefundAnomalyStrip(params: AgWidgetParams<RefundAnomalyStripData>) {
  const sigma = params.format?.style?.sigma ?? 2;
  const category = params.dataMapping.category?.[0];
  const value = params.dataMapping.value?.[0];
  const series = params.dataMapping.series?.[0];

  const points = useWidgetRows<DayPoint[]>(
    params.widgetApi,
    {
      fields: [category, value, series],
      sort: params.sort,
      ready: !!(category && value),
      select: (raw, keys) => {
        const [catKey, valKey, seriesKey] = keys;
        const mapped = raw.map((row) => ({
          label: readString(row, catKey),
          value: readNumber(row, valKey),
          series: seriesKey ? readString(row, seriesKey) : undefined,
        }));
        const flags = sigmaFlags(
          mapped.map((p) => p.value),
          sigma,
        );
        return mapped.map((p, i) => ({ ...p, anomaly: flags[i] }));
      },
    },
    [params.dataMapping.category, params.dataMapping.value, params.dataMapping.series, params.sort, sigma],
  );

  if (!points?.length) return null;

  const max = Math.max(...points.map((p) => p.value), 1);

  return (
    <div className="sc-anomaly">
      {params.format?.title?.enabled !== false && params.format?.title?.text && (
        <div className="sc-anomaly__title">{params.format.title.text}</div>
      )}
      <ul className="sc-anomaly__strip">
        {points.map((point) => (
          <li
            key={`${point.label}-${point.series ?? ""}`}
            className={`sc-anomaly__day${point.anomaly ? " sc-anomaly__day--hot" : ""}`}
            title={point.series ? `${point.series}: $${point.value.toFixed(0)}` : undefined}
          >
            <span className="sc-anomaly__label">{point.label}</span>
            <div className="sc-anomaly__bar">
              <div className="sc-anomaly__fill" style={{ height: `${(point.value / max) * 100}%` }} />
            </div>
            <span className="sc-anomaly__val">${point.value.toFixed(0)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
