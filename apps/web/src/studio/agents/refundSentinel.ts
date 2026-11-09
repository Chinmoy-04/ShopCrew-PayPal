import type { AgAnyAiAgentDefinition, AgAiTool, AgLlmAdapter } from "ag-studio";
import { directLlmRunner } from "ag-studio";

export function refundSentinelAgent(
  adapter: AgLlmAdapter,
  customTools: { getRefundAnomalies: AgAiTool },
) {
  const definition: AgAnyAiAgentDefinition = {
    id: "refund-sentinel",
    name: "Refund sentinel",
    description:
      "Finds unusual refund behaviour (z-score spikes) and asks the widget agent to build a refund-anomaly-strip.",
    schema: (s) =>
      s.object({
        windowDays: s.number().optional(),
      }),
    instructions: () =>
      [
        "You are ShopCrew's refund-sentinel specialist.",
        "Use get_refund_anomalies, then executeQuery on the refunds source if needed.",
        "Prefer ShopCrew widget refund-anomaly-strip. Amounts are USD; speak in sim-day wording.",
        "When you find a spike, hand off to the widget agent to place refund-anomaly-strip on the page.",
      ].join(" "),
    tools: (ctx) => [
      customTools.getRefundAnomalies,
      ctx.studio.executeQuery(),
      ctx.studio.viewSchema(),
      ctx.tools.delegateTo(["widget"]),
    ],
    maxTurns: 12,
  };
  return directLlmRunner({ ...definition, adapter });
}
