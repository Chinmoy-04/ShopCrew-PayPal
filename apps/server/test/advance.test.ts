import { describe, expect, it } from "vitest";
import os from "node:os";
import path from "node:path";

describe("demo day", () => {
  it("advances one seeded day into proposals", async () => {
    process.env.PGLITE_DIR = path.join(os.tmpdir(), `shopcrew-test-${Date.now()}`);
    process.env.LLM_PROVIDER = "replay";
    const { loadEnv } = await import("../src/config.js");
    loadEnv();
    const { initDb } = await import("../src/db/client.js");
    const { resetDatabase } = await import("../src/db/seed.js");
    const { advanceDay } = await import("../src/sim/clock.js");
    const { listProposalViews } = await import("../src/db/views.js");
    await initDb();
    await resetDatabase();
    const day = await advanceDay();
    expect(day.simDay).toBe(1);
    const rows = await listProposalViews();
    expect(rows.some((row) => row.type === "refund" && row.amount === 8)).toBe(true);
    expect(rows.some((row) => row.type === "refund" && row.status === "pending_approval")).toBe(true);
    expect(rows.some((row) => row.type === "price_change" && row.status === "blocked")).toBe(true);
    expect(rows.some((row) => row.type === "payout")).toBe(true);
  });
});
