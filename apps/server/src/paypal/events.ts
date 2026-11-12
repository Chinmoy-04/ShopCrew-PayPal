import { and, eq, ne, sql } from "drizzle-orm";
import { bus } from "../bus/events.js";
import { nowIso, writeAudit } from "../db/audit.js";
import { db } from "../db/client.js";
import { orders, payouts, products, proposals, purchaseOrders, refunds, webhookEvents } from "../db/schema.js";
import { listOrderViews, proposalView } from "../db/views.js";

export async function applyPayPalEvent(event: {
  id: string;
  event_type: string;
  resource?: Record<string, unknown>;
  dryRun?: boolean;
}, verified: boolean): Promise<void> {
  const database = db();
  const existing = await database.select().from(webhookEvents).where(eq(webhookEvents.paypalEventId, event.id));
  if (existing.length) {
    // Already fully processed — skip redelivery.
    if (existing[0].processedAt) return;
    // Row exists but handler previously failed before processedAt was set — continue.
  } else {
    await database.insert(webhookEvents).values({
      id: crypto.randomUUID(),
      paypalEventId: event.id,
      eventType: event.event_type,
      resourceId: String(event.resource?.id ?? event.resource?.payout_item_id ?? event.resource?.payout_batch_id ?? ""),
      verified,
      payloadJson: event,
      receivedAt: nowIso(),
      processedAt: null,
    });
  }

  if (!verified && !event.dryRun) {
    await writeAudit({ actor: "paypal", event: "webhook.ignored", message: `Ignored unverified ${event.event_type}.` });
    await database.update(webhookEvents).set({ processedAt: nowIso() }).where(eq(webhookEvents.paypalEventId, event.id));
    return;
  }

  const resource = event.resource ?? {};
  let affectedOrderId: string | null = null;

  if (event.event_type === "PAYMENT.CAPTURE.COMPLETED" || event.event_type === "CHECKOUT.ORDER.APPROVED") {
    const captureId = String(resource.id ?? "");
    const orderIdFromResource = String(
      (resource.supplementary_data as { related_ids?: { order_id?: string } } | undefined)?.related_ids?.order_id
      ?? (resource as { custom_id?: string }).custom_id
      ?? "",
    );
    let [order] = captureId
      ? await database.select().from(orders).where(eq(orders.paypalCaptureId, captureId))
      : [];
    if (!order && orderIdFromResource) {
      [order] = await database.select().from(orders).where(eq(orders.paypalOrderId, orderIdFromResource));
    }
    if (order && !order.confirmedAt) {
      await database.update(orders).set({
        status: order.status === "CREATED" ? "CAPTURED" : order.status,
        confirmedAt: nowIso(),
        paypalCaptureId: order.paypalCaptureId || captureId || order.paypalCaptureId,
      }).where(eq(orders.id, order.id));
      affectedOrderId = order.id;
      await writeAudit({
        actor: event.dryRun ? "system" : "paypal",
        event: "order.confirmed",
        message: event.dryRun
          ? `Dry-run webhook confirmed order ${order.id}.`
          : `PayPal webhook confirmed order ${order.id}.`,
      });
    }
  }

  if (event.event_type === "PAYMENT.CAPTURE.REFUNDED") {
    const refundId = String(resource.id ?? "");
    const [refund] = await database.select().from(refunds).where(eq(refunds.paypalRefundId, refundId));
    if (refund) {
      await database.update(refunds).set({ status: "COMPLETED", confirmedAt: nowIso() }).where(eq(refunds.id, refund.id));
      await database.update(proposals).set({ status: "confirmed" }).where(eq(proposals.id, refund.proposalId));
      const proposal = await proposalView(refund.proposalId);
      if (proposal) bus.emit({ type: "proposal.upserted", proposal });
      affectedOrderId = refund.orderId;
      await writeAudit({
        actor: event.dryRun ? "system" : "paypal",
        event: "refund.confirmed",
        proposalId: refund.proposalId,
        correlationId: proposal?.correlationId,
        message: event.dryRun ? `Dry-run confirmation for refund ${refundId}.` : `PayPal confirmed refund ${refundId}.`,
      });
    }
  }

  if (event.event_type.startsWith("PAYMENT.PAYOUTS-ITEM") || event.event_type.startsWith("PAYMENT.PAYOUTSBATCH")) {
    // A batch or an item still processing does not prove that a supplier was paid.
    const itemStatuses: Record<string, string> = {
      "PAYMENT.PAYOUTS-ITEM.SUCCEEDED": "SUCCESS",
      "PAYMENT.PAYOUTS-ITEM.UNCLAIMED": "UNCLAIMED",
      "PAYMENT.PAYOUTS-ITEM.CANCELED": "CANCELED",
      "PAYMENT.PAYOUTS-ITEM.CANCELLED": "CANCELED",
      "PAYMENT.PAYOUTS-ITEM.FAILED": "FAILED",
      "PAYMENT.PAYOUTS-ITEM.DENIED": "FAILED",
      "PAYMENT.PAYOUTS-ITEM.RETURNED": "FAILED",
    };
    const status = itemStatuses[event.event_type];
    if (!status) {
      await database.update(webhookEvents).set({ processedAt: nowIso() }).where(eq(webhookEvents.paypalEventId, event.id));
      return;
    }
    const itemId = String(resource.payout_item_id ?? resource.id ?? "");
    const batchId = String(resource.payout_batch_id ?? "");
    const rows = await database.select().from(payouts);
    const payout = rows.find((item) => Boolean(itemId && item.payoutItemId === itemId))
      ?? rows.find((item) => Boolean(batchId && item.payoutBatchId === batchId && !item.payoutItemId));
    if (payout) {
      // Late delivery must not resurrect a cancelled payout or regress a settled item.
      if ((payout.status === "CANCELED" && status !== "CANCELED") || (["SUCCESS", "FAILED"].includes(payout.status) && status === "UNCLAIMED")) {
        await database.update(webhookEvents).set({ processedAt: nowIso() }).where(eq(webhookEvents.paypalEventId, event.id));
        return;
      }
      const proposalStatus = status === "FAILED" ? "failed" : status === "CANCELED" ? "rolled_back" : "confirmed";
      const restocked = await database.transaction(async (tx) => {
        await tx.update(payouts).set({ status, confirmedAt: nowIso(), ...(itemId ? { payoutItemId: itemId } : {}) }).where(eq(payouts.id, payout.id));
        await tx.update(proposals).set({ status: proposalStatus }).where(eq(proposals.id, payout.proposalId));
        if (!payout.purchaseOrderId) return null;
        // Claim the purchase order and add its units in one transaction. Retain
        // the paid marker on later payment events so redelivery cannot add twice.
        const [po] = await tx.update(purchaseOrders)
          .set({ status: status === "SUCCESS" ? "paid" : status.toLowerCase() })
          .where(and(eq(purchaseOrders.id, payout.purchaseOrderId), ne(purchaseOrders.status, "paid")))
          .returning();
        if (!po || status !== "SUCCESS") return null;
        if (!Number.isInteger(po.qty) || po.qty <= 0) throw new Error("Invalid restock quantity");
        const [product] = await tx.update(products).set({ stock: sql`${products.stock} + ${po.qty}` })
          .where(eq(products.id, po.productId)).returning();
        if (!product) throw new Error("Restock product not found");
        return { sku: product.sku, qty: po.qty };
      });
      if (restocked) bus.emit({ type: "inventory.changed", sku: restocked.sku });
      const updated = (await database.select().from(payouts).where(eq(payouts.id, payout.id)))[0];
      bus.emit({ type: "payout.upserted", payout: updated });
      const proposal = await proposalView(payout.proposalId);
      if (proposal) bus.emit({ type: "proposal.upserted", proposal });
      await writeAudit({
        actor: event.dryRun ? "system" : "paypal",
        event: "payout.updated",
        proposalId: payout.proposalId,
        correlationId: proposal?.correlationId,
        message: `Payout is ${status}.${restocked ? ` Restocked ${restocked.qty} units of ${restocked.sku}.` : ""}`,
      });
    }
  }

  await database.update(webhookEvents).set({ processedAt: nowIso() }).where(eq(webhookEvents.paypalEventId, event.id));

  if (affectedOrderId) {
    const orderViews = await listOrderViews();
    const order = orderViews.find((row) => row.id === affectedOrderId);
    if (order) bus.emit({ type: "order.upserted", order });
  }
}
