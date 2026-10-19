import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { money } from "@shopcrew/shared";
import { settings } from "../config.js";
import { propose } from "../agents/gate.js";
import { completeObject } from "../agents/llm.js";
import { nowIso, writeAudit } from "../db/audit.js";
import { db } from "../db/client.js";
import { resetDatabase } from "../db/seed.js";
import { competitorPrices, customers, orderItems, orders, policies, products, proposals, salesDaily, simState } from "../db/schema.js";
import { listMessageViews, listOrderViews, listProposalViews, proposalView } from "../db/views.js";
import { executeProposal } from "../executor/executor.js";
import { rollbackProposal } from "../executor/rollback.js";
import { bus } from "../bus/events.js";
import { olsElasticity } from "../ml/elasticity.js";
import { holtWinters } from "../ml/holtWinters.js";
import { reorderPlan } from "../ml/reorder.js";
import { paypal } from "../paypal/rest.js";
import { applyPayPalEvent } from "../paypal/events.js";
import { readWebhookHeaders, verifyWebhookSignature } from "../paypal/webhookVerify.js";
import { advanceDay, setAutorun, setPaused } from "../sim/clock.js";
import { explainProposal } from "../agents/explain.js";

const drafts = new Map<string, { lines: { productId: string; sku: string; qty: number; unitPrice: number }[]; total: number }>();

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
  }));

  // AG Studio AI assistant proxy — browser adapter POSTs here; key never leaves the server.
  app.post("/api/studio/ai/responses", async (req, reply) => {
    const apiKey = settings.studioOpenAiKey();
    if (!apiKey) {
      return reply.code(503).send({
        error: { message: "Studio AI is not configured. Set AG_STUDIO_OPENAI_API_KEY or OPENAI_API_KEY in .env." },
      });
    }
    const models = settings.studioOpenAiModels();
    const body = (req.body ?? {}) as Record<string, unknown>;
    const model = typeof body.model === "string" && body.model ? body.model : models[0];
    if (!models.includes(model)) {
      return reply.code(400).send({
        error: { message: `Model "${model}" is not enabled. Allowed: ${models.join(", ")}` },
      });
    }

    const upstream = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ ...body, model, max_output_tokens: 16_000 }),
    });

    const contentType = upstream.headers.get("Content-Type") ?? "application/json";
    reply.code(upstream.status).header("Cache-Control", "no-store").type(contentType);

    if (!upstream.body) {
      return reply.send(await upstream.text());
    }

    // Stream SSE (and non-stream JSON) through without buffering the whole payload.
    const { Readable } = await import("node:stream");
    return reply.send(Readable.fromWeb(upstream.body as import("node:stream/web").ReadableStream));
  });

  app.get("/api/products", async () => db().select().from(products));
  app.get("/api/products/:sku", async (req) => {
    const sku = (req.params as { sku: string }).sku;
    const [product] = await db().select().from(products).where(eq(products.sku, sku));
    if (!product) throw Object.assign(new Error("Product not found"), { statusCode: 404 });
    return product;
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
    const catalog = await db().select().from(products);
    const lines = body.items.map((item) => {
      const product = catalog.find((row) => row.sku === item.sku);
      if (!product) throw Object.assign(new Error(`Unknown SKU ${item.sku}`), { statusCode: 400 });
      return { productId: product.id, sku: product.sku, name: product.name, qty: item.qty, unitPrice: product.price };
    });
    const total = money(lines.reduce((sum, line) => sum + line.unitPrice * line.qty, 0));
    if (!paypal.configured()) {
      const localId = await saveOrder({ paypalOrderId: `DRY-ORD-${Date.now()}`, captureId: `DRY-CAP-CHK${Date.now()}`.slice(0, 22), total, lines });
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
          name: line.name,
          quantity: String(line.qty),
          unit_amount: { currency_code: "USD", value: line.unitPrice.toFixed(2) },
        })),
      }],
    })) as { id: string };
    drafts.set(created.id, { lines, total });
    return { id: created.id, dryRun: false };
  });

  app.post("/api/checkout/orders/:id/capture", async (req) => {
    const id = (req.params as { id: string }).id;
    if (id.startsWith("ord-") || id.startsWith("syn-")) return { id, status: "CAPTURED", dryRun: true };
    const draft = drafts.get(id);
    const captured = (await paypal.request("POST", `/v2/checkout/orders/${id}/capture`, {}, `capture-${id}`)) as {
      purchase_units?: { payments?: { captures?: { id: string; amount?: { value: string } }[] } }[];
      payer?: { email_address?: string; name?: { given_name?: string; surname?: string }; payer_id?: string };
    };
    const capture = captured.purchase_units?.[0]?.payments?.captures?.[0];
    const given = captured.payer?.name?.given_name?.trim() ?? "";
    const surname = captured.payer?.name?.surname?.trim() ?? "";
    const payerName = [given, surname].filter(Boolean).join(" ") || "Sandbox buyer";
    const localId = await saveOrder({
      paypalOrderId: id,
      captureId: capture?.id ?? "",
      total: draft?.total ?? Number(capture?.amount?.value ?? 0),
      lines: draft?.lines ?? [],
      customerName: payerName,
      customerEmail: captured.payer?.email_address ?? `payer-${captured.payer?.payer_id ?? id}@sandbox.paypal`,
    });
    drafts.delete(id);
    return { id: localId, paypalOrderId: id, captureId: capture?.id, status: "CAPTURED" };
  });

  app.get("/api/orders", async () => listOrderViews());
  app.get("/api/proposals", async () => listProposalViews());
  app.get("/api/proposals/:id", async (req) => proposalView((req.params as { id: string }).id));

  app.patch("/api/proposals/:id", async (req) => {
    const id = (req.params as { id: string }).id;
    const body = req.body as { amount?: number };
    const [row] = await db().select().from(proposals).where(eq(proposals.id, id));
    if (!row || row.status !== "pending_approval") throw Object.assign(new Error("Only a pending proposal can be edited"), { statusCode: 409 });
    const amount = money(Number(body.amount));
    const args = { ...(row.toolArgsJson as Record<string, unknown>) };
    if (row.type === "refund") args.amount = { currency_code: "USD", value: amount.toFixed(2) };
    if (row.type === "price_change") args.new_price = amount;
    if (row.type === "payout") args.amount = amount.toFixed(2);
    await db().update(proposals).set({ amount, editedArgsJson: args }).where(eq(proposals.id, id));
    await writeAudit({ actor: "owner", agent: row.agent, event: "proposal.edited", proposalId: id, correlationId: row.correlationId, message: `Owner edited the amount to $${amount.toFixed(2)}.` });
    const view = await proposalView(id);
    bus.emit({ type: "proposal.upserted", proposal: view });
    return view;
  });

  app.post("/api/proposals/:id/approve", async (req) => {
    const id = (req.params as { id: string }).id;
    const [row] = await db().select().from(proposals).where(and(eq(proposals.id, id), eq(proposals.status, "pending_approval")));
    if (!row) throw Object.assign(new Error("Proposal is not waiting for approval"), { statusCode: 409 });
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
  app.post("/api/sim/advance", async () => advanceDay());
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
    requireAdmin(req.headers["x-admin-token"] as string | undefined);
    await resetDatabase();
    bus.emit({ type: "sim.reset" });
    return (await db().select().from(simState))[0];
  });

  app.get("/api/kpis", async () => kpis());

  app.post("/api/nl/grid", async (req) => {
    const body = req.body as { query: string; grid?: string; state?: unknown; schema?: unknown };
    const [sim] = await db().select().from(simState);
    const fallback = ruleGrid(body.query, sim?.simDay ?? 0, body.grid);
    const llm = await completeObject( "Turn a shop-owner sentence into an AG Grid state patch.", body.query, body.schema ?? { type: "object" }, null as null);
    if (llm && typeof llm === "object" && "gridState" in (llm as object)) {
      return { ...fallback, ...(llm as object), explanation: (llm as { explanation?: string }).explanation ?? fallback.explanation };
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
        { id: "ord-large", paypalOrderId: large.paypalOrderId, paypalCaptureId: large.paypalCaptureId },
        { id: "ord-small", paypalOrderId: small.paypalOrderId, paypalCaptureId: small.paypalCaptureId },
      ],
    };
    const fs = await import("node:fs");
    const path = await import("node:path");
    const { repoRoot } = await import("../config.js");
    fs.writeFileSync(path.join(repoRoot(), "fixtures", "capture-pool.json"), JSON.stringify(pool, null, 2));
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

  app.get("/api/insights", async () => {
    const { payouts } = await import("../db/schema.js");
    const { purchaseOrders } = await import("../db/schema.js");
    const payoutRows = await db().select().from(payouts);
    const pos = await db().select().from(purchaseOrders);
    const catalog = await db().select().from(products);
    return {
      kpis: await kpis(),
      policies: await db().select().from(policies),
      proposals: await listProposalViews(),
      orders: await listOrderViews(),
      inventory: await inventoryRows(),
      payouts: payoutRows.map((row) => {
        const po = pos.find((item) => item.id === row.purchaseOrderId);
        const product = catalog.find((item) => item.id === po?.productId);
        return {
          id: row.id,
          amount: row.amount,
          status: row.status,
          receiver: row.receiver,
          sku: product?.sku ?? "",
          createdAt: row.createdAt,
        };
      }),
    };
  });
}

async function saveOrder(input: {
  paypalOrderId: string;
  captureId: string;
  total: number;
  lines: { productId: string; qty: number; unitPrice: number }[];
  customerName?: string;
  customerEmail?: string;
}) {
  const database = db();
  const [sim] = await database.select().from(simState);
  const id = `ord-live-${Date.now()}`;
  const email = input.customerEmail ?? "sandbox-buyer@shopcrew.test";
  const name = input.customerName ?? "Sandbox buyer";
  const existing = await database.select().from(customers).where(eq(customers.email, email));
  let customerId = existing[0]?.id;
  if (!customerId) {
    customerId = `cust-live-${Date.now()}`;
    await database.insert(customers).values({ id: customerId, name, email, refunds30d: 0 });
  } else if (name && existing[0] && existing[0].name !== name) {
    await database.update(customers).set({ name }).where(eq(customers.id, customerId));
  }
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
  });
  if (input.lines.length) {
    await database.insert(orderItems).values(input.lines.map((line, index) => ({ id: `${id}-${index}`, orderId: id, productId: line.productId, qty: line.qty, unitPrice: line.unitPrice })));
    for (const line of input.lines) {
      const [product] = await database.select().from(products).where(eq(products.id, line.productId));
      if (product) await database.update(products).set({ stock: Math.max(0, product.stock - line.qty) }).where(eq(products.id, product.id));
    }
  }
  const [order] = await listOrderViews().then((rows) => rows.filter((row) => row.id === id));
  bus.emit({ type: "order.upserted", order });
  return id;
}

async function inventoryRows() {
  const catalog = await db().select().from(products);
  const sales = await db().select().from(salesDaily);
  const rivals = await db().select().from(competitorPrices);
  return catalog.map((product) => {
    const series = sales.filter((row) => row.productId === product.id).sort((a, b) => a.simDay - b.simDay);
    const hw = holtWinters(series.map((row) => row.units));
    const fit = olsElasticity(series.map((row) => ({ price: row.price, units: row.units })));
    const daily = hw.forecast.slice(0, 7).reduce((sum, value) => sum + value, 0) / 7;
    const plan = reorderPlan({ stock: product.stock, daily, sigma: hw.sigma, leadTimeDays: product.leadTimeDays });
    const latest = Math.max(...rivals.filter((row) => row.productId === product.id).map((row) => row.simDay), -999);
    const competitorMin = Math.min(...rivals.filter((row) => row.productId === product.id && row.simDay === latest).map((row) => row.price));
    return {
      id: product.id,
      sku: product.sku,
      name: product.name,
      stock: product.stock,
      daysOfCover: Number(plan.daysOfCover.toFixed(1)),
      forecast: Number(daily.toFixed(2)),
      lower: Number((hw.lower[0] ?? 0).toFixed(2)),
      upper: Number((hw.upper[0] ?? 0).toFixed(2)),
      reorderPoint: Number(plan.reorderPoint.toFixed(1)),
      mape: Number(hw.mape.toFixed(3)),
      price: product.price,
      cost: product.cost,
      competitorMin: Number.isFinite(competitorMin) ? competitorMin : null,
      elasticity: Number(fit.elasticity.toFixed(2)),
      r2: Number(fit.r2.toFixed(2)),
      leadTimeDays: product.leadTimeDays,
      spark: series.slice(-28).map((row) => row.units),
      hue: product.hue,
    };
  });
}

async function kpis() {
  const [sim] = await db().select().from(simState);
  const day = sim?.simDay ?? 0;
  const allOrders = await db().select().from(orders);
  const proposalRows = await db().select().from(proposals);
  const todayOrders = allOrders.filter((row) => row.simDay === day);
  const revenueToday = todayOrders.reduce((sum, row) => sum + row.total, 0);
  const decisions = proposalRows.filter((row) => row.simDay === day);
  const autoApproved = decisions.filter((row) => row.decidedBy === "policy" && ["confirmed", "submitted", "auto_approved", "executing"].includes(row.status)).length;
  const manualApproved = decisions.filter((row) => row.decidedBy === "owner").length;
  const pending = decisions.filter((row) => row.status === "pending_approval").length;
  const spend = decisions.filter((row) => ["payout", "refund"].includes(row.type) && ["confirmed", "submitted", "executing", "auto_approved"].includes(row.status)).reduce((sum, row) => sum + (row.amount ?? 0), 0);
  const policyRows = await db().select().from(policies);
  const budget = policyRows.reduce((sum, row) => sum + row.dailyBudget, 0);
  return {
    simDay: day,
    revenueToday: money(revenueToday),
    decisions: decisions.length,
    autoApproved,
    manualApproved,
    pending,
    spendToday: money(spend),
    budget,
    hoursSaved: Number((decisions.length * 0.15).toFixed(1)),
    summary: sim?.lastSummary ?? "",
    paused: sim?.pausedAll ?? false,
  };
}

function ruleGrid(query: string, simDay: number, current?: string) {
  const q = query.toLowerCase();
  const filterModel: Record<string, unknown> = {};
  if (q.includes("refund")) filterModel.type = { filterType: "text", type: "equals", filter: "refund" };
  const over = q.match(/over \$?(\d+(?:\.\d+)?)/);
  if (over) filterModel.amount = { filterType: "number", type: "greaterThan", filter: Number(over[1]) };
  if (q.includes("approved by me") || q.includes("i approved")) filterModel.decidedBy = { filterType: "text", type: "equals", filter: "owner" };
  if (q.includes("pending")) filterModel.status = { filterType: "text", type: "equals", filter: "pending_approval" };
  if (q.includes("today")) filterModel.simDay = { filterType: "number", type: "equals", filter: simDay };
  const rowGroupCols = q.includes("reason") ? ["reason"] : q.includes("agent") ? ["agent"] : [];
  const grid = q.includes("payout") ? "payouts" : q.includes("inventory") || q.includes("stock") ? "inventory" : q.includes("order") ? "orders" : q.includes("audit") ? "audit" : current || "decisions";
  return {
    grid,
    explanation: `Filtered ${grid}${over ? ` to amounts over $${over[1]}` : ""}${q.includes("refund") ? " to refunds" : ""}.`,
    simple: { filterModel, rowGroupCols },
    gridState: null,
    propertiesToIgnore: [],
  };
}
