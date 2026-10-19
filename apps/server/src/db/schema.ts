import { boolean, doublePrecision, integer, jsonb, pgTable, text } from "drizzle-orm/pg-core";

export const suppliers = pgTable("suppliers", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  paypalEmail: text("paypal_email").notNull(),
  preferred: boolean("preferred").notNull(),
  rating: doublePrecision("rating").notNull(),
});

export const products = pgTable("products", {
  id: text("id").primaryKey(),
  sku: text("sku").notNull().unique(),
  name: text("name").notNull(),
  cost: doublePrecision("cost").notNull(),
  price: doublePrecision("price").notNull(),
  minPrice: doublePrecision("min_price").notNull(),
  maxPrice: doublePrecision("max_price").notNull(),
  stock: integer("stock").notNull(),
  leadTimeDays: integer("lead_time_days").notNull(),
  supplierId: text("supplier_id").notNull(),
  trueElasticity: doublePrecision("true_elasticity").notNull(),
  baseDemand: doublePrecision("base_demand").notNull(),
  hue: text("hue").notNull(),
  blurb: text("blurb").notNull(),
});

export const priceHistory = pgTable("price_history", {
  id: text("id").primaryKey(),
  productId: text("product_id").notNull(),
  price: doublePrecision("price").notNull(),
  changedBy: text("changed_by").notNull(),
  proposalId: text("proposal_id"),
  simDay: integer("sim_day").notNull(),
  createdAt: text("created_at").notNull(),
});

export const competitorPrices = pgTable("competitor_prices", {
  id: text("id").primaryKey(),
  productId: text("product_id").notNull(),
  competitor: text("competitor").notNull(),
  price: doublePrecision("price").notNull(),
  simDay: integer("sim_day").notNull(),
});

export const salesDaily = pgTable("sales_daily", {
  id: text("id").primaryKey(),
  productId: text("product_id").notNull(),
  simDay: integer("sim_day").notNull(),
  units: integer("units").notNull(),
  revenue: doublePrecision("revenue").notNull(),
  price: doublePrecision("price").notNull(),
});

export const forecasts = pgTable("forecasts", {
  id: text("id").primaryKey(),
  productId: text("product_id").notNull(),
  simDay: integer("sim_day").notNull(),
  horizon: integer("horizon").notNull(),
  yhatJson: jsonb("yhat_json").notNull(),
  loJson: jsonb("lo_json").notNull(),
  hiJson: jsonb("hi_json").notNull(),
  mape: doublePrecision("mape").notNull(),
  paramsJson: jsonb("params_json").notNull(),
});

export const customers = pgTable("customers", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  refunds30d: integer("refunds_30d").notNull(),
});

export const orders = pgTable("orders", {
  id: text("id").primaryKey(),
  customerId: text("customer_id").notNull(),
  source: text("source").notNull(),
  paypalOrderId: text("paypal_order_id"),
  paypalCaptureId: text("paypal_capture_id"),
  status: text("status").notNull(),
  total: doublePrecision("total").notNull(),
  refundedTotal: doublePrecision("refunded_total").notNull(),
  currency: text("currency").notNull(),
  simDay: integer("sim_day").notNull(),
  createdAt: text("created_at").notNull(),
});

export const orderItems = pgTable("order_items", {
  id: text("id").primaryKey(),
  orderId: text("order_id").notNull(),
  productId: text("product_id").notNull(),
  qty: integer("qty").notNull(),
  unitPrice: doublePrecision("unit_price").notNull(),
});

export const messages = pgTable("messages", {
  id: text("id").primaryKey(),
  customerId: text("customer_id").notNull(),
  orderId: text("order_id"),
  channel: text("channel").notNull(),
  body: text("body").notNull(),
  category: text("category").notNull(),
  sentiment: text("sentiment").notNull(),
  status: text("status").notNull(),
  simDay: integer("sim_day").notNull(),
  templateId: text("template_id"),
});

export const purchaseOrders = pgTable("purchase_orders", {
  id: text("id").primaryKey(),
  supplierId: text("supplier_id").notNull(),
  productId: text("product_id").notNull(),
  qty: integer("qty").notNull(),
  unitCost: doublePrecision("unit_cost").notNull(),
  total: doublePrecision("total").notNull(),
  status: text("status").notNull(),
  negotiationJson: jsonb("negotiation_json"),
  proposalId: text("proposal_id"),
});

export const proposals = pgTable("proposals", {
  id: text("id").primaryKey(),
  agent: text("agent").notNull(),
  type: text("type").notNull(),
  targetRef: text("target_ref").notNull(),
  toolName: text("tool_name").notNull(),
  toolArgsJson: jsonb("tool_args_json").notNull(),
  editedArgsJson: jsonb("edited_args_json"),
  reasoning: text("reasoning").notNull(),
  summary: text("summary").notNull(),
  reason: text("reason"),
  inputsJson: jsonb("inputs_json"),
  traceJson: jsonb("trace_json"),
  confidenceModel: doublePrecision("confidence_model"),
  confidenceLlm: doublePrecision("confidence_llm"),
  riskScore: doublePrecision("risk_score"),
  amount: doublePrecision("amount"),
  status: text("status").notNull(),
  policyResultJson: jsonb("policy_result_json"),
  conflictWithId: text("conflict_with_id"),
  correlationId: text("correlation_id").notNull(),
  createdAt: text("created_at").notNull(),
  decidedBy: text("decided_by"),
  decidedAt: text("decided_at"),
  simDay: integer("sim_day").notNull(),
});

export const actions = pgTable("actions", {
  id: text("id").primaryKey(),
  proposalId: text("proposal_id").notNull(),
  kind: text("kind").notNull(),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  requestJson: jsonb("request_json"),
  responseJson: jsonb("response_json"),
  paypalRef: text("paypal_ref"),
  status: text("status").notNull(),
  error: text("error"),
  attempts: integer("attempts").notNull(),
  startedAt: text("started_at").notNull(),
  finishedAt: text("finished_at"),
});

export const refunds = pgTable("refunds", {
  id: text("id").primaryKey(),
  orderId: text("order_id").notNull(),
  proposalId: text("proposal_id").notNull(),
  paypalRefundId: text("paypal_refund_id"),
  amount: doublePrecision("amount").notNull(),
  status: text("status").notNull(),
  createdAt: text("created_at").notNull(),
  confirmedAt: text("confirmed_at"),
});

export const payouts = pgTable("payouts", {
  id: text("id").primaryKey(),
  purchaseOrderId: text("purchase_order_id"),
  proposalId: text("proposal_id").notNull(),
  senderBatchId: text("sender_batch_id").notNull().unique(),
  payoutBatchId: text("payout_batch_id"),
  payoutItemId: text("payout_item_id"),
  receiver: text("receiver").notNull(),
  amount: doublePrecision("amount").notNull(),
  status: text("status").notNull(),
  createdAt: text("created_at").notNull(),
  confirmedAt: text("confirmed_at"),
});

export const webhookEvents = pgTable("webhook_events", {
  id: text("id").primaryKey(),
  paypalEventId: text("paypal_event_id").notNull().unique(),
  eventType: text("event_type").notNull(),
  resourceId: text("resource_id"),
  verified: boolean("verified").notNull(),
  payloadJson: jsonb("payload_json").notNull(),
  receivedAt: text("received_at").notNull(),
  processedAt: text("processed_at"),
});

export const auditLog = pgTable("audit_log", {
  id: text("id").primaryKey(),
  ts: text("ts").notNull(),
  actor: text("actor").notNull(),
  agent: text("agent"),
  event: text("event").notNull(),
  proposalId: text("proposal_id"),
  correlationId: text("correlation_id"),
  beforeJson: jsonb("before_json"),
  afterJson: jsonb("after_json"),
  message: text("message").notNull(),
});

export const policies = pgTable("policies", {
  agent: text("agent").primaryKey(),
  enabled: boolean("enabled").notNull(),
  autoApproveMax: doublePrecision("auto_approve_max").notNull(),
  dailyBudget: doublePrecision("daily_budget").notNull(),
  maxPctOfOrder: doublePrecision("max_pct_of_order").notNull(),
  maxPriceChangePct: doublePrecision("max_price_change_pct").notNull(),
  minMarginPct: doublePrecision("min_margin_pct").notNull(),
  extraJson: jsonb("extra_json"),
  updatedAt: text("updated_at").notNull(),
});

export const simState = pgTable("sim_state", {
  id: integer("id").primaryKey(),
  seed: integer("seed").notNull(),
  simDay: integer("sim_day").notNull(),
  scenario: text("scenario").notNull(),
  autorun: boolean("autorun").notNull(),
  pausedAll: boolean("paused_all").notNull(),
  lastSummary: text("last_summary"),
});

export const llmCache = pgTable("llm_cache", {
  hash: text("hash").primaryKey(),
  provider: text("provider").notNull(),
  model: text("model").notNull(),
  requestJson: jsonb("request_json").notNull(),
  responseJson: jsonb("response_json").notNull(),
  createdAt: text("created_at").notNull(),
});
