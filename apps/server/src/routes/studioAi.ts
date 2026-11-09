import { eq } from "drizzle-orm";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { settings } from "../config.js";
import { nowIso, writeAudit } from "../db/audit.js";
import { db } from "../db/client.js";
import { studioAiRuns } from "../db/schema.js";
import { buildInsightsPayload, refundAnomalies } from "../insights/buildInsights.js";

const ipHits = new Map<string, { count: number; resetAt: number }>();
let dailyTokens = 0;
let dailyDay = new Date().toISOString().slice(0, 10);

function clientIp(req: FastifyRequest): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length) return forwarded.split(",")[0].trim();
  return req.ip || "unknown";
}

function checkRate(ip: string): { ok: boolean; retryAfter?: number } {
  const max = Number(process.env.STUDIO_AI_RATE_PER_MIN || "20");
  const now = Date.now();
  const row = ipHits.get(ip);
  if (!row || row.resetAt <= now) {
    ipHits.set(ip, { count: 1, resetAt: now + 60_000 });
    return { ok: true };
  }
  if (row.count >= max) return { ok: false, retryAfter: Math.ceil((row.resetAt - now) / 1000) };
  row.count += 1;
  return { ok: true };
}

function checkDailyCap(estimateTokens: number): boolean {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== dailyDay) {
    dailyDay = today;
    dailyTokens = 0;
  }
  const cap = Number(process.env.STUDIO_AI_DAILY_CAP || "500000");
  return dailyTokens + estimateTokens <= cap;
}

function bumpTokens(n: number) {
  dailyTokens += Math.max(0, n);
}

export async function registerStudioAiRoutes(app: FastifyInstance) {
  app.post("/api/studio/ai/responses", async (req, reply) => {
    const apiKey = settings.studioOpenAiKey();
    if (!apiKey) {
      return reply.code(503).send({
        error: { message: "Studio AI is not configured. Set AG_STUDIO_OPENAI_API_KEY or OPENAI_API_KEY in .env." },
      });
    }

    const rate = checkRate(clientIp(req));
    if (!rate.ok) {
      return reply
        .code(429)
        .header("Retry-After", String(rate.retryAfter ?? 60))
        .send({ error: { message: "Studio AI rate limit: try again in a minute." } });
    }

    const raw = (req as { rawBody?: string }).rawBody ?? JSON.stringify(req.body ?? {});
    if (raw.length > 256_000) {
      return reply.code(413).send({ error: { message: "Studio AI request too large." } });
    }

    if (!checkDailyCap(4_000)) {
      return reply.code(429).send({
        error: { message: "Demo AI budget is used up for today. Try again tomorrow." },
      });
    }

    const models = settings.studioOpenAiModels();
    const body = (req.body ?? {}) as Record<string, unknown>;
    const model = typeof body.model === "string" && body.model ? body.model : models[0];
    if (!models.includes(model)) {
      return reply.code(400).send({
        error: { message: `Model "${model}" is not enabled. Allowed: ${models.join(", ")}` },
      });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45_000);
    try {
      const upstream = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ ...body, model, max_output_tokens: 8_000 }),
        signal: controller.signal,
      });

      bumpTokens(2_000);
      const contentType = upstream.headers.get("Content-Type") ?? "application/json";
      reply.code(upstream.status).header("Cache-Control", "no-store").type(contentType);

      if (!upstream.body) {
        return reply.send(await upstream.text());
      }

      const { Readable } = await import("node:stream");
      return reply.send(Readable.fromWeb(upstream.body as import("node:stream/web").ReadableStream));
    } catch (error) {
      const message =
        error instanceof Error && error.name === "AbortError"
          ? "Studio AI timed out talking to OpenAI."
          : error instanceof Error
            ? error.message
            : "Studio AI upstream failed";
      return reply.code(502).send({ error: { message } });
    } finally {
      clearTimeout(timeout);
    }
  });

  app.post("/api/studio/telemetry", async (req) => {
    const body = req.body as {
      events?: {
        type: string;
        trace?: { threadId?: string; runId?: string; agentId?: string };
        query?: string;
        status?: string;
        error?: string;
        usage?: { totalTokens?: number; inputTokens?: number; outputTokens?: number };
        toolName?: string;
        timestamp?: number;
      }[];
    };
    const events = body.events ?? [];
    const byRun = new Map<
      string,
      {
        threadId: string;
        runId: string;
        agentId: string;
        query?: string;
        status: string;
        toolCalls: { name: string; at: number }[];
        usage: Record<string, number>;
        error?: string;
        createdAt: string;
        finishedAt?: string;
      }
    >();

    for (const event of events) {
      const threadId = event.trace?.threadId ?? "unknown";
      const runId = event.trace?.runId ?? "unknown";
      const agentId = event.trace?.agentId ?? "unknown";
      const key = `${threadId}:${runId}`;
      const cur = byRun.get(key) ?? {
        threadId,
        runId,
        agentId,
        status: "running",
        toolCalls: [],
        usage: {},
        createdAt: nowIso(),
      };
      if (event.type === "run_started") {
        cur.query = event.query;
        cur.createdAt = new Date(event.timestamp ?? Date.now()).toISOString();
      }
      if (event.type === "tool_execution_started" || event.type === "tool_execution_finished") {
        if (event.toolName) cur.toolCalls.push({ name: event.toolName, at: event.timestamp ?? Date.now() });
      }
      if (event.type === "turn_finished" && event.usage) {
        const u = event.usage;
        cur.usage.inputTokens = (cur.usage.inputTokens ?? 0) + (u.inputTokens ?? 0);
        cur.usage.outputTokens = (cur.usage.outputTokens ?? 0) + (u.outputTokens ?? 0);
        cur.usage.totalTokens =
          (cur.usage.totalTokens ?? 0) + (u.totalTokens ?? (u.inputTokens ?? 0) + (u.outputTokens ?? 0));
        bumpTokens(u.totalTokens ?? (u.inputTokens ?? 0) + (u.outputTokens ?? 0));
      }
      if (event.type === "run_finished") {
        cur.status = event.status ?? "ok";
        cur.error = event.error;
        cur.finishedAt = new Date(event.timestamp ?? Date.now()).toISOString();
      }
      byRun.set(key, cur);
    }

    for (const run of byRun.values()) {
      const id = `studio-run-${run.runId}`;
      const existing = await db().select().from(studioAiRuns).where(eq(studioAiRuns.id, id));
      const row = {
        id,
        threadId: run.threadId,
        runId: run.runId,
        agentId: run.agentId,
        query: run.query ?? null,
        status: run.status,
        toolCallsJson: run.toolCalls,
        usageJson: run.usage,
        error: run.error ?? null,
        createdAt: run.createdAt,
        finishedAt: run.finishedAt ?? null,
      };
      if (existing.length) {
        await db()
          .update(studioAiRuns)
          .set({
            status: row.status,
            toolCallsJson: row.toolCallsJson,
            usageJson: row.usageJson,
            error: row.error,
            finishedAt: row.finishedAt,
            query: row.query,
            agentId: row.agentId,
          })
          .where(eq(studioAiRuns.id, id));
      } else {
        await db().insert(studioAiRuns).values(row);
      }
      await writeAudit({
        actor: "studio-ai",
        agent: run.agentId,
        event: "studio.run",
        message: `Studio AI ${run.agentId} run ${run.status}: ${(run.query ?? "").slice(0, 120)} · tools=${run.toolCalls.map((t) => t.name).join(",") || "none"} · tokens=${run.usage.totalTokens ?? 0}`,
        after: { runId: run.runId, toolCalls: run.toolCalls, usage: run.usage },
      });
    }

    return { ok: true, runs: byRun.size };
  });

  app.get("/api/studio/tools/refund-anomalies", async (req) => {
    const windowDays = Number((req.query as { windowDays?: string }).windowDays ?? "30");
    const payload = await buildInsightsPayload();
    const recent = payload.refunds.filter((r) => r.day >= -Math.abs(windowDays));
    return refundAnomalies(
      recent.map((r) => ({ day: r.day, amount: r.amount })),
      2,
    );
  });

  app.get("/api/studio/tools/cash-runway", async () => {
    const payload = await buildInsightsPayload();
    return {
      budgetBurn: payload.kpis.budgetBurn,
      pending: payload.kpis.pending,
      spendToday: payload.kpis.spendToday,
      budget: payload.kpis.budget,
      payoutsPending: payload.payouts.filter((p) =>
        ["PENDING", "UNCLAIMED", "pending_approval", "SUCCESS"].includes(p.status),
      ),
    };
  });

  app.get("/api/studio/tools/reorder-risk", async () => {
    const payload = await buildInsightsPayload();
    return payload.inventory
      .filter((row) => row.daysOfCover < row.leadTimeDays + 2)
      .map((row) => ({
        sku: row.sku,
        name: row.name,
        stock: row.stock,
        daysOfCover: row.daysOfCover,
        leadTimeDays: row.leadTimeDays,
        gap: Number((row.leadTimeDays + 2 - row.daysOfCover).toFixed(1)),
      }));
  });
}
