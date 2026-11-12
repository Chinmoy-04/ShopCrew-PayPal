import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import os from "node:os";
import path from "node:path";
import { db, initDb, closeDb } from "../src/db/client.js";
import { resetDatabase } from "../src/db/seed.js";
import { payouts, products, proposals, purchaseOrders, webhookEvents } from "../src/db/schema.js";
import { applyPayPalEvent } from "../src/paypal/events.js";

describe("supplier payment replenishment", () => {
  beforeAll(async () => {
    process.env.PGLITE_DIR = path.join(os.tmpdir(), `shopcrew-restock-${crypto.randomUUID()}`);
    await initDb();
  });
  afterAll(closeDb);
  beforeEach(async () => {
    await resetDatabase();
    const [product] = await db().select().from(products).where(eq(products.sku, "NIGHT"));
    await db().update(products).set({ stock: 0 }).where(eq(products.id, product.id));
    await db().insert(proposals).values({
      id: "restock-proposal", agent: "inventory", type: "payout", targetRef: "NIGHT",
      toolName: "pay_supplier", toolArgsJson: {}, reasoning: "Restock", summary: "Restock NIGHT",
      status: "submitted", correlationId: "restock", createdAt: new Date().toISOString(), simDay: 1,
    });
    await db().insert(purchaseOrders).values({
      id: "restock-po", supplierId: product.supplierId, productId: product.id,
      qty: 10, unitCost: 11, total: 110, status: "submitted", proposalId: "restock-proposal",
    });
    await db().insert(payouts).values({
      id: "restock-payout", purchaseOrderId: "restock-po", proposalId: "restock-proposal",
      senderBatchId: "restock-proposal", payoutBatchId: "restock-batch", payoutItemId: "restock-item",
      receiver: "supplier@example.invalid", amount: 110, status: "PENDING", createdAt: new Date().toISOString(),
    });
  });

  const deliver = (suffix: string, id: string = crypto.randomUUID(), resource = {
    payout_item_id: "restock-item", payout_batch_id: "restock-batch",
  }) => applyPayPalEvent({ id, event_type: `PAYMENT.PAYOUTS-ITEM.${suffix}`, resource }, true);
  const stock = async () => (await db().select().from(products).where(eq(products.sku, "NIGHT")))[0].stock;

  it("restocks a sold-out product once across webhook redelivery and reconciliation", async () => {
    await deliver("SUCCEEDED", "success");
    expect(await stock()).toBe(10);
    await deliver("SUCCEEDED", "success");
    await deliver("SUCCEEDED", "reconciled-success");
    expect(await stock()).toBe(10);
    expect((await db().select().from(purchaseOrders))[0].status).toBe("paid");
    expect((await db().select().from(proposals).where(eq(proposals.id, "restock-proposal")))[0].status).toBe("confirmed");
  });

  it.each(["FAILED", "DENIED", "RETURNED", "UNCLAIMED", "CANCELED", "HELD", "PENDING"])(
    "%s does not create sellable stock", async (status) => {
      await deliver(status);
      expect(await stock()).toBe(0);
    },
  );

  it("batch processing and completion do not settle an individual supplier item", async () => {
    // A batch can finish processing while its item is unclaimed or failed.
    await db().update(payouts).set({ payoutItemId: "" });
    for (const type of ["PROCESSING", "SUCCESS", "DENIED"]) {
      await applyPayPalEvent({ id: crypto.randomUUID(), event_type: `PAYMENT.PAYOUTSBATCH.${type}`,
        resource: { payout_batch_id: "restock-batch" } }, true);
    }
    expect(await stock()).toBe(0);
    expect((await db().select().from(payouts))[0].status).toBe("PENDING");
  });

  it("does not match empty identifiers or a different item in the same batch", async () => {
    await deliver("SUCCEEDED", "wrong-item", { payout_item_id: "other-item", payout_batch_id: "restock-batch" });
    await db().update(payouts).set({ payoutItemId: "" });
    await deliver("SUCCEEDED", "empty-ids", { payout_item_id: "", payout_batch_id: "" });
    expect(await stock()).toBe(0);
  });

  it("discovers the item ID from its batch when the create response omitted it", async () => {
    await db().update(payouts).set({ payoutItemId: "" });
    await deliver("SUCCEEDED");
    expect(await stock()).toBe(10);
    expect((await db().select().from(payouts))[0].payoutItemId).toBe("restock-item");
  });

  it("restocks after an unclaimed payment is subsequently claimed", async () => {
    await deliver("UNCLAIMED");
    expect(await stock()).toBe(0);
    await deliver("SUCCEEDED");
    expect(await stock()).toBe(10);
  });

  it("does not receive the same order again after a later return and success redelivery", async () => {
    await deliver("SUCCEEDED");
    await deliver("RETURNED");
    await deliver("SUCCEEDED");
    expect(await stock()).toBe(10);
  });

  it("rolls back settlement if the restock cannot be recorded, then retries safely", async () => {
    const [po] = await db().select().from(purchaseOrders);
    await db().update(purchaseOrders).set({ productId: "missing-product" });
    await expect(deliver("SUCCEEDED", "retry-success")).rejects.toThrow("Restock product not found");
    expect((await db().select().from(purchaseOrders))[0].status).toBe("submitted");
    expect((await db().select().from(payouts))[0].status).toBe("PENDING");
    expect((await db().select().from(webhookEvents).where(eq(webhookEvents.paypalEventId, "retry-success")))[0].processedAt).toBeNull();
    await db().update(purchaseOrders).set({ productId: po.productId });
    await deliver("SUCCEEDED", "retry-success");
    expect(await stock()).toBe(10);
  });
});
