import type { AgWidgetParams } from "ag-studio";
import type { DailyMetricData, LiveBriefData } from "../registry";
import { useWidgetRows, readString } from "./useWidgetRows";
import { usd } from "./InsightBars";
import { agentSummary } from "../../lib/agent-label";
export function DailyMetric(params: AgWidgetParams<DailyMetricData>) {
  const field = params.dataMapping.value?.[0];
  const value = useWidgetRows(
    params.widgetApi,
    {
      fields: [field],
      ready: !!field,
      select: (rows, keys) => ({ value: rows[0][keys[0]] }),
    },
    [field],
  );
  if (!value || !field) return null;
  return (
    <button
      type="button"
      className="insight-metric"
      onClick={() => params.context?.onMetric?.(params.format?.style?.action)}
    >
      <strong>
        {params.format?.style?.action === "committed"
          ? usd(Number(value.value))
          : params.widgetApi.formatFieldValue(field, value.value)}
      </strong>
      <span>
        {params.format?.style?.action === "pending"
          ? `${params.context?.pendingEarlier ?? 0} from earlier days`
          : params.format?.style?.note}
      </span>
    </button>
  );
}
export function LiveBrief(params: AgWidgetParams<LiveBriefData>) {
  const field = params.dataMapping.value?.[0];
  const value = useWidgetRows(
    params.widgetApi,
    {
      fields: [field],
      ready: !!field,
      select: (rows, keys) => readString(rows[0], keys[0]),
    },
    [field],
  );
  return value ? <p className="insight-live-brief">{agentSummary(value)}</p> : null;
}
