import { useLayoutEffect } from "react";
import { GridWidget, type AgGridWidgetProps } from "ag-studio-react";
import { InsightEmptyState } from "./InsightEmptyState";

/** Keep Studio's native grid; explain genuinely empty domain sources before mounting it. */
export function InsightGrid(params: AgGridWidgetProps) {
  const fields = params.dataMapping.cols ?? [];
  const source = fields.some((field) =>
    String(field.fieldId).startsWith("studio_ai_runs."),
  )
    ? "studio_ai_runs"
    : fields.some((field) => String(field.fieldId).startsWith("payouts."))
      ? "payouts"
      : null;
  const empty = source !== null && params.context?.sourceCounts?.[source] === 0;
  useLayoutEffect(() => {
    if (empty) params.widgetApi.setDisplayState("displayed");
  }, [empty, params]);
  return empty && source ? (
    <InsightEmptyState source={source} context={params.context ?? {}} />
  ) : (
    <GridWidget {...params} />
  );
}
