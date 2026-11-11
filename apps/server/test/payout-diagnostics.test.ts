import { afterAll, expect, it, vi } from "vitest";
import path from "node:path";
import os from "node:os";
import { PayPalError, paypalErrorDetails } from "../src/paypal/rest.js";

vi.mock("../src/paypal/rest.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/paypal/rest.js")>();
  return { ...actual, paypal: {
    configured: () => true,
    requestWithRetry: vi.fn(async () => { throw new actual.PayPalError(422, {
      name: "INSUFFICIENT_FUNDS", message: "Sender funds unavailable", debug_id: "qa-debug-123",
      details: [{ issue: "INSUFFICIENT_FUNDS", field: "items[0].amount", authorization: "must-not-store" }],
      access_token: "must-not-store",
    }); }),
  } };
});
afterAll(() => vi.unstubAllEnvs());
it("stores provider diagnostics on a failed payout and in its audit entry", async () => {
  vi.stubEnv("PGLITE_DIR", path.join(os.tmpdir(), `shopcrew-diagnostics-${crypto.randomUUID()}`));
  const { initDb, db, closeDb } = await import("../src/db/client.js");
  const { resetDatabase } = await import("../src/db/seed.js");
  const { proposals, actions, auditLog } = await import("../src/db/schema.js");
  const { executeProposal } = await import("../src/executor/executor.js");
  const { eq } = await import("drizzle-orm");
  await initDb();
  try {
    await resetDatabase();
    const id = crypto.randomUUID();
    await db().insert(proposals).values({ id, agent: "inventory", type: "payout", targetRef: "qa",
      toolName: "pay_supplier", toolArgsJson: { amount: "1.00", receiver: "qa@example.invalid" },
      reasoning: "Diagnostic test", summary: "Diagnostic payout", status: "approved",
      correlationId: id, createdAt: new Date().toISOString(), simDay: 1, amount: 1 });
    await executeProposal(id, "owner");
    const [action] = await db().select().from(actions).where(eq(actions.proposalId, id));
    const [proposal] = await db().select().from(proposals).where(eq(proposals.id, id));
    const [audit] = await db().select().from(auditLog).where(eq(auditLog.proposalId, id));
    expect(proposal.status).toBe("failed");
    expect(action.responseJson).toMatchObject({ provider: "paypal", status: 422, name: "INSUFFICIENT_FUNDS", debugId: "qa-debug-123" });
    expect(audit.afterJson).toEqual(action.responseJson);
    expect(JSON.stringify(action.responseJson)).not.toContain("must-not-store");
  } finally { await closeDb(); }
});
it("does not treat generic exceptions as provider errors", () => {
  expect(paypalErrorDetails(new Error("network"))).toBeNull();
  expect(paypalErrorDetails(new PayPalError(500, null))).toMatchObject({ status: 500, details: [] });
});
