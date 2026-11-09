import { afterAll, describe, expect, it, vi } from "vitest";
import Fastify from "fastify";
import os from "node:os";
import path from "node:path";
import { analyzeInventory, analyzeSpending, buildReport, type OperationsSnapshot } from "../src/workflows/analysis.js";

const startTask = vi.fn(async () => ({ taskRunId: "run-test" }));
vi.mock("@renderinc/sdk", () => ({ Render: class { workflows = { startTask }; } }));

const snapshot: OperationsSnapshot = {
  simDay: 1, capturedAt: new Date().toISOString(), pendingApprovals: 2,
  products: [
    { sku: "LOW", stock: 2, leadTimeDays: 5, sales: Array(28).fill(10) },
    { sku: "IDLE", stock: 2, leadTimeDays: 5, sales: [] },
  ],
  spend: [{ agent: "cs", amount: 90, budget: 100 }],
};

describe("Render operations review", () => {
  afterAll(() => vi.unstubAllEnvs());
  it("identifies stock risk and budget pressure, handling empty demand", () => {
    const inventory = analyzeInventory(snapshot);
    expect(inventory[0].atRisk).toBe(true);
    expect(inventory[1].daysOfCover).toBeNull();
    expect(analyzeSpending(snapshot)[0]).toMatchObject({ remaining: 10, nearLimit: true });
  });
  it("chains both registered tasks and posts their combined report", async () => {
    vi.stubEnv("SHOPCREW_BASE_URL", "https://shopcrew.example");
    vi.stubEnv("WORKFLOW_CALLBACK_TOKEN", "test-callback");
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    try {
      const { operationsReview } = await import("../src/workflows/index.js");
      const run = vi.fn(async (definition: { name: string; func: Function }, input: OperationsSnapshot) => definition.func({}, input));
      const report = await operationsReview.func({ run } as never, snapshot, crypto.randomUUID());
      expect(run.mock.calls.map(([task]) => task.name).sort()).toEqual(["inventoryReview", "spendingReview"]);
      expect(report.inventory[0].atRisk).toBe(true);
      expect(fetchMock.mock.calls[0][0]).toBe("https://shopcrew.example/api/workflows/results");
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it("authenticates dispatch and callbacks and stores retried reports once", async () => {
    vi.stubEnv("PGLITE_DIR", path.join(os.tmpdir(), `shopcrew-workflows-${crypto.randomUUID()}`));
    vi.stubEnv("ADMIN_TOKEN", "test-admin");
    vi.stubEnv("WORKFLOW_CALLBACK_TOKEN", "test-callback");
    vi.stubEnv("RENDER_API_KEY", "test-render");
    vi.stubEnv("RENDER_WORKFLOW_SLUG", "test-workflow");
    const { initDb, closeDb } = await import("../src/db/client.js");
    const { resetDatabase } = await import("../src/db/seed.js");
    const { registerWorkflowRoutes } = await import("../src/routes/workflows.js");
    await initDb();
    await resetDatabase();
    const app = Fastify();
    await registerWorkflowRoutes(app);
    try {
      expect((await app.inject({ method: "POST", url: "/api/workflows/review" })).statusCode).toBe(401);
      const dispatched = await app.inject({ method: "POST", url: "/api/workflows/review", headers: { "x-admin-token": "test-admin" } });
      expect(dispatched.statusCode).toBe(202);
      expect(dispatched.json().runId).toBe("run-test");
      expect(startTask.mock.calls.length).toBe(1);
      const report = buildReport(crypto.randomUUID(), snapshot, analyzeInventory(snapshot), analyzeSpending(snapshot));
      expect((await app.inject({ method: "POST", url: "/api/workflows/results", payload: report })).statusCode).toBe(401);
      const request = { method: "POST" as const, url: "/api/workflows/results", payload: report, headers: { "x-workflow-token": "test-callback" } };
      expect((await app.inject(request)).json()).toEqual({ ok: true, duplicate: false });
      expect((await app.inject(request)).json()).toEqual({ ok: true, duplicate: true });
      const reports = (await app.inject("/api/workflows/reports")).json();
      expect(reports).toHaveLength(1);
      expect(reports[0].afterJson.inventory[0].atRisk).toBe(true);
      expect((await app.inject({ ...request, payload: { invalid: true } })).statusCode).toBe(400);
    } finally {
      await app.close();
      await closeDb();
    }
  });
});
