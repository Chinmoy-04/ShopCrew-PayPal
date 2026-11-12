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

The shop runs at [http://localhost:5173](http://localhost:5173); the API runs at [http://localhost:8787](http://localhost:8787). With the default replay model and no PayPal credentials, the app runs in DRY mode, so payment actions are simulated and labeled as such. To try real sandbox checkout, refunds, and payouts, configure PayPal sandbox credentials as described in [Sandbox setup](docs/sandbox-setup.md). Never use live PayPal credentials for the demo.

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

For implementation details, see [Architecture](docs/architecture.md), [Sandbox setup](docs/sandbox-setup.md), and [Deployment](docs/deployment.md).

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
