# Devpost draft

## Text description

ShopCrew is the back office for a one-person online shop. Three agents do the daily work: pricing watches demand and competitors, inventory forecasts with Holt-Winters and pays suppliers, and customer service refunds captured PayPal orders. A policy engine (limits, daily budgets, a kill switch) decides what they may do alone. Everything else waits in an AG Grid control room where the owner can edit the amount, approve, reject, or roll back.

PayPal is the money path, not a badge. Checkout uses Orders v2 and JavaScript SDK v6. Refunds are `create_refund` on the PayPal Agent Toolkit 1.11.0, with a REST fallback. Supplier payments use the Payouts API because the toolkit does not expose payouts. Webhooks are signature-checked and drive the grid from submitted to confirmed.

**AG Studio / Insights:** ShopCrew-themed dashboard with custom widgets, multi-source data, and the **Studio Agent Framework** — a custom agent roster (`shopcrew-lead`, refund-sentinel, cash-planner, reorder-risk) with telemetry into the audit log. OpenAI runs only through the server-side Studio harness (`AG_STUDIO_OPENAI_API_KEY`), not in the browser.

What is simulated: 180 days of sales, competitor prices, and the complaint inbox. What is sandbox-real when credentials are set: checkout capture, refunds, and payouts.

**Render Workflows (verify hosted run before submitting):** the operations review dispatches inventory forecasting and spending analysis in parallel, combines their results, and saves a retry-safe briefing to the audit log. The Workflow uses snapshot data and an authenticated callback; PayPal execution remains in the policy-gated web server. These report tasks use statistical/rule analysis, not an LLM.

## AI tools

- **Google Gemini** and **Groq** via the Vercel AI SDK — agent narration, natural-language grid commands, CS tool choice. Replay mode needs no key.
- **OpenAI** (allowed models only) through the AG Studio AI harness proxy for Edit-mode dashboard building.
- **PayPal Agent Toolkit 1.11.0** — `create_refund`, order context.
- **AG Grid AI Toolkit** — `getStructuredSchema`, `setState` on the command bar.
- **AG Studio Agent Framework** — custom agents, observers, ShopCrew widgets.
- Holt-Winters and log-log elasticity (TypeScript, not LLM).
- **Cursor** — implementation.

## Categories

- Overall
- Best Use of PayPal + AI
- Best Use of Agentic Commerce
- Best Use of AG Grid
- Render
- Best Demo Delivery
- Most Impactful

## Testing instructions (fill before submit)

1. **Hosted demo:** `https://YOUR_SERVICE.onrender.com` (warm with `node scripts/warmup.mjs` if cold).
2. **Repo:** https://github.com/Chinmoy-04/ShopCrew-PayPal (MIT licence in About).
3. **Sandbox buyer:** log in at checkout as `[DEMO_BUYER_EMAIL]` — password: `[paste from Render env / your sandbox notes]`. Use Sandbox only.
4. **Path:** Shop → add candle → PayPal checkout → Control room → Advance day → edit $45 refund to $20 → approve → Insights → Studio AI prompt from anomaly banner.
5. **Reset:** Control room **Reset** (admin token from Render `ADMIN_TOKEN`, or public reset if `DEMO_PUBLIC_RESET=1`).

## Honesty

Sales history, competitor prices, and complaint text are simulated fixtures. Checkout, refunds, and payouts call PayPal sandbox when keys are configured; otherwise actions are labeled DRY. Webhook signature verification rejects unverified events. The paid Render Blueprint stores PGlite and the mutable capture pool on a persistent disk. Demo reset deliberately reseeds application data but does not restore refunded PayPal balances.

## Checklist

- [ ] Public GitHub repo, MIT licence visible in About
- [ ] Render URL is warm (`/healthz`, `dryRun: false` with keys)
- [ ] Sandbox buyer login in testing instructions above
- [ ] YouTube video, public, ≤ 3:00, captions, no copyrighted music
- [ ] Screenshots: control room, PayPal confirmation, Insights Studio
- [ ] Categories selected (list above)
- [ ] Submit by **Tue 10 Nov 2026** (deadline Thu 12 Nov 12:00 PST)

## Prize map

- Technological implementation: toolkit refunds behind a real gate, payouts, verified webhooks, idempotency, Studio Agent Framework, AG Grid AI Toolkit.
- Design: shop, control room, Insights theme, landing page.
- Impact: solo sellers, money moved only inside limits.
- Innovation: agents propose, policy decides, PayPal executes, human supervises in the grid.
- Presentation: scripted seed-42 day, live sandbox confirmations when keys are present.
