import fs from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import { money } from "@shopcrew/shared";
import { repoRoot, settings } from "../config.js";
import { nowIso } from "./audit.js";
import { db } from "./client.js";
import {
  competitorPrices,
  customers,
  orderItems,
  orders,
  policies,
  priceHistory,
  products,
  salesDaily,
  simState,
  suppliers,
} from "./schema.js";
import { mulberry32, poisson } from "../sim/rng.js";

interface ProductSeed {
  sku: string;
  name: string;
  cost: number;
  price: number;
  minPrice: number;
  maxPrice: number;
  stock: number;
  leadTimeDays: number;
  supplierId: string;
  trueElasticity: number;
  baseDemand: number;
  hue: string;
  blurb: string;
}

const DOW = [0.85, 0.92, 1, 1.05, 1.15, 1.35, 1.12];

async function chunks<T>(rows: T[], write: (part: T[]) => Promise<unknown>) {
  for (let i = 0; i < rows.length; i += 200) await write(rows.slice(i, i + 200));
}

export async function seed(): Promise<void> {
  const root = repoRoot();
  const catalog = JSON.parse(fs.readFileSync(path.join(root, "fixtures", "products.json"), "utf8")) as ProductSeed[];
  const pool = JSON.parse(fs.readFileSync(path.join(root, "fixtures", "capture-pool.json"), "utf8")) as {
    orders?: { id: string; paypalOrderId?: string; paypalCaptureId?: string }[];
  };
  const overrides = new Map((pool.orders ?? []).map((order) => [order.id, order]));
  const seedValue = settings.demoSeed();
  const rng = mulberry32(seedValue);
  const database = db();
  const createdAt = nowIso();

  await database.insert(suppliers).values([
    { id: "acme", name: "Acme Supplies", paypalEmail: settings.supplierEmail(), preferred: true, rating: 4.6 },
    { id: "unclaimed", name: "Northline Goods", paypalEmail: settings.unclaimedEmail(), preferred: false, rating: 3.4 },
  ]);

  const productRows = catalog.map((product) => ({ id: `prod-${product.sku.toLowerCase()}`, ...product }));
  await database.insert(products).values(productRows);
  await database.insert(priceHistory).values(
    productRows.map((product) => ({
      id: crypto.randomUUID(),
      productId: product.id,
      price: product.price,
      changedBy: "seed",
      proposalId: null,
      simDay: 0,
      createdAt,
    })),
  );

  const sales: (typeof salesDaily.$inferInsert)[] = [];
  const rivals: (typeof competitorPrices.$inferInsert)[] = [];
  for (let day = -180; day < 0; day++) {
    for (const product of productRows) {
      const wave = 1 + 0.06 * Math.sin(day / 17) + (rng() - 0.5) * 0.04;
      const price = money(product.price * wave);
      const trend = 1 + (day + 180) / 1800;
      const lambda = product.baseDemand * DOW[(day + 180) % 7] * trend * (price / product.price) ** product.trueElasticity;
      const units = poisson(rng, Math.max(0.15, lambda));
      sales.push({
        id: `sale-${product.sku}-${day}`,
        productId: product.id,
        simDay: day,
        units,
        revenue: money(units * price),
        price,
      });
      for (const competitor of ["Northwind", "Little Wick"]) {
        const factor = competitor === "Northwind" ? 0.97 : 1.04;
        rivals.push({
          id: `comp-${competitor}-${product.sku}-${day}`,
          productId: product.id,
          competitor,
          price: money(price * factor * (1 + (rng() - 0.5) * 0.03)),
          simDay: day,
        });
      }
    }
  }
  await chunks(sales, (part) => database.insert(salesDaily).values(part));
  await chunks(rivals, (part) => database.insert(competitorPrices).values(part));

  await database.insert(customers).values([
    { id: "cust-jonah", name: "Jonah Hale", email: "jonah@buyer.test", refunds30d: 0 },
    { id: "cust-priya", name: "Priya Shah", email: "priya@buyer.test", refunds30d: 0 },
    { id: "cust-avery", name: "Avery Cole", email: "avery@buyer.test", refunds30d: 0 },
    { id: "cust-riley", name: "Riley Moss", email: "riley@buyer.test", refunds30d: 4 },
  ]);

  const demoOrders: { id: string; customerId: string; total: number; sku: string }[] = [
    { id: "ord-small", customerId: "cust-jonah", total: 36, sku: "NIGHT" },
    { id: "ord-large", customerId: "cust-priya", total: 45, sku: "FIG" },
    { id: "ord-mid", customerId: "cust-avery", total: 28, sku: "CEDAR" },
    { id: "ord-late", customerId: "cust-jonah", total: 24, sku: "LINEN" },
    { id: "ord-wrong", customerId: "cust-avery", total: 32, sku: "HONEY" },
    { id: "ord-desc", customerId: "cust-priya", total: 26, sku: "FIG" },
    { id: "ord-abuse", customerId: "cust-riley", total: 28, sku: "CEDAR" },
    { id: "ord-b1", customerId: "cust-avery", total: 40, sku: "LINEN" },
    { id: "ord-b2", customerId: "cust-jonah", total: 40, sku: "CITRUS" },
    { id: "ord-b3", customerId: "cust-priya", total: 40, sku: "HONEY" },
    { id: "ord-b4", customerId: "cust-avery", total: 40, sku: "CEDAR" },
    { id: "ord-b5", customerId: "cust-jonah", total: 40, sku: "FIG" },
    { id: "ord-big", customerId: "cust-priya", total: 90, sku: "NIGHT" },
  ];
  await database.insert(orders).values(
    demoOrders.map((order) => {
      const override = overrides.get(order.id);
      const capture = override?.paypalCaptureId || `DRY-CAP-${order.id.replace("ord-", "").toUpperCase().padEnd(12, "0")}`.slice(0, 22);
      return {
        id: order.id,
        customerId: order.customerId,
        source: "paypal",
        paypalOrderId: override?.paypalOrderId || `DRY-ORD-${order.id.replace("ord-", "").toUpperCase().padEnd(10, "0")}`.slice(0, 20),
        paypalCaptureId: capture,
        status: "CAPTURED",
        total: order.total,
        refundedTotal: 0,
        currency: "USD",
        simDay: 0,
        createdAt,
      };
    }),
  );
  await database.insert(orderItems).values(
    demoOrders.map((order) => ({
      id: `item-${order.id}`,
      orderId: order.id,
      productId: `prod-${order.sku.toLowerCase()}`,
      qty: 1,
      unitPrice: order.total,
    })),
  );

  const stamp = nowIso();
  await database.insert(policies).values([
    { agent: "cs", enabled: true, autoApproveMax: 15, dailyBudget: 150, maxPctOfOrder: 0.5, maxPriceChangePct: 0, minMarginPct: 0, extraJson: { autoApprovePct: 0 }, updatedAt: stamp },
    { agent: "inventory", enabled: true, autoApproveMax: 200, dailyBudget: 1000, maxPctOfOrder: 1, maxPriceChangePct: 0, minMarginPct: 0, extraJson: { autoApprovePct: 0 }, updatedAt: stamp },
    { agent: "pricing", enabled: true, autoApproveMax: 0, dailyBudget: 0, maxPctOfOrder: 1, maxPriceChangePct: 20, minMarginPct: 25, extraJson: { autoApprovePct: 5 }, updatedAt: stamp },
    { agent: "supplier", enabled: true, autoApproveMax: 0, dailyBudget: 1000, maxPctOfOrder: 1, maxPriceChangePct: 0, minMarginPct: 0, extraJson: {}, updatedAt: stamp },
    { agent: "orchestrator", enabled: true, autoApproveMax: 0, dailyBudget: 0, maxPctOfOrder: 1, maxPriceChangePct: 20, minMarginPct: 25, extraJson: {}, updatedAt: stamp },
  ]);
  await database.insert(simState).values({
    id: 1,
    seed: seedValue,
    simDay: 0,
    scenario: "demo",
    autorun: false,
    pausedAll: false,
    lastSummary: "Day 0. The shop is seeded. Advance a day to let the crew work.",
  });
}

export async function resetDatabase(): Promise<void> {
  await db().execute(sql.raw(`TRUNCATE TABLE
    audit_log, webhook_events, llm_cache, actions, refunds, payouts, proposals,
    messages, order_items, orders, purchase_orders, forecasts, sales_daily,
    competitor_prices, price_history, products, customers, suppliers, policies, sim_state
    CASCADE`));
  await seed();
}
