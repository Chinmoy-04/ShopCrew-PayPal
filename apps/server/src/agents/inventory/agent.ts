import { eq } from "drizzle-orm";
import { money } from "@shopcrew/shared";
import { db } from "../../db/client.js";
import { products, purchaseOrders, salesDaily, suppliers } from "../../db/schema.js";
import { holtWinters } from "../../ml/holtWinters.js";
import { reorderPlan } from "../../ml/reorder.js";
import type { DayPlan } from "../../sim/scenario.js";
import { propose } from "../gate.js";
import { narrate } from "../llm.js";

export function negotiate(quote: number) {
  const floor = money(quote * 0.94);
  let offer = money(quote * 0.9);
  const transcript: { from: string; type: string; unitCost: number; round: number }[] = [];
  for (let round = 0; round < 3; round++) {
    transcript.push({ from: "inventory", type: "offer", unitCost: offer, round });
    if (offer >= floor - 0.001) {
      transcript.push({ from: "supplier", type: "accept", unitCost: offer, round });
      return { unitCost: offer, transcript };
    }
    const counter = money(Math.max(floor, offer * 1.04));
    transcript.push({ from: "supplier", type: "counter", unitCost: counter, round });
    offer = money((offer + counter) / 2);
  }
  const unitCost = money(Math.max(floor, offer));
  transcript.push({ from: "supplier", type: "accept", unitCost, round: 3 });
  return { unitCost, transcript };
}

export async function runInventory(plan: DayPlan): Promise<string[]> {
  const catalog = await db().select().from(products);
  const sales = await db().select().from(salesDaily);
  const vendorRows = await db().select().from(suppliers);
  const notes: string[] = [];
  const queue: { sku: string; supplierId: string; qty: number; reason: string }[] = [];

  for (const product of catalog) {
    const series = sales.filter((row) => row.productId === product.id).sort((a, b) => a.simDay - b.simDay).map((row) => row.units);
    const hw = holtWinters(series, 14);
    const daily = hw.forecast[0] ?? product.baseDemand;
    const planQty = reorderPlan({ stock: product.stock, daily, sigma: hw.sigma, leadTimeDays: product.leadTimeDays });
    if (planQty.shouldOrder) {
      queue.push({ sku: product.sku, supplierId: product.supplierId, qty: planQty.qty, reason: `${planQty.daysOfCover.toFixed(1)} days of cover, reorder point ${planQty.reorderPoint.toFixed(1)}` });
    }
  }
  if (plan.unclaimedSku && !queue.some((item) => item.sku === plan.unclaimedSku)) {
    queue.push({ sku: plan.unclaimedSku, supplierId: "unclaimed", qty: 4, reason: "Small top-up from the backup supplier so an unclaimed payout can be demonstrated." });
  }

  for (const item of queue) {
    const product = catalog.find((row) => row.sku === item.sku);
    const supplier = vendorRows.find((row) => row.id === item.supplierId);
    if (!product || !supplier) continue;
    const deal = negotiate(product.cost);
    const total = money(deal.unitCost * item.qty);
    const poId = crypto.randomUUID();
    await db().insert(purchaseOrders).values({
      id: poId,
      supplierId: supplier.id,
      productId: product.id,
      qty: item.qty,
      unitCost: deal.unitCost,
      total,
      status: "proposed",
      negotiationJson: deal.transcript,
      proposalId: null,
    });
    const fallback = `Order ${item.qty} of ${product.sku} from ${supplier.name} at $${deal.unitCost.toFixed(2)}. ${item.reason}.`;
    const reasoning = await narrate("You are the ShopCrew inventory agent. Two sentences.", fallback, fallback);
    const result = await propose({
      agent: "inventory",
      type: "payout",
      targetRef: product.sku,
      toolName: "pay_supplier",
      toolArgs: { purchase_order_id: poId, supplier_id: supplier.id, amount: total.toFixed(2), receiver: supplier.paypalEmail, note: `Restock ${product.sku}` },
      reasoning,
      summary: `Pay ${supplier.name} $${total.toFixed(2)} for ${item.qty} × ${product.sku}`,
      reason: "restock",
      confidenceModel: 0.77,
      confidenceLlm: 0.64,
      amount: total,
      policyExtra: { supplierPreferred: supplier.preferred },
      inputs: { stock: product.stock, qty: item.qty, quote: product.cost, agreed: deal.unitCost },
      trace: deal.transcript,
    });
    await db().update(purchaseOrders).set({ proposalId: result.proposalId }).where(eq(purchaseOrders.id, poId));
    notes.push(result.status);
  }
  return notes;
}
