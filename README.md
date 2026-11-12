# ShopCrew

ShopCrew is a small-shop back office built around a simple idea: let agents handle routine work, but make money decisions easy for the owner to see and control.

The demo shop is **Hearth & Wick**, a one-person candle business. ShopCrew watches stock and pricing, handles customer-service proposals, and routes payments through PayPal. The owner reviews anything outside the policy limits in an AG Grid control room, where each action has a reason, a status, and an audit trail.

## Try it locally

You’ll need Node.js 22 or newer.

```bash
npm ci
```

Copy `.env.example` to `.env`, then start the app:

```bash
npm run dev
```

The shop runs at [http://localhost:5173](http://localhost:5173); the API runs at [http://localhost:8787](http://localhost:8787). With the default replay model and no PayPal credentials, the app runs in DRY mode, so payment actions are simulated and labeled as such. To try real sandbox checkout, refunds, and payouts, follow the PayPal setup below. Never use live PayPal credentials for the demo.

To run the production build locally:

```bash
npm run build
npm start
```

The app then serves at [http://localhost:8787](http://localhost:8787). The demo database can be reset with `npm run db:reset`. Locally, the **Reset demo** control uses `ADMIN_TOKEN` (default: `shopcrew-demo`).

## The demo path

1. Add a candle to the cart and check out with a PayPal sandbox buyer.
2. Open the control room and advance the simulation by one day.
3. Review the day's proposals: a small automatic refund, a larger refund for approval, a price change, a stock-sensitive discount that policy blocks, and supplier payouts.
4. Edit the pending refund amount, approve it, and follow its PayPal status in the decisions grid.
5. Review the payout result and the audit trail, then explore the Insights dashboard and natural-language grid command.

Refunds and payouts have both been exercised successfully against PayPal Sandbox. The exact status and timing shown in the app depend on PayPal's sandbox response and webhook delivery; the demo does not present a request as settled before PayPal confirms it.

## What’s real and what’s simulated

Checkout, refunds, and supplier payouts use PayPal Sandbox when sandbox credentials are configured. Without them, the same flows run in DRY mode. The webhook endpoint verifies PayPal signatures before applying provider events.

The sales history, competitor prices, and complaint inbox are demo data. ShopCrew's forecasts, pricing analysis, policy checks, and audit trail operate on that data. Demo reset restores the app's seeded state; it does not reverse transactions in PayPal Sandbox.

## How it works

```text
React shop and AG Grid control room
              ↓
Fastify API, agents, policy checks, audit log
       ↙             ↓              ↘
    PGlite       PayPal Sandbox      AI tools
```

Agents propose actions. The server checks each proposal against policy before calling PayPal. Payment credentials stay on the server; they are never sent to the browser.

The app uses the PayPal Orders API and JavaScript SDK for checkout, the PayPal Agent Toolkit for refunds, and PayPal Payouts for supplier payments. AG Grid powers the decision workspace and natural-language grid commands. AG Studio provides the Insights dashboard and custom agent experience. Gemini and Groq can power agent narration and grid commands; replay mode keeps the app usable without an AI key. The AG Studio assistant uses its own server-side OpenAI configuration.

## PayPal Sandbox setup

1. In the [PayPal Developer Dashboard](https://developer.paypal.com/dashboard/), create a US Business sandbox account for the shop and US Personal sandbox accounts for a buyer and supplier.
2. Create a Sandbox REST app attached to the Business account and enable Payouts if that option is available. Keep `PAYPAL_ENV=sandbox`.
3. Copy the app's Client ID and Secret into `.env`:

   ```env
   PAYPAL_CLIENT_ID=your-sandbox-client-id
   PAYPAL_CLIENT_SECRET=your-sandbox-secret
   PAYPAL_ENV=sandbox
   ```

4. Set the buyer email in `DEMO_BUYER_EMAIL` and the supplier address in `SUPPLIER_EMAILS`. Keep sandbox passwords and API secrets private; do not commit them.
5. For webhook updates, set `PUBLIC_BASE_URL` to the app's public HTTPS URL, then run `node scripts/register-webhook.mjs`. Save the returned ID as `PAYPAL_WEBHOOK_ID` and restart the app.

Use the buyer's sandbox login in PayPal checkout. Refunds need an eligible sandbox capture. Payouts go to the configured sandbox supplier. A separate email with no sandbox account can be used to demonstrate an unclaimed payout, if that flow is enabled for the account.

## Deploy to Render

The root [Render Blueprint](render.yaml) defines the web app, persistent disk, and on-demand operations Workflow. In Render, create a Blueprint from this public GitHub repository, review the displayed service and storage costs, and supply the requested environment values. The web service needs PayPal Sandbox credentials and webhook settings for real payment flows. Optional model keys enable Gemini, Groq, or the separate AG Studio assistant; the default replay mode works without them.

After Render assigns the web URL, set `PUBLIC_BASE_URL`, register the PayPal webhook from the service shell with `node scripts/register-webhook.mjs`, then save the returned ID as `PAYPAL_WEBHOOK_ID`. Set the Workflow's `SHOPCREW_BASE_URL` to the web URL and the web service's `RENDER_WORKFLOW_SLUG` to the Workflow slug. Never put credentials, admin tokens, runtime databases, or capture backups in GitHub.

For local reference, the app is a React/Vite frontend with AG Grid, a Fastify API, PGlite storage, server-side policy checks, and PayPal Sandbox integrations. The Render disk stores PGlite and the mutable capture pool; demo reset reseeds application data but does not reverse PayPal transactions.

## Tests

```bash
npm run typecheck
npm test
npm run build
npm run test:e2e
```

The end-to-end suite starts an isolated DRY server and covers Chromium, Firefox, and WebKit at desktop and phone sizes. It does not make real PayPal transactions.

## AI and development tools

- **Gemini and Groq**, through the Vercel AI SDK, for agent narration and natural-language grid commands.
- **OpenAI**, through the server-side AG Studio assistant harness.
- **PayPal Agent Toolkit**, for refund and order-context tools.
- **AG Grid AI Toolkit** and **AG Studio Agent Framework**, for grid commands and custom dashboard agents.
- **Cursor**, for development.

Forecasting (Holt-Winters) and price elasticity (log-log regression) are implemented in TypeScript; they are not presented as LLM output.

## License

ShopCrew is released under the [MIT License](LICENSE).
