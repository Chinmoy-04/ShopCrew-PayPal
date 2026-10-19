import { eq } from "drizzle-orm";
import { money } from "@shopcrew/shared";
import { bus } from "../bus/events.js";
import { db } from "../db/client.js";
import { competitorPrices, messages, orderItems, orders, products, salesDaily, simState } from "../db/schema.js";
import { runCustomerService, loadComplaints } from "../agents/cs/agent.js";
import { runInventory } from "../agents/inventory/agent.js";
import { runOrchestrator } from "../agents/orchestrator/agent.js";
import { runPricing } from "../agents/pricing/agent.js";
import { mulberry32, poisson } from "./rng.js";
import { planFor, type DayPlan } from "./scenario.js";

let running = false;
let timer: NodeJS.Timeout | null = null;

export function agentsRunning(): boolean {
  return running;
}

export async function advanceDay(): Promise<{ simDay: number; summary: string }> {
  if (running) throw new Error("The crew is already working through a day.");
  running = true;
  try {
    const database = db();
    const [sim] = await database.select().from(simState);
    if (!sim) throw new Error("Demo is not seeded.");
    if (sim.pausedAll) throw new Error("Agents are paused.");
    const day = sim.simDay + 1;
    await database.update(simState).set({ simDay: day }).where(eq(simState.id, 1));
    const plan = planFor(day);
    await recordSales(day, sim.seed + day);
    await applyShocks(day, plan);
    await insertMessages(day, plan);
    await runInventory(plan);
    await runPricing(plan);
    await runCustomerService();
    const summary = await runOrchestrator(day);
    const [next] = await database.select().from(simState);
    bus.emit({ type: "sim.updated", sim: next });
    return { simDay: day, summary };
  } finally {
    running = false;
  }
}

async function recordSales(day: number, seed: number) {
  const database = db();
  const catalog = await database.select().from(products);
  const rng = mulberry32(seed);
  const lines: { productId: string; qty: number; unitPrice: number }[] = [];
  for (const product of catalog) {
    const lambda = Math.max(0.2, product.baseDemand * (product.price / (product.price || 1)) ** product.trueElasticity);
    const units = Math.min(product.stock, poisson(rng, lambda));
    await database.insert(salesDaily).values({
      id: `sale-${product.sku}-${day}`,
      productId: product.id,
      simDay: day,
      units,
      revenue: money(units * product.price),
      price: product.price,
    });
    if (units > 0) {
      await database.update(products).set({ stock: product.stock - units }).where(eq(products.id, product.id));
      lines.push({ productId: product.id, qty: units, unitPrice: product.price });
    }
  }
  if (!lines.length) return;

  // Split the day's demand into several checkout events at different times of day.
  const buyers = ["cust-avery", "cust-jonah", "cust-priya", "cust-riley"] as const;
  const bucketCount = Math.min(lines.length, 3 + Math.floor(rng() * 5));
  const buckets: { productId: string; qty: number; unitPrice: number }[][] = Array.from({ length: bucketCount }, () => []);
  lines.forEach((line, index) => {
    buckets[index % bucketCount].push(line);
  });

  const usedMinutes = new Set<number>();
  for (let i = 0; i < buckets.length; i++) {
    const bucket = buckets[i];
    if (!bucket.length) continue;
    let minuteOfDay = Math.floor(rng() * 24 * 60);
    while (usedMinutes.has(minuteOfDay)) minuteOfDay = (minuteOfDay + 17) % (24 * 60);
    usedMinutes.add(minuteOfDay);
    const hour = Math.floor(minuteOfDay / 60);
    const minute = minuteOfDay % 60;
    const orderId = `syn-${day}-${i}`;
    const total = bucket.reduce((sum, line) => sum + line.unitPrice * line.qty, 0);
    await database.insert(orders).values({
      id: orderId,
      customerId: buyers[(day + i) % buyers.length],
      source: "synthetic",
      paypalOrderId: null,
      paypalCaptureId: null,
      status: "CAPTURED",
      total: money(total),
      refundedTotal: 0,
      currency: "USD",
      simDay: day,
      createdAt: simDayIsoAt(day, hour, minute),
    });
    await database.insert(orderItems).values(
      bucket.map((line, index) => ({ id: `${orderId}-${index}`, orderId, ...line })),
    );
  }
}

/** Demo epoch: Day 1 = 1 Jan 2026 UTC. */
function simDayIsoAt(day: number, hour: number, minute: number): string {
  const start = Date.UTC(2026, 0, Math.max(1, day), hour, minute, 0);
  return new Date(start).toISOString();
}

async function applyShocks(day: number, plan: DayPlan) {
  const database = db();
  const catalog = await database.select().from(products);
  for (const [sku, stock] of Object.entries(plan.stock ?? {})) {
    await database.update(products).set({ stock }).where(eq(products.sku, sku));
  }
  const fresh = await database.select().from(products);
  for (const product of fresh) {
    const factor = plan.competitorFactor?.sku === product.sku ? plan.competitorFactor.factor : 0.98;
    await database.insert(competitorPrices).values([
      { id: `comp-Northwind-${product.sku}-${day}`, productId: product.id, competitor: "Northwind", price: money(product.price * factor), simDay: day },
      { id: `comp-LittleWick-${product.sku}-${day}`, productId: product.id, competitor: "Little Wick", price: money(product.price * 1.03), simDay: day },
    ]);
  }
  void catalog;
}

async function insertMessages(day: number, plan: DayPlan) {
  const templates = loadComplaints();
  for (const id of plan.messages) {
    const template = templates.find((item) => item.id === id);
    if (!template) continue;
    const [order] = await db().select().from(orders).where(eq(orders.id, template.orderId));
    await db().insert(messages).values({
      id: `msg-${day}-${template.id}`,
      customerId: order?.customerId ?? "cust-avery",
      orderId: template.orderId,
      channel: "email",
      body: template.body,
      category: template.category,
      sentiment: template.sentiment,
      status: "open",
      simDay: day,
      templateId: template.id,
    });
  }
}

export async function setAutorun(enabled: boolean) {
  await db().update(simState).set({ autorun: enabled }).where(eq(simState.id, 1));
  if (timer) clearInterval(timer);
  timer = null;
  if (enabled) {
    timer = setInterval(() => {
      void advanceDay().catch((error) => console.warn("autorun day failed", error));
    }, 20_000);
  }
  const [sim] = await db().select().from(simState);
  bus.emit({ type: "sim.updated", sim });
}

/** Call after DB init so Auto-run survives server restarts. */
export async function resumeAutorunIfNeeded() {
  const [sim] = await db().select().from(simState);
  if (sim?.autorun && !sim.pausedAll) await setAutorun(true);
}

export async function setPaused(paused: boolean) {
  await db().update(simState).set(paused ? { pausedAll: true, autorun: false } : { pausedAll: false }).where(eq(simState.id, 1));
  if (paused && timer) {
    clearInterval(timer);
    timer = null;
  }
  const [sim] = await db().select().from(simState);
  bus.emit({ type: "sim.updated", sim });
}
