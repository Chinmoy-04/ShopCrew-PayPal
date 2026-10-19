# Devpost draft

## Text description

ShopCrew is the back office for a one-person online shop. Three agents do the daily work: pricing watches demand and competitors, inventory forecasts with Holt-Winters and pays suppliers, and customer service refunds captured PayPal orders. A policy engine (limits, daily budgets, a kill switch) decides what they may do alone. Everything else waits in an AG Grid control room where the owner can edit the amount, approve, reject, or roll back.

PayPal is the money path, not a badge. Checkout uses Orders v2 and JavaScript SDK v6. Refunds are `create_refund` on the PayPal Agent Toolkit, with a REST fallback. Supplier payments use the Payouts API because the toolkit does not expose payouts. Webhooks are signature-checked and drive the grid from submitted to confirmed.

What is simulated: 180 days of sales, competitor prices, and the complaint inbox. What is sandbox-real when credentials are set: checkout capture, refunds, and payouts.

## AI tools

- Gemini and Groq via the Vercel AI SDK, for narration and the natural-language grid command. Replay mode needs no key.
- PayPal Agent Toolkit 1.11.0.
- AG Grid AI Toolkit (`getStructuredSchema`, `setState`) and AG Studio when a licence key is configured.
- Holt-Winters and a log-log elasticity regression.
- Cursor, for implementation.

## Checklist

- [ ] Public GitHub repo, MIT licence visible in About
- [ ] Render URL is warm (`/healthz`)
- [ ] README has the sandbox buyer login once you create it
- [ ] YouTube video, public, under 3:00, no copyrighted music
- [ ] Screenshots
- [ ] Categories: PayPal + AI, Agentic Commerce, AG Grid, Render, Demo Delivery, Most Impactful
- [ ] Submit by 11 Nov. Deadline is 12 Nov 2026, 12:00 PST

## Prize map

- Technological implementation: toolkit refunds behind a real gate, payouts, verified webhooks, idempotency, two statistical models, AG Grid AI Toolkit.
- Design: shop, control room, policies, audit, landing page.
- Impact: solo sellers, money moved only inside limits.
- Innovation: agents propose, policy decides, PayPal executes, a person supervises in the grid. The supplier negotiation settles through Payouts.
- Presentation: scripted seed-42 day, real sandbox confirmations when keys are present.
