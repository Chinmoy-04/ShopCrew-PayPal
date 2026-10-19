import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { payouts, proposals, refunds } from "../db/schema.js";
import { paypal } from "../paypal/rest.js";
import { applyPayPalEvent } from "../paypal/events.js";

export function startReconciler() {
  const timer = setInterval(() => {
    void reconcile().catch(() => undefined);
  }, 30_000);
  timer.unref?.();
}

async function reconcile() {
  if (!paypal.configured()) return;
  const rows = await db().select().from(proposals);
  const cutoff = Date.now() - 90_000;
  for (const row of rows) {
    if (row.status !== "submitted") continue;
    if (new Date(row.decidedAt ?? row.createdAt).getTime() > cutoff) continue;
    if (row.type === "refund") {
      const [refund] = await db().select().from(refunds).where(eq(refunds.proposalId, row.id));
      if (!refund?.paypalRefundId || refund.paypalRefundId.startsWith("DRY")) continue;
      const remote = (await paypal.request("GET", `/v2/payments/refunds/${refund.paypalRefundId}`)) as { id?: string; status?: string };
      if (remote.status === "COMPLETED") {
        await applyPayPalEvent({ id: `reconcile-${remote.id}`, event_type: "PAYMENT.CAPTURE.REFUNDED", resource: { id: remote.id } }, true);
      }
    }
    if (row.type === "payout") {
      const [payout] = await db().select().from(payouts).where(eq(payouts.proposalId, row.id));
      if (!payout?.payoutBatchId || payout.payoutBatchId.startsWith("DRY")) continue;
      const remote = (await paypal.request("GET", `/v1/payments/payouts/${payout.payoutBatchId}`)) as {
        items?: { payout_item_id?: string; transaction_status?: string }[];
      };
      const item = remote.items?.[0];
      if (!item?.transaction_status || item.transaction_status === "PENDING") continue;
      const type =
        item.transaction_status === "UNCLAIMED"
          ? "PAYMENT.PAYOUTS-ITEM.UNCLAIMED"
          : item.transaction_status === "SUCCESS"
            ? "PAYMENT.PAYOUTS-ITEM.SUCCEEDED"
            : "PAYMENT.PAYOUTS-ITEM.FAILED";
      await applyPayPalEvent(
        { id: `reconcile-${item.payout_item_id}`, event_type: type, resource: { payout_item_id: item.payout_item_id, payout_batch_id: payout.payoutBatchId } },
        true,
      );
    }
  }
}
