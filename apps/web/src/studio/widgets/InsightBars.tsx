import { useEffect } from "react";
import { BarChart } from "@/components/charts/bar-chart";
import { Bar } from "@/components/charts/bar";
import { Grid } from "@/components/charts/grid";
import { ChartTooltip } from "@/components/charts/tooltip/chart-tooltip";
import { chartCssVars, useChart } from "@/components/charts/chart-context";

export const usd = (value: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    value,
  );
export const readable = (label: string) =>
  (label === label.toUpperCase() ? label.toLowerCase() : label)
    .replace(/_/g, " ")
    .replace(/^./, (letter) => letter.toUpperCase());
export function statusColor(status: string) {
  status = status.toLowerCase();
  if (/fail|block|reject|cancel|roll.*back/.test(status))
    return "var(--chart-4)";
  if (/pending|proposed|submitted/.test(status)) return "var(--chart-3)";
  if (/confirm|success|approv/.test(status)) return "var(--chart-1)";
  return "var(--chart-5)";
}
function ClickSelection({ onSelect }: { onSelect: (index: number) => void }) {
  const { containerRef, tooltipData } = useChart();
  useEffect(() => {
    const element = containerRef.current;
    const click = () => {
      if (tooltipData) onSelect(tooltipData.index);
    };
    element?.addEventListener("click", click);
    return () => element?.removeEventListener("click", click);
  }, [containerRef, tooltipData, onSelect]);
  return null;
}
export type InsightBarRow = {
  label: string;
  value: number;
  target?: number;
  color?: string;
};
type Unit = "USD" | "days" | "decisions";
function formatValue(value: number, unit: Unit) {
  return unit === "USD" ? usd(value) : `${Number(value.toFixed(1))}`;
}
function splitLabel(label: string): string[] {
  if (label.length <= 15) return [label];
  const words = label.split(" ");
  let first = "";
  while (words.length && (first.length + words[0].length < 16 || !first))
    first += `${first ? " " : ""}${words.shift()}`;
  return words.length ? [first, words.join(" ")] : [first];
}
/** Axes and end labels use Bklit's own scales; series remain registry Bar components. */
function InsightAxes({
  rows,
  unit,
  targetLabel,
}: {
  rows: InsightBarRow[];
  unit: Unit;
  targetLabel?: string;
}) {
  const { yScale, barScale, bandWidth, innerWidth, innerHeight, orientation } =
    useChart();
  if (!barScale || !bandWidth) return null;
  const horizontal = orientation === "horizontal";
  const ticks = yScale.ticks(
    horizontal ? (innerWidth < 200 ? 2 : 4) : innerHeight < 90 ? 2 : 4,
  );
  const compact = (value: number) =>
    unit === "USD"
      ? new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "USD",
          notation: "compact",
          maximumFractionDigits: 1,
        }).format(value)
      : String(Number(value.toFixed(1)));
  const step = Math.max(
    1,
    Math.ceil(rows.length / Math.max(2, Math.floor(innerWidth / 65))),
  );
  return (
    <g className="insight-chart-axes" pointerEvents="none">
      {ticks.map((tick) => (
        <text
          key={tick}
          x={horizontal ? yScale(tick) : -9}
          y={horizontal ? innerHeight + 22 : yScale(tick) + 4}
          textAnchor={horizontal ? "middle" : "end"}
          className="insight-axis-tick"
        >
          {compact(tick)}
        </text>
      ))}
      {rows.map((row, index) => {
        const position = (barScale(row.label) ?? 0) + bandWidth / 2;
        if (!horizontal)
          return index % step === 0 || index === rows.length - 1 ? (
            <text
              key={row.label}
              x={position}
              y={innerHeight + 22}
              textAnchor="middle"
              className="insight-axis-tick"
            >
              {row.label.replace(/^Day /, "")}
            </text>
          ) : null;
        const lines = splitLabel(row.label);
        return (
          <g key={row.label}>
            <text
              x={-12}
              y={position - (lines.length - 1) * 7 + 4}
              textAnchor="end"
              className="insight-axis-category"
            >
              {lines.map((line, lineIndex) => (
                <tspan key={lineIndex} x={-12} dy={lineIndex ? 14 : 0}>
                  {line}
                </tspan>
              ))}
            </text>
            <text
              x={innerWidth + 10}
              y={position + (targetLabel ? -5 : 4)}
              className="insight-axis-value"
            >
              {formatValue(row.value, unit)}
            </text>
            {targetLabel && (
              <text
                x={innerWidth + 10}
                y={position + 12}
                className="insight-axis-target"
              >
                {row.target === 0 && targetLabel === "Budget"
                  ? "No cap"
                  : formatValue(row.target ?? 0, unit)}
              </text>
            )}
          </g>
        );
      })}
    </g>
  );
}
export function InsightBars({
  rows,
  unit,
  targetLabel,
  actualLabel = "Actual",
  onSelect,
  selected = [],
  orientation = "horizontal",
  barHeight,
}: {
  rows: InsightBarRow[];
  unit: Unit;
  targetLabel?: string;
  actualLabel?: string;
  onSelect?: (index: number) => void;
  selected?: string[];
  orientation?: "horizontal" | "vertical";
  barHeight?: number;
}) {
  const semantic = rows.some((row) => row.color);
  const colors = [
    ...new Set(rows.map((row) => row.color ?? chartCssVars.linePrimary)),
  ];
  const data = rows.map((row) => ({
    ...row,
    ...Object.fromEntries(
      colors.map((color, index) => [
        `series${index}`,
        row.color === color || (!row.color && index === 0) ? row.value : 0,
      ]),
    ),
  }));
  const horizontal = orientation === "horizontal";
  const plotHeight = horizontal
    ? rows.length * (targetLabel ? 54 : 38) + 38
    : 0;
  const unitLabel =
    unit === "USD"
      ? "Amount (USD)"
      : unit === "days"
        ? "Days"
        : "Decision count";
  return (
    <div
      className={`insight-bars${horizontal ? "" : " insight-bars-time"}`}
      aria-label={`${unit} by category`}
    >
      <div className="insight-chart-legend">
        <span>{unitLabel}</span>
        {targetLabel && (
          <>
            <span>
              <i style={{ background: chartCssVars.linePrimary }} />
              {actualLabel}
            </span>
            <span>
              <i style={{ background: chartCssVars.lineSecondary }} />
              {targetLabel}
            </span>
          </>
        )}
      </div>
      <div
        className="insight-bars-scroll"
        style={horizontal ? { height: plotHeight } : undefined}
        tabIndex={0}
        role="region"
        aria-label={`${unitLabel} chart; scroll to see all categories`}
      >
        <div
          className="insight-bars-plot"
          style={{
            minHeight: plotHeight,
            height: "100%",
            minWidth: horizontal ? 340 : 0,
          }}
        >
          <BarChart
            data={data}
            xDataKey="label"
            orientation={orientation}
            stacked={semantic}
            className="h-full"
            margin={{
              top: 10,
              right: horizontal ? 88 : 18,
              bottom: 32,
              left: horizontal ? 120 : 52,
            }}
            animationDuration={0}
            barGap={0.3}
            barWidth={barHeight}
          >
            <Grid
              horizontal={!horizontal}
              vertical={horizontal}
              numTicksRows={4}
              numTicksColumns={4}
              strokeDasharray="0"
              strokeOpacity={0.65}
              fadeHorizontal={false}
            />
            {semantic ? (
              colors.map((color, index) => (
                <Bar
                  key={color}
                  dataKey={`series${index}`}
                  fill={color}
                  animate={false}
                  lineCap={3}
                />
              ))
            ) : (
              <Bar
                dataKey="value"
                fill={chartCssVars.linePrimary}
                animate={false}
                lineCap={3}
              />
            )}
            {targetLabel && (
              <Bar
                dataKey="target"
                fill={chartCssVars.lineSecondary}
                animate={false}
                lineCap={3}
              />
            )}
            <InsightAxes rows={rows} unit={unit} targetLabel={targetLabel} />
            <ChartTooltip
              content={({ point }) => (
                <div className="bg-popover text-popover-foreground insight-tooltip">
                  <strong>{String(point.label)}</strong>
                  <div>
                    {actualLabel}: {formatValue(Number(point.value), unit)}
                    {unit === "days" ? " days" : ""}
                  </div>
                  {targetLabel && (
                    <div>
                      {targetLabel}:{" "}
                      {point.target === 0 && targetLabel === "Budget"
                        ? "No configured cap"
                        : formatValue(Number(point.target), unit)}
                    </div>
                  )}
                </div>
              )}
            />
            {onSelect && <ClickSelection onSelect={onSelect} />}
          </BarChart>
        </div>
      </div>
      {!horizontal && (
        <span className="insight-chart-unit">Simulation day</span>
      )}
      {onSelect ? (
        <div className="insight-chart-values" aria-label="Filter by category">
          {rows.map((row, index) => (
            <button
              type="button"
              key={row.label}
              aria-pressed={selected.includes(row.label)}
              onClick={() => onSelect(index)}
            >
              {row.label} <strong>{formatValue(row.value, unit)}</strong>
            </button>
          ))}
        </div>
      ) : (
        <details className="insight-chart-data">
          <summary>View exact values ({rows.length})</summary>
          <div>
            <table>
              <thead>
                <tr>
                  <th>{horizontal ? "Category" : "Simulation day"}</th>
                  <th>
                    {actualLabel} ({unit})
                  </th>
                  {targetLabel && (
                    <th>
                      {targetLabel} ({unit})
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.label}>
                    <th>{row.label}</th>
                    <td>{formatValue(row.value, unit)}</td>
                    {targetLabel && (
                      <td>
                        {row.target === 0 && targetLabel === "Budget"
                          ? "No cap"
                          : formatValue(row.target ?? 0, unit)}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
}
