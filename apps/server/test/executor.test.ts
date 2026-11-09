import { describe, expect, it, vi } from "vitest";

vi.mock("../src/paypal/toolkit.js", () => ({
  callToolkit: vi.fn(async () => {
    throw new Error("toolkit down");
  }),
  createRefundToolSchema: () => ({ name: "create_refund" }),
  getToolkitToolSchemas: async () => [],
}));

vi.mock("../src/paypal/rest.js", () => {
  const requestWithRetry = vi.fn(async (_method: string, _path: string, _body: unknown, idempotencyKey: string) => ({
    id: "RFD-REST-1",
    status: "COMPLETED",
    idempotencyKey,
  }));
  return {
    PayPalError: class PayPalError extends Error {
      status: number;
      constructor(message: string, status = 400) {
        super(message);
        this.status = status;
      }
    },
    paypal: {
      configured: () => true,
      request: vi.fn(),
      requestWithRetry,
    },
  };
});

vi.mock("../src/paypal/events.js", () => ({
  applyPayPalEvent: vi.fn(async () => undefined),
}));

describe("refundCapture REST fallback", () => {
  it("calls REST with the same PayPal-Request-Id when toolkit throws", async () => {
    const { paypal } = await import("../src/paypal/rest.js");
    const { db, initDb, closeDb } = await import("../src/db/client.js");
    const { resetDatabase } = await import("../src/db/seed.js");
    const { executeProposal } = await import("../src/executor/executor.js");
    const { proposals, orders } = await import("../src/db/schema.js");
    const { eq } = await import("drizzle-orm");

    process.env.PGLITE_DIR = `.data/test-executor-${Date.now()}`;
    await initDb();
    await resetDatabase();

    const [order] = await db().select().from(orders).where(eq(orders.id, "ord-small"));
    expect(order?.paypalCaptureId).toBeTruthy();

    const id = crypto.randomUUID();
    await db().insert(proposals).values({
      id,
      agent: "cs",
      type: "refund",
      targetRef: order!.id,
      toolName: "create_refund",
      toolArgsJson: {
        capture_id: order!.paypalCaptureId,
        amount: { currency_code: "USD", value: "8.00" },
        note_to_payer: "test",
      },
      editedArgsJson: null,
      reasoning: "test",
      summary: "Test refund $8",
      reason: "damaged",
      inputsJson: {},
      traceJson: [],
      confidenceModel: 0.9,
      confidenceLlm: 0.5,
      riskScore: 10,
      amount: 8,
      status: "approved",
      policyResultJson: { decision: "pending_approval", reasons: [] },
      conflictWithId: null,
      correlationId: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      decidedBy: "owner",
      decidedAt: new Date().toISOString(),
      simDay: 0,
    });

    // Force live path: seed capture is DRY-* which skips PayPal. Patch to a fake live id.
    await db().update(orders).set({ paypalCaptureId: "CAP-LIVE-TEST-001" }).where(eq(orders.id, order!.id));
    await db().update(proposals).set({
      toolArgsJson: {
        capture_id: "CAP-LIVE-TEST-001",
        amount: { currency_code: "USD", value: "8.00" },
        note_to_payer: "test",
      },
      status: "approved",
    }).where(eq(proposals.id, id));

    await executeProposal(id, "owner");

    expect(paypal.requestWithRetry).toHaveBeenCalled();
    const calls = (paypal.requestWithRetry as ReturnType<typeof vi.fn>).mock.calls;
    const refundCall = calls.find((call) => String(call[1]).includes("/refund"));
    expect(refundCall?.[3]).toBe(`${id}:execute`);

    await closeDb();
  });
});
