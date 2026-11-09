# ShopCrew

AI agents run a one-person candle shop. They refund customers through the PayPal Agent Toolkit and pay suppliers through PayPal Payouts. Every decision lands in a live AG Grid control room, where the owner approves, edits, or rolls it back.

The shop in the demo is **Hearth & Wick**. The product is **ShopCrew**.

## Quick start

Node 22+.

```bash
npm install
copy .env.example .env
npm run dev
```

- Shop and API in dev: the web app is http://localhost:5173 and proxies `/api` to http://localhost:8787
- Production shape: `npm run build && npm start`, then open http://localhost:8787
- Default `LLM_PROVIDER=replay` needs no model key. Agents still decide from the forecast, the elasticity fit, and the complaint templates.
- With no PayPal keys, money actions are dry-run and labeled `DRY-`. Add sandbox keys when you want real captures, refunds, and payouts. See [docs/sandbox-setup.md](docs/sandbox-setup.md).

Reset the demo database:

```bash
npm run db:reset
```

The control room also has **Reset demo**. It expects header `x-admin-token` (`ADMIN_TOKEN` from `.env`, default locally `shopcrew-demo`). On Render the Blueprint generates a random token — copy it from the service Environment tab.

## Demo path

1. Open the shop, add a candle, check out. Without PayPal keys this writes a DRY order. With keys, the PayPal JS SDK v6 button captures a sandbox order.
2. Open the control room and click **Advance 1 day**.
3. Day 1 is scripted: an $8 auto refund, a $45 refund waiting for you, a price increase you can roll back, a 15% discount the orchestrator blocks because stock is thin, a supplier payout, and a payout to an email with no PayPal account so you can cancel it while it is `UNCLAIMED`.
4. Edit the $45 refund to $20 and approve it. The row goes executing → submitted → confirmed.
5. Ask the command bar: `show refunds over $20`.

Seed is `DEMO_SEED` (default 42). The same day produces the same proposals.

## Sandbox setup

Follow [docs/sandbox-setup.md](docs/sandbox-setup.md) to get PayPal sandbox credentials. The short version:

1. Create a US Business sandbox account ("ShopCrew Store") and two US Personal sandbox accounts ("Buyer Bob", "Acme Supplies").
2. At [developer.paypal.com](https://developer.paypal.com) create two apps both linked to ShopCrew Store: `shopcrew-dev` (sandbox) and `shopcrew-prod` (live, for later).
3. Copy Client ID and Secret of `shopcrew-dev` into `.env`:
   ```env
   PAYPAL_CLIENT_ID=...
   PAYPAL_CLIENT_SECRET=...
   PAYPAL_ENV=sandbox
   ```
4. Start the app, open the shop, add items, and check out with Buyer Bob's sandbox credentials.  
   Once you have two real captures you can link them to the refund seed by clicking **Link capture pool** in the Orders grid.
5. To receive webhook events locally, set `PUBLIC_BASE_URL` to your HTTPS tunnel (Ngrok, Cloudflare Tunnel, or similar), then run:
   ```bash
   node scripts/register-webhook.mjs
   ```
   The script registers `PUBLIC_BASE_URL/api/paypal/webhooks`. Copy the returned webhook ID into `.env`:
   ```env
   PAYPAL_WEBHOOK_ID=...
   ```
   Webhook events update submitted refunds to `confirmed` and submitted payouts to `UNCLAIMED`/`SUCCESS`.

## Deploy to Render

Use the complete [deployment and database guide](docs/deployment.md). The Blueprint now creates a paid, always-on web service with a 1 GB persistent disk and a separate Render Workflow service.

- PGlite: `/var/data/pglite`; mutable capture pool: `/var/data/capture-pool.json`.
- No expiring free Postgres or keep-warm workflow is needed. Leave `DATABASE_URL` unset.
- Review Render's displayed compute/disk/Workflow costs against your actual credits before creating resources.
- Configure sandbox PayPal credentials, hosted URL and webhook, supplier and buyer details, and optional model/licence keys as described in the guide.
- `POST /api/workflows/review` (admin token required) dispatches a Render operations review. It fans out inventory forecasts and spending analysis and saves a retry-safe report to the audit log. Payments still execute through the existing policy gate.
- `RENDER_API_KEY` is set only on the web service; the Blueprint wires the Workflow slug, callback URL, and callback token.
- Authenticated PGlite and capture-pool backup endpoints and a restore script are documented in the guide. Keep backups private.

[Render Blueprint](render.yaml) · [Full deployment guide](docs/deployment.md) · [Optional paid Postgres snippet](docs/render-postgres.yaml)

## Architecture

```
Browser (Vite React, AG Grid)
  → Fastify (API, SSE, agents, policy gate)
    → PGlite or Postgres
    → PayPal sandbox (Orders, refunds via Agent Toolkit, Payouts, webhooks)
```

A gated tool stores the proposal, runs the policy, and only then calls PayPal. The model never holds the payment credentials in the browser.

Details: [docs/architecture.md](docs/architecture.md).

## Policy

| Agent | Auto-approve | Daily budget |
| --- | --- | --- |
| Customer service | refund ≤ $15 and ≤ 50% of the order | $150 |
| Inventory | preferred supplier and ≤ $200 | $1,000 |
| Pricing | absolute change ≤ 5%, never over 20%, margin at least 25% | n/a |

Repeat refunders (more than 2 refunds in 30 days) always wait. The orchestrator blocks a discount when days of cover are below lead time + 2. **Pause all agents** is the kill switch.

Rollback: a price change restores the previous price. An `UNCLAIMED` payout can be cancelled. A refund cannot be reversed.

## Agents and models

- Customer service reads the complaint template and calls `create_refund` (Agent Toolkit, REST fallback `POST /v2/payments/captures/{id}/refund`).
- Inventory fits Holt-Winters (weekly seasonality, 14-day holdout) and orders at the reorder point. The supplier agent negotiates up to 3 rounds, then `pay_supplier` calls Payouts because the toolkit has no payout tool.
- Pricing fits a log-log elasticity regression. The simulator's true elasticity is stored so the fit can be compared.
- Orchestrator is deterministic rules plus a short daily summary.
- LLM narration uses Gemini, then Groq, when `LLM_PROVIDER` is not `replay`. Set `LLM_RECORD=1` to fill `fixtures/llm-replay.json`.

## AI tools used

- Google Gemini and Groq, through the Vercel AI SDK, for agent narration and the natural-language grid command. Replay mode runs without them.
- PayPal Agent Toolkit (`@paypal/agent-toolkit` 1.11.0, OpenAI export) for `create_refund` and `get_order` style calls.
- AG Grid AI Toolkit: `getStructuredSchema` and `setState` on the command bar, with a small rule parser when the model is offline.
- AG Studio on **Insights** (`/insights`): ShopCrew-themed dashboard with prebuilt Operations / Money / Inventory pages, multi-source data (decisions, orders, payouts, inventory, policies), edit mode, and layout saved in localStorage. Works without `AG_STUDIO_LICENSE_KEY` (watermark OK for the hackathon).
- Holt-Winters and ordinary-least-squares elasticity, in TypeScript, not an LLM.
- Cursor was used to write this repository.

## Honesty

180 days of sales history are simulated. Competitor prices are simulated. Complaint text is a fixed fixture. Insights also seeds ~30 days of earlier agent decisions (and a refund spike) flagged `simulated` so Day 0 widgets are never empty. Budget burn on Insights is per-agent, not the sum of all five budgets. Checkout, refunds, and payouts call the PayPal sandbox when credentials exist, and are labeled DRY when they do not. Webhook signature checks reject unverified events unless the event was produced by the dry-run path inside this process.

## Hackathon plan

The submission schedule, prize gaps, and work items live in [docs/master-plan.md](docs/master-plan.md). Feature freeze **Fri 6 Nov**; video **Mon 9 Nov**; submit **Tue 10 Nov** (deadline Thu 12 Nov 12:00 PST).

## Screenshots

Add Devpost / README images under `docs/screenshots/` (not committed yet):

- Control room — Decisions tab with pending refund and detail card
- Shop success — LIVE order with PayPal ids and confirmed badge
- Insights — Studio report with custom widget and anomaly banner

## Licence

MIT. See [LICENSE](LICENSE). AG Grid / AG Studio trial keys expire after about 45 days — ask Discord for a key valid through **15 Dec 2026** (see [docs/discord-questions.md](docs/discord-questions.md)).
