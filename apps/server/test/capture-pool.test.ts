import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { markPoolRefund, readCapturePool, writeCapturePool } from "../src/paypal/capturePool.js";

afterEach(() => vi.unstubAllEnvs());
describe("persistent capture pool", () => {
  it("retains updated refund usage instead of rereading a stale bootstrap value", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "shopcrew-pool-"));
    vi.stubEnv("CAPTURE_POOL_PATH", path.join(dir, "nested", "pool.json"));
    vi.stubEnv("CAPTURE_POOL_JSON", JSON.stringify({ orders: [{ id: "ord-large", paypalCaptureId: "CAPTURE", total: 100, refunded: 0 }] }));
    expect(readCapturePool().orders[0].total).toBe(100);
    markPoolRefund("CAPTURE", 20);
    markPoolRefund("CAPTURE", 8);
    expect(readCapturePool().orders[0].refunded).toBe(28);
    expect(fs.existsSync(`${process.env.CAPTURE_POOL_PATH}.tmp`)).toBe(false);
  });
  it("fails closed when an existing ledger is corrupt", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "shopcrew-pool-"));
    const file = path.join(dir, "pool.json");
    vi.stubEnv("CAPTURE_POOL_PATH", file);
    writeCapturePool({ orders: [] });
    fs.writeFileSync(file, "bad json");
    expect(() => readCapturePool()).toThrow();
  });
});
