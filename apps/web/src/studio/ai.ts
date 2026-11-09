import type { AgAiHarnessSetup, AgAiModel, AgAiPromptStarter, AgAiTool } from "ag-studio";
import { createAiHarness, directLlmRunner } from "ag-studio";
import { cashPlannerAgent } from "./agents/cashPlanner";
import { refundSentinelAgent } from "./agents/refundSentinel";
import { reorderRiskAgent } from "./agents/reorderRisk";
import { openaiAdapter } from "./openai-adapter";
import { shopCrewObserver } from "./telemetry";
import { registerShopCrewTools } from "./tools";

const PROMPT_STARTERS: AgAiPromptStarter[] = [
  {
    label: "Refund anomaly?",
    prompt: "Is any agent refunding unusually much? Build a refund anomaly widget for the last 30 days.",
  },
  {
    label: "Payout pipeline",
    prompt: "Build me a payout pipeline showing proposed through canceled dollars.",
  },
  {
    label: "Budget runway",
    prompt: "Will we stay inside today's budgets? Show per-agent burn.",
  },
  {
    label: "Stock-out risk",
    prompt: "Which SKUs stock out before the supplier can deliver? Prefer cover-heat.",
  },
  {
    label: "Needs my approval",
    prompt: "What is waiting for my approval? Summarise pending refunds and payouts.",
  },
  {
    label: "What agents did",
    prompt: "Explain what the agents did today and add a decision ticker.",
  },
];

const SHOPCREW_WIDGET_HINT =
  "Prefer ShopCrew custom widgets (refund-anomaly-strip, payout-pipeline, budget-burn, cover-heat, negotiation-scoreboard, decision-ticker, pulse-meter, status-stack). Use USD and sim-day wording.";

/** Build Studio AI harness with ShopCrew lead + domain specialists when OpenAI is configured. */
export function buildStudioAi(models: string[]): AgAiHarnessSetup {
  const adapter = openaiAdapter({
    endpoint: "/api/studio/ai",
    model: models[0] ?? "gpt-4.1-mini",
  });

  const modelList: AgAiModel[] = models.map((id) => ({
    id,
    label: id,
  }));

  return ({ api }) => {
    const custom = registerShopCrewTools(api);
    // defineAiTool returns a definition; resolve live tools via api when possible.
    const asTool = (def: unknown): AgAiTool => def as AgAiTool;

    return createAiHarness(api, ({ tools, builtIn }) => {
      const refundSentinel = refundSentinelAgent(adapter, {
        getRefundAnomalies: asTool(custom.getRefundAnomalies),
      });
      const cashPlanner = cashPlannerAgent(adapter, {
        getCashRunway: asTool(custom.getCashRunway),
      });
      const reorderRisk = reorderRiskAgent(adapter, {
        getReorderRisk: asTool(custom.getReorderRisk),
      });

      const shopcrewLead = directLlmRunner({
        ...builtIn.lead,
        id: "shopcrew-lead",
        name: "ShopCrew lead",
        description: "Routes ShopCrew questions to refund-sentinel, cash-planner, reorder-risk, or built-in specialists.",
        schema: (s) => s.undefined(),
        instructions: (ctx, params) => {
          const base =
            typeof builtIn.lead.instructions === "function"
              ? builtIn.lead.instructions(ctx, params)
              : "You are the ShopCrew lead agent.";
          return `${base} ${SHOPCREW_WIDGET_HINT} Delegate refund spikes to refund-sentinel, budget questions to cash-planner, stock cover to reorder-risk.`;
        },
        tools: (ctx, params) => {
          const base =
            typeof builtIn.lead.tools === "function" ? builtIn.lead.tools(ctx, params) : [];
          return [
            ...base,
            tools.delegateTo([
              "data",
              "page",
              "planning",
              "widget",
              "refund-sentinel",
              "cash-planner",
              "reorder-risk",
            ]),
          ];
        },
        adapter,
      });

      const flavour = (id: "data" | "page" | "planning" | "widget") =>
        directLlmRunner({
          ...builtIn[id],
          instructions: (ctx, params) => {
            const base =
              typeof builtIn[id].instructions === "function"
                ? builtIn[id].instructions(ctx, params)
                : `You are the ${id} agent.`;
            return `${base} ${SHOPCREW_WIDGET_HINT}`;
          },
          adapter,
        });

      return {
        primary: "shopcrew-lead",
        agents: [
          shopcrewLead,
          refundSentinel,
          cashPlanner,
          reorderRisk,
          flavour("data"),
          flavour("page"),
          flavour("planning"),
          flavour("widget"),
        ],
        models: modelList.length ? modelList : undefined,
        promptStarters: PROMPT_STARTERS,
        observers: [shopCrewObserver],
      };
    });
  };
}
