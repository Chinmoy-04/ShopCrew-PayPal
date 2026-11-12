import type { AgWidgetParams } from "ag-studio";
import type { DecisionTickerData } from "../registry";
import { readNumber, readString, useWidgetRows } from "./useWidgetRows";

type TickerRow = {
  summary: string;
  status: string;
  amount: number;
  agent: string;
};

function statusChipClass(status: string): string {
  const s = status.toLowerCase();
  if (s.includes("pending")) return "badge pending";
  if (s.includes("reject") || s.includes("denied")) return "badge rejected";
  if (s.includes("auto")) return "badge auto_approved";
  if (s.includes("approv") || s.includes("confirm")) return "badge confirmed";
  return "badge neutral";
}

/** Scrolling list of recent decisions with status chips. */
export function DecisionTicker(params: AgWidgetParams<DecisionTickerData>) {
  const mapped = params.dataMapping.rows ?? [];
  const maxRows = params.format?.style?.maxRows ?? 12;

  const rows = useWidgetRows<TickerRow[]>(
    params.widgetApi,
    {
      fields: mapped,
      sort: params.sort,
      ready: mapped.length > 0,
      select: (raw, keys) => {
        const summaryKey = keys[0] ?? "";
        const statusKey = keys[1] ?? "";
        const amountKey = keys[2] ?? "";
        const agentKey = keys[3] ?? "";
        return raw.slice(0, maxRows).map((row) => ({
          summary: readString(row, summaryKey),
          status: readString(row, statusKey),
          amount: readNumber(row, amountKey),
          agent: readString(row, agentKey),
        }));
      },
    },
    [params.dataMapping.rows, params.sort, maxRows],
  );

  if (!rows?.length) return null;

  return (
    <div className="sc-ticker">
      <ul className="sc-ticker__list">
        {rows.map((row, i) => (
          <li key={`${row.summary}-${i}`} className="sc-ticker__item">
            <span className={statusChipClass(row.status)}>
              {row.status.replace(/_/g, " ")}
            </span>
            <p className="sc-ticker__summary">{row.summary}</p>
            <div className="sc-ticker__foot">
              <span>{row.agent}</span>
              {row.amount > 0 && <strong>${row.amount.toFixed(2)}</strong>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
