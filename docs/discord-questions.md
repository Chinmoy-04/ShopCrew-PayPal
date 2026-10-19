# Questions to post in the PayPal Discord

Discord: http://developer.paypal.com/discord

I already have the AG Studio webinar deck (Eddie + James) and the Render $50 credits claim link. Post only what those do not answer. Tag `@sylwiavargas` / `@jamesswintondev` for AG Grid, and the PayPal DevRel channel for the rest.

## AG Grid / AG Studio

We are building ShopCrew: AI agents run a small shop; the owner supervises in AG Grid (live decisions, master/detail, AI Toolkit NL bar) plus an AG Studio Insights report (theme, prebuilt report, Studio AI harness), as in the webinar and the [paypaldev/hackathon-paypal-ag-grid-boilerplate](https://github.com/paypaldev/hackathon-paypal-ag-grid-boilerplate).

1. Can hackathon participants get an **AG Grid Enterprise + AG Charts Enterprise + AG Studio Pro with AI** licence that stays valid through **15 Dec 2026** (judging ends then)? A normal 30-day trial started now would expire before judging.
2. Confirm Best Use of AG Grid expects **AG Studio** (custom widgets / theming / Studio Agent Framework), not AG Grid Enterprise alone — we want to aim at the right prize.

## PayPal

1. Are **Payouts** enabled for sandbox REST apps by default, or do we request them on the app?
2. For demo orders that agents later refund: is **server-side card capture** in sandbox (`Orders v2` `payment_source.card`) OK, or should every capture go through the **JS SDK v6** buyer login?
3. For agent refunds, prefer **`create_refund` in `@paypal/agent-toolkit` 1.11.0** (in-process) or the remote **MCP** server (`https://mcp.sandbox.paypal.com/http`)?
4. Are MCP commerce tools (`search_product`, `create_cart`, `checkout_cart` with `x-feature-flags: commerce:true`) available to participants?

## Render (already answered)

Claimed / claim at: https://credits.render.com/claim/paypal-ai-hackathon ($50). No need to ask about free-tier cold starts if these credits are active.

## What you still do by hand

This repo cannot create your PayPal developer account. Follow [sandbox-setup.md](sandbox-setup.md):

1. Create a developer account at https://developer.paypal.com
2. Create sandbox REST apps `shopcrew-dev` and `shopcrew-prod`
3. Enable Payouts and Transaction Search on both apps (confirm via Q1 above)
4. Create sandbox accounts: business "ShopCrew Store" (~$5,000 funded), personal "Buyer Bob", personal "Acme Supplies"; leave `UNCLAIMED_SUPPLIER_EMAIL` with no account
5. Paste client id and secret into `.env`
