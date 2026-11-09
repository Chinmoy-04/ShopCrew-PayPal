import { and, eq, inArray } from "drizzle-orm";
import { money } from "@shopcrew/shared";
import { bus } from "../bus/events.js";
import { nowIso, writeAudit } from "../db/audit.js";
import { db } from "../db/client.js";
import { actions, orders, payouts, priceHistory, products, proposals, purchaseOrders, refunds, simState } from "../db/schema.js";
import { proposalView } from "../db/views.js";
import { autoRegisterLiveCapture, isCaptureExhausted, markPoolRefund } from "../paypal/capturePool.js";
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

  const exhausted = !captureId.startsWith("DRY") && isCaptureExhausted(captureId, order.total, order.refundedTotal, value);
  const dry = !paypal.configured() || captureId.startsWith("DRY") || exhausted;
  let paypalRefundId = "";
  let response: unknown = null;
  let executionPath: "dry" | "toolkit" | "rest" | "dry_exhausted" = dry ? (exhausted ? "dry_exhausted" : "dry") : "toolkit";

  if (dry) {
    paypalRefundId = exhausted ? `DRY-EXH-${row.id.slice(0, 8)}` : `DRY-RFD-${row.id.slice(0, 8)}`;
    response = {
      id: paypalRefundId,
      status: "COMPLETED",
      dryRun: true,
      executionPath,
      idempotencyKey,
      reason: exhausted ? "DRY: capture exhausted" : "dry-run",
    };
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
      executionPath = "toolkit";
      response = { ...(response as object), executionPath, idempotencyKey };
    } catch (error) {
      try {
        response = await paypal.requestWithRetry(
          "POST",
          `/v2/payments/captures/${captureId}/refund`,
          { amount: { currency_code: "USD", value: value.toFixed(2) }, note_to_payer: payload.note_to_payer },
          idempotencyKey,
        );
        paypalRefundId = String((response as { id?: string }).id ?? "");
        executionPath = "rest";
        response = {
          ...(response as object),
          executionPath,
          idempotencyKey,
          fallback: "rest",
          toolkitError: error instanceof Error ? error.message : "toolkit failed",
        };
      } catch (restError) {
        if (restError instanceof PayPalError && restError.status >= 400 && restError.status < 500) {
          throw new Error(restError.message || `PayPal refund failed (${restError.status})`);
        }
        throw restError;
      }
    }
  }

  await database.insert(refunds).values({
    id: crypto.randomUUID(),
    orderId: order.id,
    proposalId: row.id,
    paypalRefundId,
    amount: value,
    status: "PENDING",
    createdAt: nowIso(),
    confirmedAt: null,
  });
  await database.update(orders).set({
    refundedTotal: money(order.refundedTotal + value),
    status: value + order.refundedTotal + 0.001 >= order.total ? "REFUNDED" : "PARTIALLY_REFUNDED",
  }).where(eq(orders.id, order.id));
  if (!captureId.startsWith("DRY")) markPoolRefund(captureId, value);
  const orderView = (await database.select().from(orders).where(eq(orders.id, order.id)))[0];
  bus.emit({ type: "order.upserted", order: orderView });

  // Persist path on the proposal inputs for the detail card.
  const priorInputs = (row.inputsJson ?? {}) as Record<string, unknown>;
  await database.update(proposals).set({
    inputsJson: { ...priorInputs, executionPath, idempotencyKey, paypalRefundId },
  }).where(eq(proposals.id, row.id));

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

  const pathLabel =
    executionPath === "toolkit"
      ? "Executed via Agent Toolkit create_refund"
      : executionPath === "rest"
        ? "Executed via REST fallback"
        : executionPath === "dry_exhausted"
          ? "DRY: capture exhausted"
          : `Dry-run refund ${paypalRefundId} submitted.`;

  return {
    status: "submitted" as const,
    paypalRef: paypalRefundId,
    response,
    message: exhausted
      ? `DRY: capture exhausted — simulated refund ${paypalRefundId}.`
      : dry
        ? `Dry-run refund ${paypalRefundId} submitted.`
        : `${pathLabel}; refund ${paypalRefundId} submitted to PayPal.`,
  };
}

async function paySupplier(row: typeof proposals.$inferSelect, args: Record<string, unknown>, idempotencyKey: string) {
  const database = db();
  const amount = money(Number(args.amount ?? row.amount ?? 0));
  const receiver = String(args.receiver ?? "");
  const purchaseOrderId = String(args.purchase_order_id ?? "");
  // Dry-run only when PayPal is unconfigured (not based on email domain).
  const dry = !paypal.configured();
  let batchId = "";
  let itemId = "";
  let status = "SUCCESS";
  let response: unknown = null;
  if (dry) {
    batchId = `DRY-BATCH-${row.id.slice(0, 8)}`;
    itemId = `DRY-ITEM-${row.id.slice(0, 8)}`;
    status = receiver.toLowerCase().includes("unclaimed") ? "UNCLAIMED" : "SUCCESS";
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
    response = await paypal.requestWithRetry("POST", "/v1/payments/payouts", payload, idempotencyKey);
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

/** Exported for tests — auto-register is also called from saveOrder. */
export { autoRegisterLiveCapture };
