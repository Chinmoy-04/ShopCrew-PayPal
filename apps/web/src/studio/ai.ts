import type { AgAiHarnessSetup, AgAiModel, AgAiPromptStarter } from "ag-studio";
import { createAiHarness } from "ag-studio";
import { openaiAdapter } from "./openai-adapter";

const PROMPT_STARTERS: AgAiPromptStarter[] = [
  {
    label: "Summarise operations",
    prompt:
      "Summarise what this Insights report shows across Operations, Money and Inventory. Call out pending approvals, spend, and anything that needs attention.",
  },
  {
    label: "Money movers",
    prompt:
      "Which agent decisions move money (refunds or payouts)? Break down amounts by agent and status, and highlight anything still pending approval.",
  },
  {
    label: "Reorder risk",
    prompt:
      "Which SKUs need reorder based on stock vs reorder point and days of cover? Suggest what the inventory agent should prioritise.",
  },
];

/** Build Studio AI harness when OpenAI is configured on the server. */
export function buildStudioAi(models: string[]): AgAiHarnessSetup {
  const adapter = openaiAdapter({
    endpoint: "/api/studio/ai",
    // Key stays on the server; adapter posts to our proxy with no client secret.
    model: models[0] ?? "gpt-4.1-mini",
  });

  const modelList: AgAiModel[] = models.map((id) => ({
    id,
    label: id,
  }));

  return ({ api }) =>
    createAiHarness(api, {
      adapter,
      primary: "lead",
      models: modelList.length ? modelList : undefined,
      promptStarters: PROMPT_STARTERS,
    });
}
