import { and, eq, inArray } from "drizzle-orm";
import { money } from "@shopcrew/shared";
import { bus } from "../bus/events.js";
import { nowIso, writeAudit } from "../db/audit.js";
import { db } from "../db/client.js";
import { actions, orders, payouts, priceHistory, products, proposals, purchaseOrders, refunds, simState } from "../db/schema.js";
import { proposalView } from "../db/views.js";
import { PayPalError, paypal } from "../paypal/rest.js";
import { callToolkit } from "../paypal/toolkit.js";
import { applyPayPalEvent } from "../paypal/events.js";

async function emitProposal(id: string) {
  const proposal = await proposalView(id);
  if (proposal) bus.emit({ type: "proposal.upserted", proposal });
}

export async function executeProposal(id: string, decidedBy: string): Promise<void> {
  const database = db();
  const claimed = await database
    .update(proposals)
    .set({ status: "executing", decidedBy, decidedAt: nowIso() })
    .where(and(eq(proposals.id, id), inArray(proposals.status, ["auto_approved", "approved"])))
    .returning();
  const row = claimed[0];
  if (!row) return;
  const args = (row.editedArgsJson ?? row.toolArgsJson) as Record<string, unknown>;
  const idempotencyKey = `${id}:execute`;
  await database.insert(actions).values({
    id: crypto.randomUUID(),
    proposalId: id,
    kind: "execute",
    idempotencyKey,
    requestJson: args,
    responseJson: null,
    paypalRef: null,
    status: "executing",
    error: null,
    attempts: 1,
    startedAt: nowIso(),
    finishedAt: null,
  });
  try {
    const outcome = await dispatch(row, args, idempotencyKey);
    await database.update(proposals).set({ status: outcome.status }).where(eq(proposals.id, id));
    await database
      .update(actions)
      .set({ status: outcome.status, responseJson: outcome.response ?? null, paypalRef: outcome.paypalRef ?? null, finishedAt: nowIso() })
      .where(eq(actions.idempotencyKey, idempotencyKey));
    await writeAudit({
      actor: "system",
      agent: row.agent,
      event: "proposal.executed",
      proposalId: id,
      correlationId: row.correlationId,
      after: outcome,
      message: outcome.message,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Execution failed";
    await database.update(proposals).set({ status: "failed" }).where(eq(proposals.id, id));
    await database.update(actions).set({ status: "failed", error: message, finishedAt: nowIso() }).where(eq(actions.idempotencyKey, idempotencyKey));
    await writeAudit({
      actor: "system",
      agent: row.agent,
      event: "proposal.failed",
      proposalId: id,
      correlationId: row.correlationId,
      message,
    });
  }
  await emitProposal(id);
}

async function dispatch(
  row: typeof proposals.$inferSelect,
  args: Record<string, unknown>,
  idempotencyKey: string,
): Promise<{ status: "submitted" | "confirmed"; paypalRef?: string; response?: unknown; message: string }> {
  if (row.toolName === "set_price") return setPrice(row, args);
  if (row.toolName === "send_reply" || row.toolName === "escalate_to_owner") {
    return { status: "confirmed", message: row.toolName === "send_reply" ? "Reply recorded." : "Escalated to the owner." };
  }
  if (row.toolName === "create_refund") return refundCapture(row, args, idempotencyKey);
  if (row.toolName === "pay_supplier") return paySupplier(row, args, idempotencyKey);
  throw new Error(`Unknown tool ${row.toolName}`);
}

async function setPrice(row: typeof proposals.$inferSelect, args: Record<string, unknown>) {
  const database = db();
  const sku = String(args.sku ?? row.targetRef);
  const [product] = await database.select().from(products).where(eq(products.sku, sku));
  if (!product) throw new Error(`Unknown SKU ${sku}`);
  const next = money(Number(args.new_price ?? row.amount));
  const [sim] = await database.select().from(simState);
  await database.update(products).set({ price: next }).where(eq(products.id, product.id));
  await database.insert(priceHistory).values({
    id: crypto.randomUUID(),
    productId: product.id,
    price: next,
    changedBy: row.agent,
    proposalId: row.id,
    simDay: sim?.simDay ?? row.simDay,
    createdAt: nowIso(),
  });
  bus.emit({ type: "inventory.changed", sku });
  return { status: "confirmed" as const, message: `${sku} price is now $${next.toFixed(2)}.` };
}

async function refundCapture(row: typeof proposals.$inferSelect, args: Record<string, unknown>, idempotencyKey: string) {
  const database = db();
  const captureId = String(args.capture_id ?? "");
  const amount = args.amount as { currency_code?: string; value?: string } | undefined;
  const value = money(Number(amount?.value ?? row.amount ?? 0));
  const [order] = await database.select().from(orders).where(eq(orders.paypalCaptureId, captureId));
  if (!order) throw new Error("No local order matches that capture.");
  const dry = !paypal.configured() || captureId.startsWith("DRY");
  let paypalRefundId = "";
  let response: unknown = null;
  if (dry) {
    paypalRefundId = `DRY-RFD-${row.id.slice(0, 8)}`;
    response = { id: paypalRefundId, status: "COMPLETED", dryRun: true };
  } else {
    const payload = {
      capture_id: captureId,
      amount: { currency_code: "USD", value: value.toFixed(2) },
      note_to_payer: String(args.note_to_payer ?? "Refund from ShopCrew"),
    };
    try {
      response = await callToolkit("create_refund", payload);
      const parsed = response as { id?: string; error?: string; raw?: string };
      if (!parsed?.id) throw new Error(typeof parsed?.raw === "string" ? parsed.raw : "Toolkit refund did not return an id");
      paypalRefundId = parsed.id;
    } catch (error) {
      response = await paypal.requestWithRetry(
        "POST",
        `/v2/payments/captures/${captureId}/refund`,
        { amount: { currency_code: "USD", value: value.toFixed(2) }, note_to_payer: payload.note_to_payer },
        idempotencyKey,
      );
      paypalRefundId = String((response as { id?: string }).id ?? "");
      response = { ...(response as object), fallback: "rest", toolkitError: error instanceof Error ? error.message : "toolkit failed" };
    }
  }
  await database.insert(refunds).values({
    id: crypto.randomUUID(),
    orderId: order.id,
    proposalId: row.id,
    paypalRefundId,
    amount: value,
    status: dry ? "PENDING" : "PENDING",
    createdAt: nowIso(),
    confirmedAt: null,
  });
  await database.update(orders).set({ refundedTotal: money(order.refundedTotal + value), status: value + order.refundedTotal + 0.001 >= order.total ? "REFUNDED" : "PARTIALLY_REFUNDED" }).where(eq(orders.id, order.id));
  const orderView = (await database.select().from(orders).where(eq(orders.id, order.id)))[0];
  bus.emit({ type: "order.upserted", order: orderView });
  if (dry) {
    setTimeout(() => {
      void applyPayPalEvent({
        id: `dry-${paypalRefundId}`,
        event_type: "PAYMENT.CAPTURE.REFUNDED",
        resource: { id: paypalRefundId },
        dryRun: true,
      }, true);
    }, 1200);
  }
  return { status: "submitted" as const, paypalRef: paypalRefundId, response, message: dry ? `Dry-run refund ${paypalRefundId} submitted.` : `Refund ${paypalRefundId} submitted to PayPal.` };
}

async function paySupplier(row: typeof proposals.$inferSelect, args: Record<string, unknown>, idempotencyKey: string) {
  const database = db();
  const amount = money(Number(args.amount ?? row.amount ?? 0));
  const receiver = String(args.receiver ?? "");
  const purchaseOrderId = String(args.purchase_order_id ?? "");
  const dry = !paypal.configured() || receiver.endsWith("@shopcrew.test");
  let batchId = "";
  let itemId = "";
  let status = "SUCCESS";
  let response: unknown = null;
  if (dry) {
    batchId = `DRY-BATCH-${row.id.slice(0, 8)}`;
    itemId = `DRY-ITEM-${row.id.slice(0, 8)}`;
    status = receiver.includes("unclaimed") ? "UNCLAIMED" : "SUCCESS";
    response = { batch_header: { payout_batch_id: batchId }, dryRun: true, status };
  } else {
    const payload = {
      sender_batch_header: {
        sender_batch_id: row.id,
        email_subject: "ShopCrew supplier payment",
        email_message: "Payment for a restock purchase order.",
      },
      items: [
        {
          recipient_type: "EMAIL",
          amount: { value: amount.toFixed(2), currency: "USD" },
          receiver,
          note: String(args.note ?? "Restock"),
          sender_item_id: row.id,
        },
      ],
    };
    try {
      response = await paypal.requestWithRetry("POST", "/v1/payments/payouts", payload, idempotencyKey);
    } catch (error) {
      if (error instanceof PayPalError && error.status === 422) throw error;
      throw error;
    }
    const body = response as { batch_header?: { payout_batch_id?: string; batch_status?: string }; items?: { payout_item_id?: string; transaction_status?: string }[] };
    batchId = body.batch_header?.payout_batch_id ?? "";
    itemId = body.items?.[0]?.payout_item_id ?? "";
    status = body.items?.[0]?.transaction_status ?? body.batch_header?.batch_status ?? "PENDING";
  }
  await database.insert(payouts).values({
    id: crypto.randomUUID(),
    purchaseOrderId: purchaseOrderId || null,
    proposalId: row.id,
    senderBatchId: row.id,
    payoutBatchId: batchId,
    payoutItemId: itemId,
    receiver,
    amount,
    status,
    createdAt: nowIso(),
    confirmedAt: null,
  });
  if (purchaseOrderId) {
    await database.update(purchaseOrders).set({ status: "submitted", proposalId: row.id }).where(eq(purchaseOrders.id, purchaseOrderId));
  }
  const payout = (await database.select().from(payouts).where(eq(payouts.proposalId, row.id)))[0];
  bus.emit({ type: "payout.upserted", payout });
  if (dry) {
    const eventType = status === "UNCLAIMED" ? "PAYMENT.PAYOUTS-ITEM.UNCLAIMED" : "PAYMENT.PAYOUTS-ITEM.SUCCEEDED";
    setTimeout(() => {
      void applyPayPalEvent({ id: `dry-${itemId}`, event_type: eventType, resource: { payout_item_id: itemId, payout_batch_id: batchId } }, true);
    }, 1200);
  }
  return { status: "submitted" as const, paypalRef: itemId || batchId, response, message: `Payout ${status} to ${receiver}.` };
}
