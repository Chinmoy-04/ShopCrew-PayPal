import type { AgStudioApi } from "ag-studio";

/** Register ShopCrew domain tools on the Studio API for custom agents. */
export function registerShopCrewTools(api: AgStudioApi) {
  const getRefundAnomalies = api.defineAiTool({
    name: "get_refund_anomalies",
    description: "Return z-score refund anomalies for the last N sim days (default 30).",
    params: (s) =>
      s.object({
        windowDays: s.number().optional(),
      }),
    async execute(args, ctx) {
      try {
        const windowDays = Number(args.windowDays ?? 30);
        const res = await fetch(`/api/studio/tools/refund-anomalies?windowDays=${windowDays}`);
        const data = await res.json();
        if (!res.ok) return ctx.error(data.error?.message ?? "Failed to load anomalies");
        return ctx.success(JSON.stringify(data), data);
      } catch (error) {
        return ctx.error(error instanceof Error ? error.message : "Failed to load anomalies");
      }
    },
  });

  const getCashRunway = api.defineAiTool({
    name: "get_cash_runway",
    description: "Compare per-agent budgets, pending approvals, spend today, and payout exposure.",
    params: (s) => s.object({}),
    async execute(_args, ctx) {
      try {
        const res = await fetch("/api/studio/tools/cash-runway");
        const data = await res.json();
        if (!res.ok) return ctx.error(data.error?.message ?? "Failed to load cash runway");
        return ctx.success(JSON.stringify(data), data);
      } catch (error) {
        return ctx.error(error instanceof Error ? error.message : "Failed to load cash runway");
      }
    },
  });

  const getReorderRisk = api.defineAiTool({
    name: "get_reorder_risk",
    description: "List SKUs whose days of cover fall below supplier lead time + 2.",
    params: (s) => s.object({}),
    async execute(_args, ctx) {
      try {
        const res = await fetch("/api/studio/tools/reorder-risk");
        const data = await res.json();
        if (!res.ok) return ctx.error(data.error?.message ?? "Failed to load reorder risk");
        return ctx.success(JSON.stringify(data), data);
      } catch (error) {
        return ctx.error(error instanceof Error ? error.message : "Failed to load reorder risk");
      }
    },
  });

  return { getRefundAnomalies, getCashRunway, getReorderRisk };
}
