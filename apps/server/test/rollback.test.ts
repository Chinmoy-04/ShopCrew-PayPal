import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

describe("rollbackProposal", () => {
  it("does not overwrite a confirmed refund status", async () => {
    process.env.PGLITE_DIR = `.data/test-rollback-${Date.now()}`;
    const { initDb, db, closeDb } = await import("../src/db/client.js");
    const { resetDatabase } = await import("../src/db/seed.js");
    const { proposals } = await import("../src/db/schema.js");
    const { rollbackProposal } = await import("../src/executor/rollback.js");
    const { nowIso } = await import("../src/db/audit.js");

    await initDb();
    await resetDatabase();

    const id = crypto.randomUUID();
    await db().insert(proposals).values({
      id,
      agent: "cs",
      type: "refund",
      targetRef: "ord-small",
      toolName: "create_refund",
      toolArgsJson: {},
      editedArgsJson: null,
      reasoning: "refund",
      summary: "Refund $8",
      reason: "damaged",
      inputsJson: {},
      traceJson: [],
      confidenceModel: 0.9,
      confidenceLlm: 0.5,
      riskScore: 10,
      amount: 8,
      status: "confirmed",
      policyResultJson: {},
      conflictWithId: null,
      correlationId: crypto.randomUUID(),
      createdAt: nowIso(),
      decidedBy: "policy",
      decidedAt: nowIso(),
      simDay: 0,
    });

    const result = await rollbackProposal(id);
    expect(result.status).toBe("rollback_failed");
    expect(result.message).toMatch(/cannot be reversed/i);

    const [row] = await db().select().from(proposals).where(eq(proposals.id, id));
    expect(row?.status).toBe("confirmed");

    await closeDb();
  });
});
