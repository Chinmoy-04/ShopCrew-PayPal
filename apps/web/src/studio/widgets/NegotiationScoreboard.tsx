import type { AgWidgetParams } from "ag-studio";
import type { NegotiationScoreboardData } from "../registry";
import { readNumber, readString, useWidgetRows } from "./useWidgetRows";

type ScoreRow = { supplier: string; saving: number };

/** Ranked supplier savings from negotiations. */
export function NegotiationScoreboard(params: AgWidgetParams<NegotiationScoreboardData>) {
  const category = params.dataMapping.category?.[0];
  const value = params.dataMapping.value?.[0];
  const maxRows = params.format?.style?.maxRows ?? 8;

  const rows = useWidgetRows<ScoreRow[]>(
    params.widgetApi,
    {
      fields: [category, value],
      sort: params.sort,
      ready: !!(category && value),
      select: (raw, keys) => {
        const [catKey, valKey] = keys;
        return raw
          .map((row) => ({
            supplier: readString(row, catKey),
            saving: readNumber(row, valKey),
          }))
          .filter((r) => r.saving > 0)
          .sort((a, b) => b.saving - a.saving)
          .slice(0, maxRows);
      },
    },
    [params.dataMapping.category, params.dataMapping.value, params.sort, maxRows],
  );

  if (!rows?.length) return null;

  const top = rows[0]?.saving ?? 1;

  return (
    <div className="sc-nego">
      {params.format?.title?.enabled !== false && params.format?.title?.text && (
        <div className="sc-nego__title">{params.format.title.text}</div>
      )}
      <ol className="sc-nego__board">
        {rows.map((row, i) => (
          <li key={row.supplier} className="sc-nego__row">
            <span className="sc-nego__rank">{i + 1}</span>
            <div className="sc-nego__body">
              <div className="sc-nego__meta">
                <span>{row.supplier}</span>
                <strong>${row.saving.toFixed(0)}</strong>
              </div>
              <div className="sc-nego__track">
                <div className="sc-nego__fill" style={{ width: `${(row.saving / top) * 100}%` }} />
              </div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
