import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import Fastify from "fastify";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db, initDb, closeDb } from "../src/db/client.js";
import { resetDatabase } from "../src/db/seed.js";
import * as seedModule from "../src/db/seed.js";
import { products, proposals, simState } from "../src/db/schema.js";
import { registerRoutes } from "../src/routes/register.js";
import { advanceDay, resetSimulation, setAutorun, simulationResetting } from "../src/sim/clock.js";
import { readCapturePool, writeCapturePool } from "../src/paypal/capturePool.js";

const app = Fastify();
beforeAll(async () => {
  vi.stubEnv("PGLITE_DIR", path.join(os.tmpdir(), `shopcrew-demo-reset-${crypto.randomUUID()}`));
  await initDb();
  await registerRoutes(app);
  await app.ready();
});
beforeEach(async () => {
  vi.stubEnv("PAYPAL_ENV", "sandbox");
  vi.stubEnv("DEMO_PUBLIC_RESET", "1");
  vi.stubEnv("ADMIN_TOKEN", "qa-owner-token");
  await resetDatabase();
});
afterAll(async () => {
  await setAutorun(false);
  vi.useRealTimers();
  vi.unstubAllEnvs();
  await app.close();
  await closeDb();
});

it("lets a judge reset to Day 0 without a token and restores storefront stock", async () => {
  await db().update(simState).set({ simDay: 6 });
  await db().update(products).set({ stock: 0 }).where(eq(products.sku, "NIGHT"));
  expect((await app.inject("/api/config")).json().demoPublicReset).toBe(true);
  const response = await app.inject({ method: "POST", url: "/api/sim/reset", payload: {},
    headers: { "x-forwarded-for": crypto.randomUUID() } });
  expect(response.statusCode).toBe(200);
  expect(response.json()).toMatchObject({ simDay: 0, autorun: false, pausedAll: false });
  expect((await db().select().from(products).where(eq(products.sku, "NIGHT")))[0].stock).toBe(28);
});

it("enforces the shared demo cooldown without resetting a second time", async () => {
  const options = { method: "POST" as const, url: "/api/sim/reset", payload: {},
    headers: { "x-forwarded-for": crypto.randomUUID() } };
  expect((await app.inject(options)).statusCode).toBe(200);
  await db().update(simState).set({ simDay: 3 });
  const response = await app.inject(options);
  expect(response.statusCode).toBe(429);
  expect(response.json().message).toContain("60 seconds");
  expect((await db().select().from(simState))[0].simDay).toBe(3);
});

it("stops the actual auto-run timer so the reset stays at Day 0", async () => {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
  try {
    await setAutorun(true);
    await resetSimulation();
    await vi.advanceTimersByTimeAsync(21_000);
    expect((await db().select().from(simState))[0]).toMatchObject({ simDay: 0, autorun: false });
    expect(vi.getTimerCount()).toBe(0);
  } finally { vi.useRealTimers(); }
});

it("retains owner authentication when public reset is disabled", async () => {
  vi.stubEnv("DEMO_PUBLIC_RESET", "0");
  expect((await app.inject({ method: "POST", url: "/api/sim/reset", payload: {} })).statusCode).toBe(401);
  expect((await app.inject({ method: "POST", url: "/api/sim/reset", payload: {},
    headers: { "x-admin-token": "qa-owner-token" } })).statusCode).toBe(200);
});

it("never permits a public reset with live PayPal credentials selected", async () => {
  vi.stubEnv("PAYPAL_ENV", "live");
  expect((await app.inject("/api/config")).json().demoPublicReset).toBe(false);
  expect((await app.inject({ method: "POST", url: "/api/sim/reset", payload: {} })).statusCode).toBe(401);
});

it("does not erase an executing payment", async () => {
  const [proposal] = await db().select().from(proposals);
  await db().update(proposals).set({ status: "executing" }).where(eq(proposals.id, proposal.id));
  const response = await app.inject({ method: "POST", url: "/api/sim/reset", payload: {},
    headers: { "x-forwarded-for": crypto.randomUUID() } });
  expect(response.statusCode).toBe(409);
  expect((await db().select().from(proposals).where(eq(proposals.id, proposal.id)))[0].status).toBe("executing");
  expect(simulationResetting()).toBe(false);
});

it("blocks day advancement and mutations while reset is running", async () => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const originalReset = resetDatabase;
  const resetSpy = vi.spyOn(seedModule, "resetDatabase").mockImplementationOnce(async () => {
    await gate;
    await originalReset();
  });
  const reset = resetSimulation();
  try {
    expect(simulationResetting()).toBe(true);
    await expect(advanceDay()).rejects.toThrow("already working");
    await expect(resetSimulation()).rejects.toThrow("finish before resetting");
    expect((await app.inject({ method: "POST", url: "/api/sim/autorun", payload: { enabled: true } })).statusCode).toBe(409);
  } finally {
    release();
    await reset;
    resetSpy.mockRestore();
  }
  expect(simulationResetting()).toBe(false);
});

it("preserves the external capture ledger and remaining refund amounts", async () => {
  const ledger = { orders: [{ id: "ord-small", paypalCaptureId: "QA-CAPTURE", total: 130, refunded: 24 }] };
  writeCapturePool(ledger);
  try {
    await resetSimulation();
    expect(readCapturePool()).toEqual(ledger);
  } finally { writeCapturePool({ orders: [] }); }
});
