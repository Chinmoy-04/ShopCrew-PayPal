import { InsightBars } from "./InsightBars";
import { agentLabel } from "../../lib/agent-label";
import type { AgWidgetParams } from "ag-studio";
import type { BudgetBurnData } from "../registry";
import { readNumber, readString, useWidgetRows } from "./useWidgetRows";

type BurnRow = { agent: string; spend: number; budget: number };

/** Per-agent spend against daily budget. */
export function BudgetBurn(params: AgWidgetParams<BudgetBurnData>) {
  const category = params.dataMapping.category?.[0];
  const value = params.dataMapping.value?.[0];
  const target = params.dataMapping.target?.[0];

  const rows = useWidgetRows<BurnRow[]>(
    params.widgetApi,
    {
      fields: [category, value, target],
      sort: params.sort,
      ready: !!(category && value && target),
      select: (raw, keys) => {
        const [catKey, valKey, targetKey] = keys;
        return raw
          .map((row) => ({
            agent: readString(row, catKey),
            spend: readNumber(row, valKey),
            budget: readNumber(row, targetKey),
          }))
          .sort(
            (a, b) =>
              b.spend / Math.max(b.budget, 1) - a.spend / Math.max(a.budget, 1),
          );
      },
    },
    [
      params.dataMapping.category,
      params.dataMapping.value,
      params.dataMapping.target,
      params.sort,
    ],
  );

  if (!rows?.length) return null;

  const daily = String(value?.fieldId).startsWith("daily_budget_burn.");
  return (
    <div className="insight-budget-bars">
      <InsightBars
        rows={rows.map((row) => ({
          label: agentLabel(row.agent),
          value: row.spend,
          target: row.budget,
        }))}
        unit="USD"
        targetLabel="Budget"
        actualLabel={daily ? "Committed today" : "Recorded spend"}
      />
      <p className="insight-chart-caption">
        {daily
          ? "Today's monetary commitments vs configured daily caps."
          : "Available-history spending vs configured daily caps."}
      </p>
    </div>
  );
}
