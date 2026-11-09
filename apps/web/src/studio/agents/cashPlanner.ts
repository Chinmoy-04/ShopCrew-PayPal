import type { AgAnyAiAgentDefinition, AgAiTool, AgLlmAdapter } from "ag-studio";
import { directLlmRunner } from "ag-studio";

export function cashPlannerAgent(
  adapter: AgLlmAdapter,
  customTools: { getCashRunway: AgAiTool },
) {
  const definition: AgAnyAiAgentDefinition = {
    id: "cash-planner",
    name: "Cash planner",
    description: "Compares budgets, pending approvals and payouts; answers will we run out today?",
    schema: (s) => s.undefined(),
    instructions: () =>
      [
        "You are ShopCrew's cash-planner.",
        "Call get_cash_runway first. Prefer budget-burn and payout-pipeline ShopCrew widgets.",
        "Amounts are USD. Answer whether today's budgets will hold.",
      ].join(" "),
    tools: (ctx) => [
      customTools.getCashRunway,
      ctx.studio.executeQuery(),
      ctx.studio.viewSchema(),
      ctx.tools.delegateTo(["widget"]),
    ],
    maxTurns: 10,
  };
  return directLlmRunner({ ...definition, adapter });
}
