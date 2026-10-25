# Prompt for Claude — ShopCrew master implementation plan

Copy everything below the line into a new Claude chat (prefer Claude with web browsing / project context). Attach or open this repo (`ShopCrew-PayPal`) so Claude can inspect the code. Ask Claude to **only produce a detailed plan** (no code yet) unless you later switch it to implement.

---

## Role

You are a senior full-stack architect and hackathon strategist. Your job is to produce a **single, exhaustive implementation plan** for ShopCrew that maximizes scores for the PayPal AI Hackathon 2026 — especially **Best Use of AG Grid / AG Studio**, **Best Use of PayPal + AI**, **Agentic Commerce**, **Render**, and the overall grand-prize criteria.

**Do not write application code in this turn.** Output a phased, prioritized plan with concrete file paths, API contracts, acceptance criteria, and demo-script beats. UI visual polish is **deferred** until functionality is complete — note visual polish as a later phase only.

---

## Mandatory research (do this first)

1. Re-read the live hackathon pages and extract judging criteria, required submission artifacts, deadlines, and prize-specific expectations. Cite URLs:
   - https://paypalaihackathon.devpost.com/
   - https://paypalaihackathon.devpost.com/rules
   - https://paypalaihackathon.devpost.com/details/aggrid
   - https://www.ag-grid.com/blog/hackathon-paypal-and-ag-studio/
   - AG Studio docs (custom widgets, theming, Studio Agent Framework / AI harness): https://www.ag-grid.com/studio/
   - Boilerplate: https://github.com/paypaldev/hackathon-paypal-ag-grid-boilerplate
2. Diff those expectations against **this repo’s current state** (read the codebase thoroughly).
3. Produce a **gap matrix**: Requirement → Current status (done / partial / missing) → Proposed work → Prize impact.

Key AG Grid prize signal (must drive the plan): judges want **polish beyond plain AG Grid/Charts** — custom widgets, theming, layout tools, and **Studio Agent Framework** (custom agent talking to Studio’s built-in agents, or a swapped-in harness). Not “just a grid with charts.”

---

## Product context (what ShopCrew already is)

- **Repo:** https://github.com/Chinmoy-04/ShopCrew-PayPal  
- **Local path:** monorepo `apps/web` (Vite React + AG Grid Enterprise + AG Studio) + `apps/server` (Fastify + PGlite/Postgres + agents + PayPal).
- **Demo shop brand:** Hearth & Wick (candles). **Product brand:** ShopCrew.
- **Story:** AI agents (pricing, inventory, CS) propose work → **policy gate** (limits, budgets, kill switch) → PayPal executes (Orders v2 / JS SDK v6 checkout, Agent Toolkit refunds, Payouts API) → owner supervises in AG Grid control room (approve / edit / reject / roll back) + AG Studio Insights.
- **Simulated:** 180 days sales, competitors, complaint inbox. **Sandbox-real when keyed:** checkout capture, refunds, payouts, signature-checked webhooks.
- **Existing docs to read:** `README.md`, `docs/devpost.md`, `docs/architecture.md`, `docs/sandbox-setup.md`, `docs/video-script.md`, `docs/discord-questions.md`.

### Known current surface (verify in code; correct if stale)

| Area | Rough state |
|------|-------------|
| Shop / cart / checkout | Basic product list, cart, PayPal JS SDK v6 or DRY checkout |
| Control room | Tabs: decisions, inbox, orders, inventory, payouts, policies, audit; CommandBar NL; charts on some grids; negotiation / AskAgent |
| Insights | AG Studio report (multi-page), theme, custom widgets (`pulse-meter`, `status-stack`), AI harness via OpenAI Responses proxy when `AG_STUDIO_OPENAI_API_KEY` set |
| Landing | Minimal marketing page (visual polish deferred) |
| Deploy | `render.yaml`, keep-warm workflow, PGlite default |

---

## Planning goals (functionality-first)

### A. Shop & checkout (functional completeness)

Plan improvements that make the money path **demo-proof and judge-clear**, not pretty CSS:

- Product detail, stock/price reflecting agent pricing, clear DRY vs live PayPal states.
- Cart → checkout → success with order id, capture status, link into control room / orders grid.
- Capture-pool linking for refund seeds; error/empty states; sandbox buyer instructions surfaced in-app or README.
- Any missing PayPal edge cases (UNCLAIMED payouts, webhook confirmation path) that the video must show.

### B. Control room layout & grids (AG Grid depth)

Plan a **functional layout/info architecture** pass (structure, density, defaults, workflows) before visual chrome:

- Tab IA, default filters (e.g. pending approvals), master/detail, status bars, integrated charts, named views, cell renderers for risk/confidence/money.
- CommandBar / AG Grid AI Toolkit: schema-aware NL that reliably drives grid state; presets that auto-submit.
- Negotiation timeline, AskAgent, policy toggles, rollback — wire any incomplete paths.
- Make the “agents propose → you decide → PayPal confirms” loop obvious in one screenful of interaction.

### C. Insights — **heavy AG Studio implementation (highest priority for AG prize)**

Treat this as the **flagship** of the plan. Go far beyond the current report:

1. **Studio Agent Framework (must-have for prize narrative)**
   - Custom agent(s) that collaborate with Studio’s built-in agents (lead / data / page / planning / widget), **or** a clearly documented swapped harness.
   - Prompt starters tied to ShopCrew domain (refund spikes, reorder risk, budget burn, payout status).
   - Server proxy hardening (model allowlist, streaming, errors); document env keys; optional persistence/history.
   - Telemetry / observers if useful for demo (“agent built this widget”).

2. **Custom React widgets (expand aggressively)**
   - Beyond pulse-meter / status-stack: propose 4–8 domain widgets (e.g. refund anomaly strip, payout pipeline, agent spend vs budget, inventory cover heat, negotiation scoreboard, live decision ticker).
   - Each: `createWidgets` registration, dataMapping, form, `formatShape` + `ai` metadata so Studio AI can configure them, placement in default report, menu group.
   - Cross-filtering where it strengthens the story.

3. **Theming, layout, multi-page report**
   - Cohesive ShopCrew theme; multiple pages (Operations / Money / Inventory / maybe Live Agents).
   - Default report that looks “designed” via Studio layout tools (judges notice this), even if marketing UI is later.
   - Edit vs view mode; save/reset layout; seed data so empty charts never appear in demo.

4. **Data engine / sources**
   - Expand `/api/insights` (and Studio sources) so agents and widgets have rich, truthful fields: decisions, orders, payouts, inventory, policies, snapshot KPIs, maybe SSE-driven refresh.
   - Align field names/descriptions for AI tools (`viewSchema`, `executeQuery`, `addWidget`, etc.).

5. **Map plan items to official AG Studio project ideas** where they fit ShopCrew (anomaly-alert agent auto-building widgets; NL finance agent generating widgets; storefront analytics; scoreboard-style widgets) — adapt, don’t cargo-cult Friends/Office themes.

### D. PayPal + AI / agentic commerce depth

- Ensure toolkit refunds, REST fallback, Payouts, webhooks, idempotency, policy gate are first-class in the plan and demo script.
- Strengthen agent reasoning visibility (why proposed, why blocked).
- Identify any missing Agent Toolkit / MCP / commerce features worth adding before deadline (only if high prize ROI).

### E. Render / hosting / submission

- Deploy checklist, healthz, warmup, env vars, MIT license in About, README run instructions **or** hosted demo.
- Video script beats under 3:00 showing **working** flows (no mock-only).
- Devpost categories and copy updates based on gap matrix.

### F. Explicitly later: visual UI polish

- Landing, shop aesthetics, typography motion, etc. — **Phase last**. Mention briefly; do not expand into a design system redesign in the functional phases.

---

## Required plan output format

Deliver the plan as:

1. **Executive summary** (½ page): prize strategy and north-star demo narrative.
2. **Hackathon gap matrix** (table) from live pages vs repo.
3. **Phased roadmap** (ordered; each phase shippable):
   - Phase 0: audit / fix blockers
   - Phase 1: PayPal money path + shop/checkout functional completeness
   - Phase 2: Control room functional IA + AG Grid depth
   - Phase 3: **AG Studio heavy lift** (agents, widgets, theme, data, report)
   - Phase 4: Deploy / video / Devpost
   - Phase 5: Visual polish (deferred)
4. For **every work item**:
   - Goal & prize rationale
   - Files/modules likely touched
   - Dependencies / env vars
   - Acceptance criteria (testable)
   - Demo-script moment (what the video shows)
   - Effort (S/M/L) and risk
5. **AG Studio deep-dive appendix**: architecture diagram (mermaid) for Studio AI + custom widgets + data flow; list of proposed custom widgets with data mappings; agent roster design.
6. **Kill list**: what *not* to build before Nov 12 (distractions prizes, low ROI).
7. **Open questions** for Discord / PayPal / AG Grid (reuse/extend `docs/discord-questions.md`).

---

## Constraints

- Prefer extending existing patterns over rewrites.
- Never commit secrets (`.env` is gitignored).
- Watermarked AG Studio without licence is OK for hackathon unless a longer trial is obtained.
- Node 22+, workspaces, existing Fastify/React stack.
- Functionality and AG Studio depth beat visual redesign until Phase 5.

---

## Success definition for your plan

A teammate (or Cursor agent) should be able to execute the plan **top-to-bottom** without inventing scope, ending with: (1) a bulletproof sandbox money demo, (2) an AG Studio Insights experience that clearly uses **custom widgets + theme + Studio Agent Framework**, (3) a control room that tells the supervision story, (4) Render + Devpost + &lt;3 min video checklist — with UI cosmetics still intentionally last.

Start by browsing the hackathon URLs and reading this repository, then produce the plan.
