export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS suppliers (
  id text PRIMARY KEY,
  name text NOT NULL,
  paypal_email text NOT NULL,
  preferred boolean NOT NULL,
  rating double precision NOT NULL
);
CREATE TABLE IF NOT EXISTS products (
  id text PRIMARY KEY,
  sku text NOT NULL UNIQUE,
  name text NOT NULL,
  cost double precision NOT NULL,
  price double precision NOT NULL,
  min_price double precision NOT NULL,
  max_price double precision NOT NULL,
  stock integer NOT NULL,
  lead_time_days integer NOT NULL,
  supplier_id text NOT NULL,
  true_elasticity double precision NOT NULL,
  base_demand double precision NOT NULL,
  hue text NOT NULL,
  blurb text NOT NULL
);
CREATE TABLE IF NOT EXISTS price_history (
  id text PRIMARY KEY,
  product_id text NOT NULL,
  price double precision NOT NULL,
  changed_by text NOT NULL,
  proposal_id text,
  sim_day integer NOT NULL,
  created_at text NOT NULL
);
CREATE TABLE IF NOT EXISTS competitor_prices (
  id text PRIMARY KEY,
  product_id text NOT NULL,
  competitor text NOT NULL,
  price double precision NOT NULL,
  sim_day integer NOT NULL
);
CREATE TABLE IF NOT EXISTS sales_daily (
  id text PRIMARY KEY,
  product_id text NOT NULL,
  sim_day integer NOT NULL,
  units integer NOT NULL,
  revenue double precision NOT NULL,
  price double precision NOT NULL
);
CREATE TABLE IF NOT EXISTS forecasts (
  id text PRIMARY KEY,
  product_id text NOT NULL,
  sim_day integer NOT NULL,
  horizon integer NOT NULL,
  yhat_json jsonb NOT NULL,
  lo_json jsonb NOT NULL,
  hi_json jsonb NOT NULL,
  mape double precision NOT NULL,
  params_json jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS customers (
  id text PRIMARY KEY,
  name text NOT NULL,
  email text NOT NULL,
  refunds_30d integer NOT NULL
);
CREATE TABLE IF NOT EXISTS orders (
  id text PRIMARY KEY,
  customer_id text NOT NULL,
  source text NOT NULL,
  paypal_order_id text,
  paypal_capture_id text,
  status text NOT NULL,
  total double precision NOT NULL,
  refunded_total double precision NOT NULL,
  currency text NOT NULL,
  sim_day integer NOT NULL,
  created_at text NOT NULL
);
CREATE TABLE IF NOT EXISTS order_items (
  id text PRIMARY KEY,
  order_id text NOT NULL,
  product_id text NOT NULL,
  qty integer NOT NULL,
  unit_price double precision NOT NULL
);
CREATE TABLE IF NOT EXISTS messages (
  id text PRIMARY KEY,
  customer_id text NOT NULL,
  order_id text,
  channel text NOT NULL,
  body text NOT NULL,
  category text NOT NULL,
  sentiment text NOT NULL,
  status text NOT NULL,
  sim_day integer NOT NULL,
  template_id text
);
CREATE TABLE IF NOT EXISTS purchase_orders (
  id text PRIMARY KEY,
  supplier_id text NOT NULL,
  product_id text NOT NULL,
  qty integer NOT NULL,
  unit_cost double precision NOT NULL,
  total double precision NOT NULL,
  status text NOT NULL,
  negotiation_json jsonb,
  proposal_id text
);
CREATE TABLE IF NOT EXISTS proposals (
  id text PRIMARY KEY,
  agent text NOT NULL,
  type text NOT NULL,
  target_ref text NOT NULL,
  tool_name text NOT NULL,
  tool_args_json jsonb NOT NULL,
  edited_args_json jsonb,
  reasoning text NOT NULL,
  summary text NOT NULL,
  reason text,
  inputs_json jsonb,
  trace_json jsonb,
  confidence_model double precision,
  confidence_llm double precision,
  risk_score double precision,
  amount double precision,
  status text NOT NULL,
  policy_result_json jsonb,
  conflict_with_id text,
  correlation_id text NOT NULL,
  created_at text NOT NULL,
  decided_by text,
  decided_at text,
  sim_day integer NOT NULL
);
CREATE TABLE IF NOT EXISTS actions (
  id text PRIMARY KEY,
  proposal_id text NOT NULL,
  kind text NOT NULL,
  idempotency_key text NOT NULL UNIQUE,
  request_json jsonb,
  response_json jsonb,
  paypal_ref text,
  status text NOT NULL,
  error text,
  attempts integer NOT NULL,
  started_at text NOT NULL,
  finished_at text
);
CREATE TABLE IF NOT EXISTS refunds (
  id text PRIMARY KEY,
  order_id text NOT NULL,
  proposal_id text NOT NULL,
  paypal_refund_id text,
  amount double precision NOT NULL,
  status text NOT NULL,
  created_at text NOT NULL,
  confirmed_at text
);
CREATE TABLE IF NOT EXISTS payouts (
  id text PRIMARY KEY,
  purchase_order_id text,
  proposal_id text NOT NULL,
  sender_batch_id text NOT NULL UNIQUE,
  payout_batch_id text,
  payout_item_id text,
  receiver text NOT NULL,
  amount double precision NOT NULL,
  status text NOT NULL,
  created_at text NOT NULL,
  confirmed_at text
);
CREATE TABLE IF NOT EXISTS webhook_events (
  id text PRIMARY KEY,
  paypal_event_id text NOT NULL UNIQUE,
  event_type text NOT NULL,
  resource_id text,
  verified boolean NOT NULL,
  payload_json jsonb NOT NULL,
  received_at text NOT NULL,
  processed_at text
);
CREATE TABLE IF NOT EXISTS audit_log (
  id text PRIMARY KEY,
  ts text NOT NULL,
  actor text NOT NULL,
  agent text,
  event text NOT NULL,
  proposal_id text,
  correlation_id text,
  before_json jsonb,
  after_json jsonb,
  message text NOT NULL
);
CREATE TABLE IF NOT EXISTS policies (
  agent text PRIMARY KEY,
  enabled boolean NOT NULL,
  auto_approve_max double precision NOT NULL,
  daily_budget double precision NOT NULL,
  max_pct_of_order double precision NOT NULL,
  max_price_change_pct double precision NOT NULL,
  min_margin_pct double precision NOT NULL,
  extra_json jsonb,
  updated_at text NOT NULL
);
CREATE TABLE IF NOT EXISTS sim_state (
  id integer PRIMARY KEY,
  seed integer NOT NULL,
  sim_day integer NOT NULL,
  scenario text NOT NULL,
  autorun boolean NOT NULL,
  paused_all boolean NOT NULL,
  last_summary text
);
CREATE TABLE IF NOT EXISTS llm_cache (
  hash text PRIMARY KEY,
  provider text NOT NULL,
  model text NOT NULL,
  request_json jsonb NOT NULL,
  response_json jsonb NOT NULL,
  created_at text NOT NULL
);
`;
