import type { AgWidgetParams } from "ag-studio";
import type { BudgetBurnData } from "../registry";
import { readNumber, readString, useWidgetRows } from "./useWidgetRows";

type BurnRow = { agent: string; spend: number; budget: number };

function tone(spend: number, budget: number): "ok" | "warn" | "bad" {
  if (budget <= 0) return spend > 0 ? "warn" : "ok";
  const ratio = spend / budget;
  if (ratio >= 1) return "bad";
  if (ratio >= 0.85) return "warn";
  return "ok";
}

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
          .sort((a, b) => b.spend / Math.max(b.budget, 1) - a.spend / Math.max(a.budget, 1));
      },
    },
    [params.dataMapping.category, params.dataMapping.value, params.dataMapping.target, params.sort],
  );

  if (!rows?.length) return null;

  return (
    <div className="sc-burn">
      {params.format?.title?.enabled !== false && params.format?.title?.text && (
        <div className="sc-burn__title">{params.format.title.text}</div>
      )}
      <ul className="sc-burn__list">
        {rows.map((row) => {
          const pct = row.budget > 0 ? Math.min(1.2, row.spend / row.budget) : 0;
          const t = tone(row.spend, row.budget);
          return (
            <li key={row.agent} className={`sc-burn__row sc-burn__row--${t}`}>
              <div className="sc-burn__meta">
                <span>{row.agent}</span>
                <span>
                  ${row.spend.toFixed(0)} / ${row.budget.toFixed(0)}
                </span>
              </div>
              <div className="sc-burn__track">
                <div className="sc-burn__fill" style={{ width: `${Math.min(100, pct * 100)}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
