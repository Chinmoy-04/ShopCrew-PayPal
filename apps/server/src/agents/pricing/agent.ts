import { money } from "@shopcrew/shared";
import { db } from "../../db/client.js";
import { competitorPrices, products, salesDaily } from "../../db/schema.js";
import { expectedUnits, olsElasticity } from "../../ml/elasticity.js";
import { holtWinters } from "../../ml/holtWinters.js";
import type { DayPlan } from "../../sim/scenario.js";
import { propose } from "../gate.js";
import { narrate } from "../llm.js";

export async function runPricing(plan: DayPlan): Promise<void> {
  const catalog = await db().select().from(products);
  const sales = await db().select().from(salesDaily);
  const rivals = await db().select().from(competitorPrices);
  const proposals: { sku: string; next: number; reason: string }[] = [];

  if (plan.priceNudge) {
    const fig = catalog.find((product) => product.sku === "FIG");
    const night = catalog.find((product) => product.sku === "NIGHT");
    if (fig) proposals.push({ sku: "FIG", next: money(fig.price * 1.04), reason: "Demand is steady and a 4% increase stays inside the auto-approve band." });
    if (night) proposals.push({ sku: "NIGHT", next: money(night.price * 0.85), reason: "A competitor cut price by about 15%. Matching them would be a discount." });
  } else {
    for (const product of catalog) {
      const latestDay = Math.max(...rivals.filter((row) => row.productId === product.id).map((row) => row.simDay), -999);
      const minRival = Math.min(...rivals.filter((row) => row.productId === product.id && row.simDay === latestDay).map((row) => row.price));
      if (!Number.isFinite(minRival) || minRival > product.price * 0.92) continue;
      const series = sales.filter((row) => row.productId === product.id).sort((a, b) => a.simDay - b.simDay);
      const hw = holtWinters(series.map((row) => row.units));
      const daily = hw.forecast[0] || product.baseDemand;
      const cover = daily > 0 ? product.stock / daily : 999;
      if (cover < product.leadTimeDays + 2) continue;
      const next = money(Math.max(product.minPrice, minRival * 1.02));
      if (Math.abs(next - product.price) / product.price < 0.02) continue;
      proposals.push({ sku: product.sku, next, reason: `Competitor is at $${minRival.toFixed(2)} and cover is healthy.` });
      break;
    }
  }

  for (const change of proposals) {
    const product = catalog.find((row) => row.sku === change.sku);
    if (!product) continue;
    const points = sales.filter((row) => row.productId === product.id).map((row) => ({ price: row.price, units: row.units }));
    const fit = olsElasticity(points);
    const pct = ((change.next - product.price) / product.price) * 100;
    const margin = ((change.next - product.cost) / change.next) * 100;
    const unitsNow = expectedUnits(fit.intercept, fit.elasticity, product.price);
    const unitsNext = expectedUnits(fit.intercept, fit.elasticity, change.next);
    const fallback = `${change.reason} New price $${change.next.toFixed(2)} (${pct.toFixed(1)}%). Elasticity ${fit.elasticity.toFixed(2)}, R² ${fit.r2.toFixed(2)}.`;
    const reasoning = await narrate("You are the ShopCrew pricing agent. Two sentences, no hype.", fallback, fallback);
    await propose({
      agent: "pricing",
      type: "price_change",
      targetRef: product.sku,
      toolName: "set_price",
      toolArgs: { sku: product.sku, new_price: change.next, expected_units_delta: money(unitsNext - unitsNow), rationale: change.reason },
      reasoning,
      summary: `${product.sku} $${product.price.toFixed(2)} → $${change.next.toFixed(2)} (${pct.toFixed(1)}%)`,
      reason: pct < 0 ? "discount" : "increase",
      confidenceModel: Math.max(0.3, Math.min(0.95, fit.r2)),
      confidenceLlm: 0.58,
      amount: change.next,
      policyExtra: { priceChangePct: pct, marginPct: margin },
      inputs: { elasticity: fit.elasticity, r2: fit.r2, margin, from: product.price, to: change.next },
    });
  }
}
