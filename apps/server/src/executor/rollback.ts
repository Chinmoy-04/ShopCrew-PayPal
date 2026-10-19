import { eq } from "drizzle-orm";
import { money } from "@shopcrew/shared";
import { bus } from "../bus/events.js";
import { nowIso, writeAudit } from "../db/audit.js";
import { db } from "../db/client.js";
import { payouts, priceHistory, products, proposals, purchaseOrders } from "../db/schema.js";
import { proposalView } from "../db/views.js";
import { paypal } from "../paypal/rest.js";

export async function rollbackProposal(id: string): Promise<{ status: string; message: string }> {
  const database = db();
  const [row] = await database.select().from(proposals).where(eq(proposals.id, id));
  if (!row) throw new Error("Proposal not found");
  if (row.type === "refund") {
    await database.update(proposals).set({ status: "rollback_failed" }).where(eq(proposals.id, id));
    await writeAudit({
      actor: "owner",
      agent: row.agent,
      event: "rollback.failed",
      proposalId: id,
      correlationId: row.correlationId,
      message: "A captured refund cannot be reversed. Issue a new charge if the refund was wrong.",
    });
    bus.emit({ type: "proposal.upserted", proposal: await proposalView(id) });
    return { status: "rollback_failed", message: "Refunds cannot be reversed." };
  }
  if (row.type === "price_change") {
    const args = (row.toolArgsJson ?? {}) as { sku?: string };
    const [product] = await database.select().from(products).where(eq(products.sku, args.sku ?? row.targetRef));
    if (!product) throw new Error("Product missing");
    const history = await database.select().from(priceHistory).where(eq(priceHistory.productId, product.id));
    const previous = history.filter((item) => item.proposalId !== id).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0];
    const restored = previous?.price ?? product.price;
    await database.update(products).set({ price: money(restored) }).where(eq(products.id, product.id));
    await database.insert(priceHistory).values({
      id: crypto.randomUUID(),
      productId: product.id,
      price: restored,
      changedBy: "owner",
      proposalId: id,
      simDay: row.simDay,
      createdAt: nowIso(),
    });
    await database.update(proposals).set({ status: "rolled_back" }).where(eq(proposals.id, id));
    await writeAudit({ actor: "owner", agent: row.agent, event: "rollback.price", proposalId: id, correlationId: row.correlationId, message: `Restored ${product.sku} to $${restored.toFixed(2)}.` });
    bus.emit({ type: "proposal.upserted", proposal: await proposalView(id) });
    bus.emit({ type: "inventory.changed", sku: product.sku });
    return { status: "rolled_back", message: `Price restored to $${restored.toFixed(2)}.` };
  }
  if (row.type === "payout" || row.type === "purchase_order") {
    const [payout] = await database.select().from(payouts).where(eq(payouts.proposalId, id));
    if (!payout) throw new Error("No payout to roll back");
    if (payout.status !== "UNCLAIMED") {
      await database.update(proposals).set({ status: "rollback_failed" }).where(eq(proposals.id, id));
      await writeAudit({ actor: "owner", agent: row.agent, event: "rollback.failed", proposalId: id, correlationId: row.correlationId, message: `Payout is ${payout.status}. Only UNCLAIMED items can be cancelled.` });
      bus.emit({ type: "proposal.upserted", proposal: await proposalView(id) });
      return { status: "rollback_failed", message: "Only an unclaimed payout can be cancelled." };
    }
    if (paypal.configured() && payout.payoutItemId && !payout.payoutItemId.startsWith("DRY")) {
      await paypal.request("POST", `/v1/payments/payouts-item/${payout.payoutItemId}/cancel`, {});
    }
    await database.update(payouts).set({ status: "CANCELED", confirmedAt: nowIso() }).where(eq(payouts.id, payout.id));
    if (payout.purchaseOrderId) await database.update(purchaseOrders).set({ status: "cancelled" }).where(eq(purchaseOrders.id, payout.purchaseOrderId));
    await database.update(proposals).set({ status: "rolled_back" }).where(eq(proposals.id, id));
    await writeAudit({ actor: "owner", agent: row.agent, event: "rollback.payout", proposalId: id, correlationId: row.correlationId, message: "Cancelled the unclaimed payout." });
    const updated = (await database.select().from(payouts).where(eq(payouts.id, payout.id)))[0];
    bus.emit({ type: "payout.upserted", payout: updated });
    bus.emit({ type: "proposal.upserted", proposal: await proposalView(id) });
    return { status: "rolled_back", message: "Unclaimed payout cancelled." };
  }
  await database.update(proposals).set({ status: "rolled_back" }).where(eq(proposals.id, id));
  bus.emit({ type: "proposal.upserted", proposal: await proposalView(id) });
  return { status: "rolled_back", message: "Marked rolled back." };
}
