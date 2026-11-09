import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { money } from "@shopcrew/shared";
import { settings } from "../config.js";
import { propose, spentToday } from "../agents/gate.js";
import { completeObject } from "../agents/llm.js";
import { nowIso, writeAudit } from "../db/audit.js";
import { db, exportEmbeddedDatabase } from "../db/client.js";
import { resetDatabase } from "../db/seed.js";
import {
  checkoutDrafts,
  customers,
  orderItems,
  orders,
  policies,
  priceHistory,
  products,
  proposals,
  simState,
} from "../db/schema.js";
import { listMessageViews, listOrderViews, listProposalViews, proposalView } from "../db/views.js";
import { executeProposal } from "../executor/executor.js";
import { rollbackProposal } from "../executor/rollback.js";
import { bus } from "../bus/events.js";
import { autoRegisterLiveCapture, readCapturePool, writeCapturePool } from "../paypal/capturePool.js";
import { paypal } from "../paypal/rest.js";
import { applyPayPalEvent } from "../paypal/events.js";
import { readWebhookHeaders, verifyWebhookSignature } from "../paypal/webhookVerify.js";
import { evaluatePolicy } from "../policy/engine.js";
import { advanceDay, setAutorun, setPaused } from "../sim/clock.js";
import { explainProposal } from "../agents/explain.js";
import { buildInsightsPayload, inventoryRows, kpis, refundAnomalies } from "../insights/buildInsights.js";
import { registerStudioAiRoutes } from "./studioAi.js";
import { registerWorkflowRoutes } from "./workflows.js";
import { ruleGrid } from "./nlGrid.js";
import { clientIp, enforcePublicResetCooldown, POLICY_CLAMP, rateLimitSimAdvance } from "./demoLimits.js";

type DraftLine = { productId: string; sku: string; qty: number; unitPrice: number; name?: string };


function requireAdmin(header: string | undefined) {
  if (header !== settings.adminToken()) {
    const error = new Error("Admin token required");
    (error as Error & { statusCode: number }).statusCode = 401;
    throw error;
  }
}

export async function registerRoutes(app: FastifyInstance) {
  app.get("/healthz", async () => ({ ok: true, service: "shopcrew", time: nowIso(), db: process.env.DATABASE_URL ? "postgres" : "pglite", dryRun: !paypal.configured() }));

  app.get("/api/config", async () => ({
    paypalClientId: settings.paypal().clientId,
    paypalEnv: settings.paypal().env,
    agGridLicenseKey: settings.agGridLicense(),
    agStudioLicenseKey: settings.agStudioLicense(),
    dryRun: !paypal.configured(),
    llmProvider: settings.llmProvider(),
    studioAiEnabled: Boolean(settings.studioOpenAiKey()),
    studioAiModels: settings.studioOpenAiModels(),
    demoBuyerEmail: process.env.DEMO_BUYER_EMAIL || "",
    demoBuyerHint: process.env.DEMO_BUYER_HINT || "Use the sandbox personal account Buyer Bob from developer.paypal.com",
    demoPublicReset: settings.demoPublicReset(),
  }));

  await registerStudioAiRoutes(app);
  await registerWorkflowRoutes(app);

  app.get("/api/admin/backup/database", async (req, reply) => {
    requireAdmin(req.headers["x-admin-token"] as string | undefined);
    const archive = await exportEmbeddedDatabase();
    return reply.header("Cache-Control", "no-store")
      .header("Content-Disposition", 'attachment; filename="shopcrew-pglite.tar.gz"')
      .type("application/gzip").send(archive);
  });
  app.get("/api/admin/backup/capture-pool", async (req, reply) => {
    requireAdmin(req.headers["x-admin-token"] as string | undefined);
    return reply.header("Cache-Control", "no-store").send(readCapturePool());
  });

  app.get("/api/products", async () => db().select().from(products));
  app.get("/api/products/:sku", async (req) => {
    const sku = (req.params as { sku: string }).sku;
    const [product] = await db().select().from(products).where(eq(products.sku, sku));
    if (!product) throw Object.assign(new Error("Product not found"), { statusCode: 404 });
    const history = await db().select().from(priceHistory).where(eq(priceHistory.productId, product.id));
    const latest = history.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0];
    return {
      ...product,
      priceNote: latest
        ? latest.changedBy === "seed"
          ? "Starting price"
          : `Price set by ${latest.changedBy} agent, day ${latest.simDay}`
        : null,
      priceSetBy: latest?.changedBy ?? null,
      priceSimDay: latest?.simDay ?? null,
    };
  });

  app.patch("/api/products/:sku", async (req) => {
    const sku = (req.params as { sku: string }).sku;
    const body = req.body as { leadTimeDays?: number };
    if (body.leadTimeDays) await db().update(products).set({ leadTimeDays: body.leadTimeDays }).where(eq(products.sku, sku));
    const [product] = await db().select().from(products).where(eq(products.sku, sku));
    bus.emit({ type: "inventory.changed", sku });
    return product;
  });

  app.post("/api/checkout/orders", async (req) => {
    const body = req.body as { items: { sku: string; qty: number }[] };
    if (!Array.isArray(body.items) || !body.items.length) {
      throw Object.assign(new Error("Cart is empty"), { statusCode: 400 });
    }
    const catalog = await db().select().from(products);
    const lines: DraftLine[] = body.items.map((item) => {
      const product = catalog.find((row) => row.sku === item.sku);
      if (!product) throw Object.assign(new Error(`Unknown SKU ${item.sku}`), { statusCode: 400 });
      const qty = Number(item.qty);
      if (!Number.isInteger(qty) || qty < 1 || qty > product.stock) {
        throw Object.assign(new Error(`Invalid qty for ${item.sku} (must be an integer from 1 to ${product.stock})`), { statusCode: 400 });
      }
      return { productId: product.id, sku: product.sku, name: product.name, qty, unitPrice: product.price };
    });
    const total = money(lines.reduce((sum, line) => sum + line.unitPrice * line.qty, 0));
    if (!paypal.configured()) {
      const localId = await saveOrder({
        paypalOrderId: `DRY-ORD-${Date.now()}`,
        captureId: `DRY-CAP-CHK${Date.now()}`.slice(0, 22),
        total,
        lines,
        dry: true,
      });
      return { id: localId, dryRun: true };
    }
    const created = (await paypal.request("POST", "/v2/checkout/orders", {
      intent: "CAPTURE",
      purchase_units: [{
        amount: {
          currency_code: "USD",
          value: total.toFixed(2),
          breakdown: { item_total: { currency_code: "USD", value: total.toFixed(2) } },
        },
        items: lines.map((line) => ({
          name: line.name ?? line.sku,
          quantity: String(line.qty),
          unit_amount: { currency_code: "USD", value: line.unitPrice.toFixed(2) },
        })),
      }],
    })) as { id: string };
    await db().delete(checkoutDrafts).where(eq(checkoutDrafts.paypalOrderId, created.id));
    await db().insert(checkoutDrafts).values({
      paypalOrderId: created.id,
      linesJson: lines,
      total,
      createdAt: nowIso(),
    });
    return { id: created.id, dryRun: false };
  });

  app.post("/api/checkout/orders/:id/capture", async (req) => {
    const id = (req.params as { id: string }).id;
    if (id.startsWith("ord-") || id.startsWith("syn-")) return { id, status: "CAPTURED", dryRun: true };

    const existing = await db().select().from(orders).where(eq(orders.paypalOrderId, id));
    if (existing[0]) {
      return { id: existing[0].id, paypalOrderId: id, captureId: existing[0].paypalCaptureId, status: existing[0].status, dryRun: false };
    }

    const [draftRow] = await db().select().from(checkoutDrafts).where(eq(checkoutDrafts.paypalOrderId, id));
    const draftLines = (draftRow?.linesJson as DraftLine[] | undefined) ?? [];
    const draftTotal = draftRow?.total;

    const captured = (await paypal.request("POST", `/v2/checkout/orders/${id}/capture`, {}, `capture-${id}`)) as {
      purchase_units?: { payments?: { captures?: { id: string; amount?: { value: string } }[] } }[];
      payer?: { email_address?: string; name?: { given_name?: string; surname?: string }; payer_id?: string };
    };
    const capture = captured.purchase_units?.[0]?.payments?.captures?.[0];
    const given = captured.payer?.name?.given_name?.trim() ?? "";
    const surname = captured.payer?.name?.surname?.trim() ?? "";
    const payerName = [given, surname].filter(Boolean).join(" ") || "Sandbox buyer";

    const again = await db().select().from(orders).where(eq(orders.paypalOrderId, id));
    if (again[0]) {
      return { id: again[0].id, paypalOrderId: id, captureId: again[0].paypalCaptureId, status: again[0].status, dryRun: false };
    }

    const localId = await saveOrder({
      paypalOrderId: id,
      captureId: capture?.id ?? "",
      total: draftTotal ?? Number(capture?.amount?.value ?? 0),
      lines: draftLines,
      customerName: payerName,
      customerEmail: captured.payer?.email_address ?? `payer-${captured.payer?.payer_id ?? id}@sandbox.paypal`,
      dry: false,
    });
    if (draftRow) await db().delete(checkoutDrafts).where(eq(checkoutDrafts.paypalOrderId, id));
    return { id: localId, paypalOrderId: id, captureId: capture?.id, status: "CAPTURED", dryRun: false };
  });

  app.get("/api/orders", async () => listOrderViews());
  app.get("/api/orders/:id", async (req) => {
    const id = (req.params as { id: string }).id;
    const views = await listOrderViews();
    const order = views.find((row) => row.id === id);
    if (!order) throw Object.assign(new Error("Order not found"), { statusCode: 404 });
    return {
      ...order,
      live: Boolean(order.paypalCaptureId && !String(order.paypalCaptureId).startsWith("DRY")),
      awaitingWebhook: Boolean(order.paypalCaptureId && !String(order.paypalCaptureId).startsWith("DRY") && !order.confirmedAt),
    };
  });
  app.get("/api/proposals", async () => listProposalViews());
  app.get("/api/proposals/:id", async (req) => proposalView((req.params as { id: string }).id));

  app.patch("/api/proposals/:id", async (req) => {
    const id = (req.params as { id: string }).id;
    const body = req.body as { amount?: number };
    const [row] = await db().select().from(proposals).where(eq(proposals.id, id));
    if (!row || row.status !== "pending_approval") throw Object.assign(new Error("Only a pending proposal can be edited"), { statusCode: 409 });
    const amount = money(Number(body.amount));
    const [sim] = await db().select().from(simState);
    const [policy] = await db().select().from(policies).where(eq(policies.agent, row.agent));
    const extra = (policy?.extraJson ?? {}) as { autoApprovePct?: number };
    const priorInputs = (row.inputsJson ?? {}) as Record<string, unknown> & {
      remaining?: number;
      customerRefunds30d?: number;
      suspicious?: boolean;
    };
    let orderTotal: number | undefined;
    let refundedAlready: number | undefined;
    if (row.type === "refund") {
      const [order] = await db().select().from(orders).where(eq(orders.id, row.targetRef));
      if (order) {
        orderTotal = order.total;
        refundedAlready = order.refundedTotal;
      } else if (priorInputs.remaining != null) {
        orderTotal = Number(priorInputs.remaining) + Number(row.amount ?? 0);
        refundedAlready = 0;
      }
    }
    const policyResult = evaluatePolicy({
      agent: row.agent as "cs" | "inventory" | "pricing" | "supplier" | "orchestrator",
      type: (row.type === "discount" ? "price_change" : row.type) as "refund" | "reply" | "payout" | "price_change" | "purchase_order",
      amount: row.type === "price_change" || row.type === "reply" || row.type === "discount" ? 0 : amount,
      pausedAll: sim?.pausedAll ?? false,
      agentEnabled: policy?.enabled ?? true,
      autoApproveMax: policy?.autoApproveMax ?? 0,
      dailyBudget: policy?.dailyBudget ?? 0,
      spentToday: await spentToday(row.agent, sim?.simDay ?? 0),
      maxPctOfOrder: policy?.maxPctOfOrder ?? 1,
      maxPriceChangePct: policy?.maxPriceChangePct ?? 20,
      minMarginPct: policy?.minMarginPct ?? 0,
      autoApprovePct: extra.autoApprovePct ?? 5,
      orderTotal,
      refundedAlready,
      customerRefunds30d: Number(priorInputs.customerRefunds30d ?? 0),
      suspicious: Boolean(priorInputs.suspicious),
    });
    if (policyResult.decision === "blocked") {
      throw Object.assign(new Error(policyResult.reasons.join(" ") || "Edit blocked by policy"), { statusCode: 422 });
    }
    const args = { ...(row.toolArgsJson as Record<string, unknown>) };
    if (row.type === "refund") args.amount = { currency_code: "USD", value: amount.toFixed(2) };
    if (row.type === "price_change") args.new_price = amount;
    if (row.type === "payout") args.amount = amount.toFixed(2);
    await db().update(proposals).set({
      amount,
      editedArgsJson: args,
      policyResultJson: { ...policyResult, ...(orderTotal != null ? { orderTotal, refundedAlready } : {}), editedByOwner: true },
      inputsJson: { ...priorInputs, editedByOwner: true },
    }).where(eq(proposals.id, id));
    await writeAudit({ actor: "owner", agent: row.agent, event: "proposal.edited", proposalId: id, correlationId: row.correlationId, message: `Owner edited the amount to $${amount.toFixed(2)}.` });
    const view = await proposalView(id);
    bus.emit({ type: "proposal.upserted", proposal: view });
    return view;
  });

  app.post("/api/proposals/:id/approve", async (req) => {
    const id = (req.params as { id: string }).id;
    const [row] = await db().select().from(proposals).where(and(eq(proposals.id, id), eq(proposals.status, "pending_approval")));
    if (!row) throw Object.assign(new Error("Proposal is not waiting for approval"), { statusCode: 409 });
    const finalAmount = money(Number(row.amount ?? 0));
    await writeAudit({
      actor: "owner",
      agent: row.agent,
      event: "proposal.approved",
      proposalId: id,
      correlationId: row.correlationId,
      message: `Owner approved final amount $${finalAmount.toFixed(2)}.`,
    });
    await db().update(proposals).set({ status: "approved", decidedBy: "owner", decidedAt: nowIso() }).where(eq(proposals.id, id));
    await executeProposal(id, "owner");
    return proposalView(id);
  });

  app.post("/api/proposals/:id/reject", async (req) => {
    const id = (req.params as { id: string }).id;
    const [row] = await db().select().from(proposals).where(eq(proposals.id, id));
    if (!row) throw Object.assign(new Error("Not found"), { statusCode: 404 });
    await db().update(proposals).set({ status: "rejected", decidedBy: "owner", decidedAt: nowIso() }).where(eq(proposals.id, id));
    await writeAudit({ actor: "owner", agent: row.agent, event: "proposal.rejected", proposalId: id, correlationId: row.correlationId, message: "Owner rejected the proposal." });
    const view = await proposalView(id);
    bus.emit({ type: "proposal.upserted", proposal: view });
    return view;
  });

  app.post("/api/proposals/:id/rollback", async (req) => rollbackProposal((req.params as { id: string }).id));

  app.post("/api/proposals/approve-selected", async (req) => {
    const body = req.body as { ids: string[]; maxAmount?: number };
    const done: string[] = [];
    for (const id of body.ids) {
      const [row] = await db().select().from(proposals).where(eq(proposals.id, id));
      if (!row || row.status !== "pending_approval") continue;
      if (body.maxAmount !== undefined && (row.amount ?? 0) > body.maxAmount) continue;
      await db().update(proposals).set({ status: "approved", decidedBy: "owner", decidedAt: nowIso() }).where(eq(proposals.id, id));
      await executeProposal(id, "owner");
      done.push(id);
    }
    return { approved: done };
  });

  app.get("/api/inventory", async () => inventoryRows());
  app.get("/api/messages", async () => listMessageViews());

  app.get("/api/payouts", async () => {
    const { payouts } = await import("../db/schema.js");
    const rows = await db().select().from(payouts);
    const catalog = await db().select().from(products);
    const { purchaseOrders } = await import("../db/schema.js");
    const pos = await db().select().from(purchaseOrders);
    return rows.map((row) => {
      const po = pos.find((item) => item.id === row.purchaseOrderId);
      const product = catalog.find((item) => item.id === po?.productId);
      return {
        ...row,
        confirmedAt: row.confirmedAt,
        sku: product?.sku ?? "",
        supplierId: po?.supplierId ?? "",
        negotiation: po?.negotiationJson ?? null,
        qty: po?.qty ?? null,
        quote: product?.cost ?? null,
      };
    });
  });
  app.get("/api/audit", async () => {
    const { auditLog } = await import("../db/schema.js");
    const rows = await db().select().from(auditLog);
    return rows.sort((a, b) => (a.ts < b.ts ? 1 : -1));
  });
  app.get("/api/policies", async () => db().select().from(policies));
  app.put("/api/policies/:agent", async (req) => {
    const agent = (req.params as { agent: string }).agent;
    const body = req.body as Record<string, number | boolean>;
    if (body.autoApproveMax !== undefined && Number(body.autoApproveMax) > POLICY_CLAMP.autoApproveMax) {
      throw Object.assign(new Error(`autoApproveMax must be ≤ ${POLICY_CLAMP.autoApproveMax}`), { statusCode: 422 });
    }
    if (body.dailyBudget !== undefined && Number(body.dailyBudget) > POLICY_CLAMP.dailyBudget) {
      throw Object.assign(new Error(`dailyBudget must be ≤ ${POLICY_CLAMP.dailyBudget}`), { statusCode: 422 });
    }
    await db().update(policies).set({
      enabled: body.enabled === undefined ? undefined : Boolean(body.enabled),
      autoApproveMax: body.autoApproveMax === undefined ? undefined : Number(body.autoApproveMax),
      dailyBudget: body.dailyBudget === undefined ? undefined : Number(body.dailyBudget),
      maxPctOfOrder: body.maxPctOfOrder === undefined ? undefined : Number(body.maxPctOfOrder),
      maxPriceChangePct: body.maxPriceChangePct === undefined ? undefined : Number(body.maxPriceChangePct),
      minMarginPct: body.minMarginPct === undefined ? undefined : Number(body.minMarginPct),
      updatedAt: nowIso(),
    }).where(eq(policies.agent, agent));
    const [policy] = await db().select().from(policies).where(eq(policies.agent, agent));
    bus.emit({ type: "policy.updated", policy });
    return policy;
  });

  app.get("/api/sim", async () => (await db().select().from(simState))[0]);
  app.post("/api/sim/advance", async (req) => {
    rateLimitSimAdvance(clientIp(req));
    return advanceDay();
  });
  app.post("/api/sim/autorun", async (req) => {
    const enabled = Boolean((req.body as { enabled?: boolean }).enabled);
    await setAutorun(enabled);
    return (await db().select().from(simState))[0];
  });
  app.post("/api/sim/pause", async (req) => {
    await setPaused(Boolean((req.body as { paused?: boolean }).paused));
    return (await db().select().from(simState))[0];
  });
  app.post("/api/sim/reset", async (req) => {
    if (settings.demoPublicReset()) {
      enforcePublicResetCooldown(clientIp(req));
    } else {
      requireAdmin(req.headers["x-admin-token"] as string | undefined);
    }
    await resetDatabase();
    bus.emit({ type: "sim.reset" });
    return (await db().select().from(simState))[0];
  });

  app.get("/api/kpis", async () => kpis());

  app.post("/api/nl/grid", async (req) => {
    const body = req.body as { query: string; grid?: string; state?: unknown; schema?: unknown };
    const [sim] = await db().select().from(simState);
    const fallback = ruleGrid(body.query, sim?.simDay ?? 0, body.grid);
    const knownColumns = new Set([
      "status", "type", "summary", "amount", "confidenceModel", "riskScore", "createdAt", "agent",
      "targetRef", "policyResult", "decidedBy", "reason", "simDay", "paypalRef", "id", "sku", "customer",
    ]);
    const llm = await completeObject(
      "Turn a shop-owner sentence into an AG Grid state patch. Prefer filterModel and rowGroupCols. Only use known column ids.",
      body.query,
      body.schema ?? {
        type: "object",
        properties: {
          explanation: { type: "string" },
          gridState: { type: "object" },
          simple: {
            type: "object",
            properties: {
              filterModel: { type: "object" },
              rowGroupCols: { type: "array", items: { type: "string" } },
            },
          },
        },
      },
      null as null,
    );
    if (llm && typeof llm === "object") {
      const patch = llm as {
        explanation?: string;
        gridState?: { filter?: { filterModel?: Record<string, unknown> }; rowGroup?: { groupColIds?: string[] } };
        simple?: { filterModel?: Record<string, unknown>; rowGroupCols?: string[] };
      };
      const filterModel = { ...(fallback.simple.filterModel), ...(patch.simple?.filterModel ?? {}) };
      for (const key of Object.keys(filterModel)) {
        if (!knownColumns.has(key)) delete filterModel[key];
      }
      const rowGroupCols = (patch.simple?.rowGroupCols ?? fallback.simple.rowGroupCols).filter((col) => knownColumns.has(col));
      return {
        ...fallback,
        explanation: patch.explanation ?? fallback.explanation,
        simple: { filterModel, rowGroupCols },
        gridState: patch.gridState ?? null,
        propertiesToIgnore: [],
      };
    }
    return fallback;
  });

  app.post("/api/paypal/webhooks", async (req, reply) => {
    const raw = (req as { rawBody?: string }).rawBody ?? JSON.stringify(req.body ?? {});
    const headers = readWebhookHeaders(req.headers);
    let verified = false;
    try {
      verified = await verifyWebhookSignature(raw, headers);
    } catch {
      verified = false;
    }
    const event = req.body as { id: string; event_type: string; resource?: Record<string, unknown> };
    await applyPayPalEvent(event, verified);
    return reply.code(200).send({ ok: true });
  });

  app.get("/api/events", async (req, reply) => {
    reply.hijack();
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    const send = (event: unknown) => reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
    send({ type: "hello", ts: Date.now() });
    const off = bus.on(send);
    const ping = setInterval(() => reply.raw.write(`: ping\n\n`), 15000);
    req.raw.on("close", () => {
      clearInterval(ping);
      off();
    });
  });

  app.post("/api/proposals/:id/ask", async (req) => {
    const id = (req.params as { id: string }).id;
    const { question } = req.body as { question: string };
    if (!question?.trim()) throw Object.assign(new Error("question is required"), { statusCode: 400 });
    const proposal = await proposalView(id);
    if (!proposal) throw Object.assign(new Error("Proposal not found"), { statusCode: 404 });
    const policy = proposal.policy as { reasons?: string[] } | null;
    const result = await explainProposal({
      id: proposal.id,
      agent: proposal.agent,
      type: proposal.type,
      summary: proposal.summary,
      reasoning: proposal.reasoning,
      policyResult: proposal.policyResult,
      policyReasons: policy?.reasons ?? [],
      status: proposal.status,
      amount: proposal.amount,
      paypalRef: proposal.paypalRef,
      inputs: proposal.inputs,
      trace: proposal.trace,
      correlationId: proposal.correlationId,
    }, question);
    await writeAudit({
      actor: "owner",
      agent: proposal.agent,
      event: "owner.asked",
      proposalId: id,
      correlationId: proposal.correlationId,
      message: `Q: "${question}" — A: "${result.answer}"`,
    });
    return result;
  });

  app.post("/api/admin/capture-pool", async (req) => {
    requireAdmin(req.headers["x-admin-token"] as string | undefined);
    const { refunds: refundsTable } = await import("../db/schema.js");
    const allOrders = await db().select().from(orders);
    const allRefunds = await db().select().from(refundsTable);
    const liveOrders = allOrders
      .filter((o) => o.source === "paypal" && o.paypalCaptureId && !o.paypalCaptureId.startsWith("DRY") && !allRefunds.some((r) => r.orderId === o.id))
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    const large = liveOrders.find((o) => o.total >= 45);
    const small = liveOrders.find((o) => o.total >= 36 && o.id !== large?.id);
    if (!large) {
      const needed = liveOrders.length === 0 ? 2 : 1;
      throw Object.assign(new Error(`Need ${needed} more sandbox checkout(s) of at least $45 each. Found ${liveOrders.length} unrefunded live order(s).`), { statusCode: 422 });
    }
    if (!small) {
      throw Object.assign(new Error(`Need 1 more sandbox checkout of at least $36. Have large order (${large.id}=$${large.total.toFixed(2)}) but no suitable second order yet.`), { statusCode: 422 });
    }
    const pool = {
      orders: [
        { id: "ord-large", paypalOrderId: large.paypalOrderId, paypalCaptureId: large.paypalCaptureId, total: large.total, refunded: 0 },
        { id: "ord-small", paypalOrderId: small.paypalOrderId, paypalCaptureId: small.paypalCaptureId, total: small.total, refunded: 0 },
      ],
    };
    writeCapturePool(pool);
    await resetDatabase();
    bus.emit({ type: "sim.reset" });
    return { ok: true, mapping: pool.orders };
  });

  app.post("/api/admin/test-refund", async (req) => {
    requireAdmin(req.headers["x-admin-token"] as string | undefined);
    const [order] = await db().select().from(orders).where(eq(orders.id, "ord-small"));
    if (!order?.paypalCaptureId) throw new Error("Seed order missing");
    return propose({
      agent: "cs",
      type: "refund",
      targetRef: order.id,
      toolName: "create_refund",
      toolArgs: { capture_id: order.paypalCaptureId, amount: { currency_code: "USD", value: "8.00" }, note_to_payer: "Test refund" },
      reasoning: "Manual test refund of $8, under the auto-approve threshold.",
      summary: "Test refund $8.00 on ord-small",
      reason: "damaged",
      confidenceModel: 0.9,
      confidenceLlm: 0.5,
      amount: 8,
      policyExtra: { orderTotal: order.total, refundedAlready: order.refundedTotal, customerRefunds30d: 0 },
    });
  });

  app.get("/api/insights", async () => buildInsightsPayload());

  app.get("/api/insights/anomalies", async () => {
    const payload = await buildInsightsPayload();
    return refundAnomalies(payload.refunds.map((r) => ({ day: r.day, amount: r.amount })), 2);
  });
}

async function saveOrder(input: {
  paypalOrderId: string;
  captureId: string;
  total: number;
  lines: { productId: string; qty: number; unitPrice: number }[];
  customerName?: string;
  customerEmail?: string;
  dry?: boolean;
}) {
  const database = db();
  const [sim] = await database.select().from(simState);
  const id = `ord-live-${Date.now()}`;
  const email = input.customerEmail ?? "sandbox-buyer@shopcrew.example";
  const name = input.customerName ?? "Sandbox buyer";
  const existing = await database.select().from(customers).where(eq(customers.email, email));
  let customerId = existing[0]?.id;
  if (!customerId) {
    customerId = `cust-live-${Date.now()}`;
    await database.insert(customers).values({ id: customerId, name, email, refunds30d: 0 });
  } else if (name && existing[0] && existing[0].name !== name) {
    await database.update(customers).set({ name }).where(eq(customers.id, customerId));
  }
  const dry = Boolean(input.dry || input.captureId.startsWith("DRY"));
  await database.insert(orders).values({
    id,
    customerId,
    source: "paypal",
    paypalOrderId: input.paypalOrderId,
    paypalCaptureId: input.captureId,
    status: "CAPTURED",
    total: input.total,
    refundedTotal: 0,
    currency: "USD",
    simDay: sim?.simDay ?? 0,
    createdAt: nowIso(),
    confirmedAt: dry ? nowIso() : null,
  });
  if (input.lines.length) {
    await database.insert(orderItems).values(input.lines.map((line, index) => ({ id: `${id}-${index}`, orderId: id, productId: line.productId, qty: line.qty, unitPrice: line.unitPrice })));
    for (const line of input.lines) {
      const [product] = await database.select().from(products).where(eq(products.id, line.productId));
      if (product) await database.update(products).set({ stock: Math.max(0, product.stock - line.qty) }).where(eq(products.id, product.id));
    }
  }
  if (!dry && input.captureId) {
    autoRegisterLiveCapture({
      paypalOrderId: input.paypalOrderId,
      paypalCaptureId: input.captureId,
      total: input.total,
    });
  }
  const [order] = await listOrderViews().then((rows) => rows.filter((row) => row.id === id));
  bus.emit({ type: "order.upserted", order });
  return id;
}
