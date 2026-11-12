import type { AgWidgetParams } from "ag-studio";
import { refundAnomalies } from "@shopcrew/shared";
import type { RefundAnomalyStripData } from "../registry";
import { readNumber, useWidgetRows } from "./useWidgetRows";
import { InsightBars } from "./InsightBars";

export function RefundAnomalyStrip(
  params: AgWidgetParams<RefundAnomalyStripData>,
) {
  const category = params.dataMapping.category?.[0],
    value = params.dataMapping.value?.[0];
  const sigma = params.format?.style?.sigma ?? 2;
  const result = useWidgetRows(
    params.widgetApi,
    {
      fields: [category, value],
      ready: !!(category && value),
      select: (rows, keys) =>
        refundAnomalies(
          rows.map((row) => ({
            day: readNumber(row, keys[0]),
            amount: readNumber(row, keys[1]),
          })),
          sigma,
        ),
    },
    [category, value, sigma],
  );
  if (!result) return null;
  const peak = result.series.reduce(
    (best, point) => (point.amount > best.amount ? point : best),
    result.series[0],
  );
  return (
    <div className="insight-refunds">
      {peak && (
        <div className="insight-refund-peak">
          <strong>
            Peak:{" "}
            {new Intl.NumberFormat("en-US", {
              style: "currency",
              currency: "USD",
            }).format(peak.amount)}
          </strong>
          <span>
            Day {peak.day}
            {result.spike ? " · Unusual" : ""}
          </span>
        </div>
      )}
      <InsightBars
        unit="USD"
        orientation="vertical"
        actualLabel="Refunds"
        rows={result.series.map((point) => ({
          label: `Day ${point.day}`,
          value: point.amount,
          color:
            point.z >= sigma && result.series.length >= 3
              ? "var(--chart-4)"
              : "var(--chart-1)",
        }))}
      />
      <p className="insight-chart-caption">
        Available-history baseline · {sigma} standard deviations ·{" "}
        {result.series.length} observed days
      </p>
    </div>
  );
}
