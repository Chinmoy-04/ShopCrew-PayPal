import { task, type TaskContext } from "@renderinc/sdk/workflows";
import { analyzeInventory, analyzeSpending, buildReport, snapshotSchema, type OperationsSnapshot } from "./analysis.js";

const options = { timeoutSeconds: 120, retry: { maxRetries: 2, waitDurationMs: 1000, backoffScaling: 2 } };

export const inventoryReview = task({ ...options, name: "inventoryReview" },
  (_ctx: TaskContext, snapshot: OperationsSnapshot) => analyzeInventory(snapshotSchema.parse(snapshot)));

export const spendingReview = task({ ...options, name: "spendingReview" },
  (_ctx: TaskContext, snapshot: OperationsSnapshot) => analyzeSpending(snapshotSchema.parse(snapshot)));

export const operationsReview = task({ ...options, name: "operationsReview", timeoutSeconds: 300 },
  async (ctx: TaskContext, input: OperationsSnapshot, requestId: string) => {
    const snapshot = snapshotSchema.parse(input);
    const [inventory, spending] = await Promise.all([
      ctx.run(inventoryReview, snapshot), ctx.run(spendingReview, snapshot),
    ]);
    const report = buildReport(requestId, snapshot, inventory, spending);
    const base = process.env.SHOPCREW_BASE_URL;
    const token = process.env.WORKFLOW_CALLBACK_TOKEN;
    if (!base || !token) throw new Error("Workflow callback environment is not configured.");
    const response = await fetch(`${base.replace(/\/$/, "")}/api/workflows/results`, {
      method: "POST", headers: { "content-type": "application/json", "x-workflow-token": token },
      body: JSON.stringify(report), signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`Saving operations report failed (${response.status}).`);
    return report;
  });
