import { settings } from "../config.js";

/** Minimal create_refund schema exposed to the CS agent LLM. */
export function createRefundToolSchema() {
  return {
    name: "create_refund",
    description: "Refund a captured PayPal payment (partial or full) via the PayPal Agent Toolkit.",
    parameters: {
      type: "object",
      properties: {
        capture_id: { type: "string", description: "PayPal capture id to refund" },
        amount: {
          type: "object",
          properties: {
            currency_code: { type: "string" },
            value: { type: "string" },
          },
          required: ["currency_code", "value"],
        },
        note_to_payer: { type: "string" },
      },
      required: ["capture_id", "amount"],
    },
  };
}

export async function getToolkitToolSchemas(): Promise<unknown[]> {
  try {
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
    const anyToolkit = toolkit as { getTools?: () => unknown[]; tools?: unknown[] };
    if (typeof anyToolkit.getTools === "function") return anyToolkit.getTools() as unknown[];
    if (Array.isArray(anyToolkit.tools)) return anyToolkit.tools;
  } catch {
    /* fall through to static schema */
  }
  return [createRefundToolSchema()];
}

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
