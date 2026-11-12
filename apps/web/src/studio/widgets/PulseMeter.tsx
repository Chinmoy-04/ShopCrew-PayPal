import type { AgWidgetParams } from "ag-studio";
import { RingChart } from "@/components/charts/ring-chart";
import { Ring } from "@/components/charts/ring";
import { RingCenter } from "@/components/charts/ring-center";
import { chartCssVars } from "@/components/charts/chart-context";
import type { PulseMeterData } from "../registry";
import { readNumber, useWidgetRows } from "./useWidgetRows";
import { usd } from "./InsightBars";

export function PulseMeter(params: AgWidgetParams<PulseMeterData>) {
  const style = params.format?.style ?? {};
  const value = params.dataMapping.value?.[0],
    amount = params.dataMapping.amount?.[0],
    budget = params.dataMapping.budget?.[0];
  const result = useWidgetRows(
    params.widgetApi,
    {
      fields: [value, amount, budget],
      ready: !!value,
      select: (rows, keys) => ({
        ratio: readNumber(rows[0], keys[0]),
        amount: amount ? readNumber(rows[0], keys[1]) : undefined,
        budget: budget ? readNumber(rows[0], keys[2]) : undefined,
      }),
    },
    [value, amount, budget],
  );
  if (!result) return null;
  if (result.budget !== undefined && result.budget <= 0)
    return (
      <div className="insight-budget-empty">
        No configured budget
        {result.amount ? <p>{usd(result.amount)} committed today</p> : null}
      </div>
    );
  const ratio =
    style.unit === "%" && Math.abs(result.ratio) > 1 && !budget
      ? result.ratio / 100
      : result.ratio;
  const color =
    ratio >= (style.dangerAt ?? 0.85)
      ? "var(--chart-4)"
      : ratio >= (style.warnAt ?? 0.6)
        ? "var(--chart-3)"
        : chartCssVars.linePrimary;
  const display =
    style.unit === "%" ? `${Math.round(ratio * 100)}%` : String(result.ratio);
  return (
    <div
      className="insight-budget"
      aria-label={`${display} of configured budget`}
    >
      <div className="insight-budget-ring">
        <RingChart
          data={[
            {
              label: "Budget utilization",
              value: Math.max(0, Math.min(1, ratio)),
              maxValue: 1,
              color,
            },
          ]}
          strokeWidth={12}
          animationDuration={0}
        >
          <Ring index={0} animate={false} showGlow={false} />
          <RingCenter>
            {() => (
              <strong style={{ fontSize: style.valueFontSize ?? 32 }}>
                {display}
              </strong>
            )}
          </RingCenter>
        </RingChart>
      </div>
      {result.amount !== undefined && result.budget !== undefined && (
        <div className="insight-budget-caption">
          <strong>{usd(result.amount)}</strong> / {usd(result.budget)}
          <span>
            {result.amount > result.budget
              ? `${usd(result.amount - result.budget)} over budget`
              : `${usd(result.budget - result.amount)} remaining`}
          </span>
        </div>
      )}
    </div>
  );
}
