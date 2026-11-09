# Questions to post in the PayPal Discord

Discord: http://developer.paypal.com/discord

I already have the AG Studio webinar deck (Eddie + James) and the Render $50 credits claim link. Post only what those do not answer. Tag `@sylwiavargas` / `@jamesswintondev` for AG Grid, and the PayPal DevRel channel for the rest.

## AG Grid / AG Studio

**Posted 2026-10-26** (with PayPal block). Log answers when DevRel replies.

1. Can hackathon participants get an **AG Grid Enterprise + AG Charts Enterprise + AG Studio Pro with AI** licence that stays valid through **15 Dec 2026** (judging ends then)? A 45-day trial started now would lapse about **10 Dec**, before judging ends. Prefer a key **issued on or after 1 Nov**, or explicitly extended to 15 Dec.
2. Confirm Best Use of AG Grid expects **AG Studio** (custom widgets / theming / Studio Agent Framework), not AG Grid Enterprise alone. Does a **custom agent** plus a custom OpenAI adapter count as the Agent Framework entry? (Devpost says "AG Grid"; the AG Grid blog says "AG Studio".)

## PayPal — posted 2026-10-26

**Update:** Payouts are enabled on the sandbox app. Remaining truth-run steps: live checkout → toolkit refund → payout → UNCLAIMED + verified webhook.

Posted block (kept for reference):

```
ShopCrew (PayPal AI Hackathon) — sandbox questions:

1. Are Payouts enabled for sandbox REST apps by default, or do we request them on the app? Does a payout to an email with no PayPal account reliably stay UNCLAIMED?

2. For demo orders that agents later refund: is server-side card capture in sandbox (Orders v2 payment_source.card) OK, or should every capture go through the JS SDK v6 buyer login?

3. For agent refunds, prefer create_refund in @paypal/agent-toolkit 1.11.0 (in-process) or the remote MCP server (https://mcp.sandbox.paypal.com/http)? Does 1.11.0 expose tool schemas (getTools()) usable with the Vercel AI SDK?

4. Are MCP commerce tools (search_product, create_cart, checkout_cart with x-feature-flags: commerce:true) available to participants?

5. May sandbox buyer credentials appear in public testing instructions on Devpost? Are code or deploy changes allowed after the 12 Nov submission deadline?
```

## Log answers here

| # | Asked | Answer | Date |
| --- | --- | --- | --- |
| AG1 | posted | *(awaiting)* | 2026-10-26 |
| AG2 | posted | *(awaiting)* | 2026-10-26 |
| PP1 | posted | Payouts enabled on our sandbox app (manual confirm). UNCLAIMED behaviour TBD. | 2026-10-26 |
| PP2 | posted | *(awaiting)* | 2026-10-26 |
| PP3 | posted | *(awaiting)* | 2026-10-26 |
| PP4 | posted | *(awaiting)* | 2026-10-26 |
| PP5 | posted | *(awaiting)* | 2026-10-26 |

## Render (already answered)

Claimed / claim at: https://credits.render.com/claim/paypal-ai-hackathon ($50). No need to ask about free-tier cold starts if these credits are active.

## Local webhook status (2026-10-26)

- Tunnel: `PUBLIC_BASE_URL` set to Cloudflare quick tunnel
- `PAYPAL_WEBHOOK_ID=86241279C0704433Y` registered for `/api/paypal/webhooks`
- Payouts: **enabled** on the sandbox app
- Complete the sandbox truth run: live checkout → refund → payout → UNCLAIMED; auto-register fills `fixtures/capture-pool.json` (or set `CAPTURE_POOL_JSON` for Render)

## What you still do by hand

This repo cannot create your PayPal developer account. Follow [sandbox-setup.md](sandbox-setup.md):

1. Create a developer account at https://developer.paypal.com
2. Create sandbox REST apps `shopcrew-dev` and `shopcrew-prod`
3. Enable Payouts and Transaction Search on both apps (confirm via Q1 above)
4. Create sandbox accounts: business "ShopCrew Store" (~$5,000 funded), personal "Buyer Bob", personal "Acme Supplies"; leave `UNCLAIMED_SUPPLIER_EMAIL` with no account
5. Paste client id and secret into `.env`
6. Paste the PayPal questions above into Discord and log answers in the table
