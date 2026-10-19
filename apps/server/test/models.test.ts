import { describe, expect, it } from "vitest";
import { canTransition } from "@shopcrew/shared";
import { holtWinters } from "../src/ml/holtWinters.js";
import { olsElasticity } from "../src/ml/elasticity.js";
import { reorderPlan } from "../src/ml/reorder.js";

describe("status machine", () => {
  it("allows the refund path and rejects a skip", () => {
    expect(canTransition("pending_approval", "approved")).toBe(true);
    expect(canTransition("approved", "executing")).toBe(true);
    expect(canTransition("executing", "submitted")).toBe(true);
    expect(canTransition("submitted", "confirmed")).toBe(true);
    expect(canTransition("proposed", "confirmed")).toBe(false);
  });
});

describe("holt-winters", () => {
  it("returns a finite forecast", () => {
    const series = Array.from({ length: 56 }, (_, i) => 3 + (i % 7 === 5 ? 2 : 0) + (i % 3) * 0.2);
    const result = holtWinters(series, 7);
    expect(result.forecast).toHaveLength(7);
    expect(result.forecast.every((value) => Number.isFinite(value) && value >= 0)).toBe(true);
    expect(result.mape).toBeGreaterThanOrEqual(0);
  });
});

describe("elasticity", () => {
  it("recovers a negative slope", () => {
    const points = Array.from({ length: 30 }, (_, i) => {
      const price = 20 + i;
      const units = Math.exp(4 + -1.2 * Math.log(price));
      return { price, units };
    });
    const fit = olsElasticity(points);
    expect(fit.elasticity).toBeGreaterThan(-1.4);
    expect(fit.elasticity).toBeLessThan(-1.0);
    expect(fit.r2).toBeGreaterThan(0.99);
  });
});

describe("reorder", () => {
  it("orders when stock is inside the reorder point", () => {
    const plan = reorderPlan({ stock: 3, daily: 2, sigma: 0.4, leadTimeDays: 7 });
    expect(plan.shouldOrder).toBe(true);
    expect(plan.daysOfCover).toBeLessThan(7);
  });
});
