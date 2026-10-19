import { settings } from "../config.js";

export async function callToolkit(name: string, args: Record<string, unknown>): Promise<unknown> {
  const paypal = settings.paypal();
  const mod = await import("@paypal/agent-toolkit/openai");
  const toolkit = new mod.PayPalAgentToolkit({
    clientId: paypal.clientId,
    clientSecret: paypal.clientSecret,
    configuration: {
      actions: {
        orders: { get: true, create: true, capture: true },
        payments: { createRefund: true, getRefunds: true },
      },
      context: { sandbox: paypal.env !== "live" },
    },
  });
  const result = await toolkit.handleToolCall({
    id: `call_${Date.now()}`,
    type: "function",
    function: { name, arguments: JSON.stringify(args) },
  } as never);
  const content = typeof result.content === "string" ? result.content : JSON.stringify(result.content ?? "");
  try {
    return JSON.parse(content);
  } catch {
    return { raw: content };
  }
}
