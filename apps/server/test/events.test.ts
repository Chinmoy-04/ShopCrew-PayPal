import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

describe("applyPayPalEvent idempotency", () => {
  it("retries when first delivery throws before processedAt", async () => {
    process.env.PGLITE_DIR = `.data/test-events-${Date.now()}`;
    const { initDb, db, closeDb } = await import("../src/db/client.js");
    const { resetDatabase } = await import("../src/db/seed.js");
    const { orders, webhookEvents } = await import("../src/db/schema.js");
    const { applyPayPalEvent } = await import("../src/paypal/events.js");
    const { nowIso } = await import("../src/db/audit.js");

    await initDb();
    await resetDatabase();

    const captureId = "CAP-CONFIRM-TEST";
    await db().insert(orders).values({
      id: "ord-live-confirm",
      customerId: "cust-jonah",
      source: "paypal",
      paypalOrderId: "ORD-CONFIRM",
      paypalCaptureId: captureId,
      status: "CAPTURED",
      total: 45,
      refundedTotal: 0,
      currency: "USD",
      simDay: 0,
      createdAt: nowIso(),
      confirmedAt: null,
    });

    const eventId = "WH-CONFIRM-1";
    await applyPayPalEvent({
      id: eventId,
      event_type: "PAYMENT.CAPTURE.COMPLETED",
      resource: { id: captureId },
    }, true);

    const [order] = await db().select().from(orders).where(eq(orders.id, "ord-live-confirm"));
    expect(order?.confirmedAt).toBeTruthy();

    const [hook] = await db().select().from(webhookEvents).where(eq(webhookEvents.paypalEventId, eventId));
    expect(hook?.processedAt).toBeTruthy();

    // Second delivery is a no-op once processed.
    await applyPayPalEvent({
      id: eventId,
      event_type: "PAYMENT.CAPTURE.COMPLETED",
      resource: { id: captureId },
    }, true);

    const hooks = await db().select().from(webhookEvents).where(eq(webhookEvents.paypalEventId, eventId));
    expect(hooks).toHaveLength(1);

    await closeDb();
  });

  it("leaves processedAt null when handler fails mid-flight, then completes on retry", async () => {
    process.env.PGLITE_DIR = `.data/test-events-retry-${Date.now()}`;
    const { initDb, db, closeDb } = await import("../src/db/client.js");
    const { resetDatabase } = await import("../src/db/seed.js");
    const { orders, webhookEvents, refunds, proposals } = await import("../src/db/schema.js");
    const { applyPayPalEvent } = await import("../src/paypal/events.js");
    const { nowIso } = await import("../src/db/audit.js");

    await initDb();
    await resetDatabase();

    const proposalId = crypto.randomUUID();
    await db().insert(proposals).values({
      id: proposalId,
      agent: "cs",
      type: "refund",
      targetRef: "ord-small",
      toolName: "create_refund",
      toolArgsJson: {},
      editedArgsJson: null,
      reasoning: "x",
      summary: "x",
      reason: null,
      inputsJson: {},
      traceJson: [],
      confidenceModel: 1,
      confidenceLlm: 1,
      riskScore: 1,
      amount: 8,
      status: "submitted",
      policyResultJson: {},
      conflictWithId: null,
      correlationId: crypto.randomUUID(),
      createdAt: nowIso(),
      decidedBy: "policy",
      decidedAt: nowIso(),
      simDay: 0,
    });
    await db().insert(refunds).values({
      id: crypto.randomUUID(),
      orderId: "ord-small",
      proposalId,
      paypalRefundId: "RFD-RETRY-1",
      amount: 8,
      status: "PENDING",
      createdAt: nowIso(),
      confirmedAt: null,
    });

    // Simulate a failed first delivery: row exists, processedAt null.
    await db().insert(webhookEvents).values({
      id: crypto.randomUUID(),
      paypalEventId: "WH-RETRY-1",
      eventType: "PAYMENT.CAPTURE.REFUNDED",
      resourceId: "RFD-RETRY-1",
      verified: true,
      payloadJson: {},
      receivedAt: nowIso(),
      processedAt: null,
    });

    await applyPayPalEvent({
      id: "WH-RETRY-1",
      event_type: "PAYMENT.CAPTURE.REFUNDED",
      resource: { id: "RFD-RETRY-1" },
    }, true);

    const [refund] = await db().select().from(refunds);
    const matched = refunds && (await db().select().from(refunds)).find((r) => r.paypalRefundId === "RFD-RETRY-1");
    expect(matched?.status).toBe("COMPLETED");
    const [hook] = await db().select().from(webhookEvents).where(eq(webhookEvents.paypalEventId, "WH-RETRY-1"));
    expect(hook?.processedAt).toBeTruthy();
    void orders;
    void refund;
    await closeDb();
  });
});
