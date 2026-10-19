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

The control room also has **Reset demo**. It expects header `x-admin-token` (`ADMIN_TOKEN`, default `shopcrew-demo`).

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
5. To receive webhook events locally, run:
   ```bash
   node scripts/register-webhook.mjs https://YOUR_TUNNEL_URL/api/webhooks/paypal
   ```
   (Ngrok, Cloudflare Tunnel, or any HTTPS tunnel works.) Copy the returned webhook ID into `.env`:
   ```env
   PAYPAL_WEBHOOK_ID=...
   ```
   Webhook events update submitted refunds to `confirmed` and submitted payouts to `UNCLAIMED`/`SUCCESS`.

## Deploy to Render

Free web service only. Do **not** create the free Postgres database until 15 or 16 Nov 2026. It expires 30 days after creation, and judging runs 1–15 Dec. Until then the app uses embedded PGlite and reseeds when the database is empty. The filesystem is ephemeral, so a free service that spins down comes back empty and seeds again. That is acceptable for the demo.

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/YOUR_GITHUB/shopcrew)

Blueprint: [render.yaml](render.yaml). Health check: `/healthz`. Before recording or judging, run `node scripts/warmup.mjs https://your-service.onrender.com` because a free service can take about a minute to wake. The keep-warm workflow is off until you set repository variables `KEEPWARM=true` and `DEMO_URL`. Turn it on only for recording days and 1–15 Dec so you stay inside 750 free hours.

Postgres snippet for mid-November: [docs/render-postgres.yaml](docs/render-postgres.yaml). If that database expires, unset `DATABASE_URL` and the app falls back to PGlite.

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

180 days of sales history are simulated. Competitor prices are simulated. Complaint text is a fixed fixture. Checkout, refunds, and payouts call the PayPal sandbox when credentials exist, and are labeled DRY when they do not. Webhook signature checks reject unverified events unless the event was produced by the dry-run path inside this process.

## Licence

MIT. See [LICENSE](LICENSE).
