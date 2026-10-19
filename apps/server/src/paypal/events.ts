import { eq } from "drizzle-orm";
import { bus } from "../bus/events.js";
import { nowIso, writeAudit } from "../db/audit.js";
import { db } from "../db/client.js";
import { orders, payouts, proposals, purchaseOrders, refunds, webhookEvents } from "../db/schema.js";
import { listOrderViews, proposalView } from "../db/views.js";

export async function applyPayPalEvent(event: {
  id: string;
  event_type: string;
  resource?: Record<string, unknown>;
  dryRun?: boolean;
}, verified: boolean): Promise<void> {
  const database = db();
  const existing = await database.select().from(webhookEvents).where(eq(webhookEvents.paypalEventId, event.id));
  if (existing.length) return;
  const resource = event.resource ?? {};
  const resourceId = String(resource.id ?? resource.payout_item_id ?? resource.payout_batch_id ?? "");
  await database.insert(webhookEvents).values({
    id: crypto.randomUUID(),
    paypalEventId: event.id,
    eventType: event.event_type,
    resourceId,
    verified,
    payloadJson: event,
    receivedAt: nowIso(),
    processedAt: nowIso(),
  });
  if (!verified && !event.dryRun) {
    await writeAudit({ actor: "paypal", event: "webhook.ignored", message: `Ignored unverified ${event.event_type}.` });
    return;
  }

  if (event.event_type === "PAYMENT.CAPTURE.COMPLETED" || event.event_type === "CHECKOUT.ORDER.APPROVED") {
    const captureId = String(resource.id ?? "");
    const [order] = await database.select().from(orders).where(eq(orders.paypalCaptureId, captureId));
    if (order && order.status === "CREATED") {
      await database.update(orders).set({ status: "CAPTURED" }).where(eq(orders.id, order.id));
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
    const itemId = String(resource.payout_item_id ?? resource.id ?? "");
    const batchId = String(resource.payout_batch_id ?? "");
    const rows = await database.select().from(payouts);
    const payout = rows.find((item) => item.payoutItemId === itemId || item.payoutBatchId === batchId || item.payoutItemId === resourceId);
    if (payout) {
      const status = event.event_type.endsWith("UNCLAIMED")
        ? "UNCLAIMED"
        : event.event_type.endsWith("CANCELED") || event.event_type.endsWith("CANCELLED")
          ? "CANCELED"
          : event.event_type.endsWith("FAILED") || event.event_type.endsWith("DENIED") || event.event_type.endsWith("RETURNED")
            ? "FAILED"
            : "SUCCESS";
      await database.update(payouts).set({ status, confirmedAt: nowIso() }).where(eq(payouts.id, payout.id));
      const proposalStatus = status === "FAILED" ? "failed" : status === "CANCELED" ? "rolled_back" : "confirmed";
      await database.update(proposals).set({ status: proposalStatus }).where(eq(proposals.id, payout.proposalId));
      if (payout.purchaseOrderId) {
        await database.update(purchaseOrders).set({ status: status === "SUCCESS" ? "paid" : status.toLowerCase() }).where(eq(purchaseOrders.id, payout.purchaseOrderId));
      }
      const updated = (await database.select().from(payouts).where(eq(payouts.id, payout.id)))[0];
      bus.emit({ type: "payout.upserted", payout: updated });
      const proposal = await proposalView(payout.proposalId);
      if (proposal) bus.emit({ type: "proposal.upserted", proposal });
      await writeAudit({
        actor: event.dryRun ? "system" : "paypal",
        event: "payout.updated",
        proposalId: payout.proposalId,
        correlationId: proposal?.correlationId,
        message: `Payout is ${status}.`,
      });
    }
  }

  const orderViews = await listOrderViews();
  for (const order of orderViews.slice(0, 1)) bus.emit({ type: "order.upserted", order });
}
