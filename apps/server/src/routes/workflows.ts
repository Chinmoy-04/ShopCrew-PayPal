import { timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { settings } from "../config.js";
import { bus } from "../bus/events.js";
import { db } from "../db/client.js";
import { auditLog, policies, products, proposals, salesDaily, simState } from "../db/schema.js";
import { nowIso } from "../db/audit.js";
import { spentToday } from "../agents/gate.js";
import { reportSchema, type OperationsSnapshot } from "../workflows/analysis.js";

function authorize(actual: unknown, expected: string) {
  const a = Buffer.from(typeof actual === "string" ? actual : "");
  const b = Buffer.from(expected);
  if (!b.length || a.length !== b.length || !timingSafeEqual(a, b)) {
    throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });
  }
}

export async function registerWorkflowRoutes(app: FastifyInstance) {
  app.post("/api/workflows/review", { config: { rateLimit: { max: 3, timeWindow: "1 minute" } } }, async (req, reply) => {
    authorize(req.headers["x-admin-token"], settings.adminToken());
    const apiKey = process.env.RENDER_API_KEY;
    const slug = process.env.RENDER_WORKFLOW_SLUG;
    if (!apiKey || !slug) return reply.code(503).send({ error: "Render Workflows is not configured." });
    const [sim] = await db().select().from(simState);
    const catalog = await db().select().from(products);
    const sales = await db().select().from(salesDaily);
    const policyRows = await db().select().from(policies);
    const decisions = await db().select().from(proposals);
    const snapshot: OperationsSnapshot = {
      simDay: sim.simDay, capturedAt: nowIso(),
      products: catalog.map((p) => ({ sku: p.sku, stock: p.stock, leadTimeDays: p.leadTimeDays,
        sales: sales.filter((s) => s.productId === p.id).sort((a, b) => a.simDay - b.simDay).map((s) => s.units) })),
      spend: await Promise.all(policyRows.map(async (p) => ({ agent: p.agent, budget: p.dailyBudget, amount: await spentToday(p.agent, sim.simDay) }))),
      pendingApprovals: decisions.filter((p) => p.status === "pending_approval").length,
    };
    const requestId = crypto.randomUUID();
    const { Render } = await import("@renderinc/sdk");
    const render = new Render({ token: apiKey });
    const run = await render.workflows.startTask(`${slug}/operationsReview`, [snapshot, requestId], { idempotencyKey: requestId });
    return reply.code(202).send({ requestId, runId: run.taskRunId, status: "submitted" });
  });

  app.post("/api/workflows/results", async (req) => {
    authorize(req.headers["x-workflow-token"], process.env.WORKFLOW_CALLBACK_TOKEN || "");
    const parsed = reportSchema.safeParse(req.body);
    if (!parsed.success) throw Object.assign(new Error("Invalid workflow report"), { statusCode: 400 });
    const report = parsed.data;
    const row = {
      id: `render-review-${report.requestId}`, ts: nowIso(), actor: "system", agent: "render-workflows",
      event: "workflow.operations_review", correlationId: report.requestId,
      afterJson: report, message: report.summary,
    };
    const inserted = await db().insert(auditLog).values(row).onConflictDoNothing().returning();
    if (inserted.length) bus.emit({ type: "audit.appended", entry: inserted[0] });
    return { ok: true, duplicate: inserted.length === 0 };
  });

  app.get("/api/workflows/reports", async () => {
    const rows = await db().select().from(auditLog).where(eq(auditLog.event, "workflow.operations_review"));
    return rows.sort((a, b) => b.ts.localeCompare(a.ts)).slice(0, 20);
  });
}
