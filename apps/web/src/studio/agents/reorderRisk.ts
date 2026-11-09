import type { AgAnyAiAgentDefinition, AgAiTool, AgLlmAdapter } from "ag-studio";
import { directLlmRunner } from "ag-studio";

export function reorderRiskAgent(
  adapter: AgLlmAdapter,
  customTools: { getReorderRisk: AgAiTool },
) {
  const definition: AgAnyAiAgentDefinition = {
    id: "reorder-risk",
    name: "Reorder risk",
    description: "Flags SKUs that stock out before supplier lead time.",
    schema: (s) => s.undefined(),
    instructions: () =>
      [
        "You are ShopCrew's reorder-risk specialist.",
        "Call get_reorder_risk, then prefer the cover-heat ShopCrew widget.",
        "Speak in days of cover vs lead time.",
      ].join(" "),
    tools: (ctx) => [
      customTools.getReorderRisk,
      ctx.studio.executeQuery(),
      ctx.studio.viewSchema(),
      ctx.tools.delegateTo(["widget"]),
    ],
    maxTurns: 10,
  };
  return directLlmRunner({ ...definition, adapter });
}
