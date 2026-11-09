# QA checklist (submission freeze)

Target **Devpost submit: Tue 10 Nov 2026** (deadline Thu 12 Nov 2026, 12:00 PST). Do not submit from this doc — use the Devpost form when ready.

## Clean clone

- [ ] `npm ci`
- [ ] `npm run typecheck`
- [ ] `npm test`
- [ ] `npm run build`
- [ ] `npm start` — open `/`, `/shop`, `/control`, `/insights`

## Hosted demo (Render)

- [ ] `node scripts/warmup.mjs https://YOUR_SERVICE.onrender.com`
- [ ] `/healthz` → `{ ok: true, dryRun: false }` with sandbox keys set
- [ ] Reset demo twice; run **Advance day** twice — same seed-42 Day 1 shape
- [ ] One sandbox checkout → order **confirmed** via webhook (label cut in video if slow)
- [ ] Seventh **Advance** within one minute → 429 with readable message

## Browser smoke (optional)

If Playwright is installed:

```bash
npx playwright install chromium
PLAYWRIGHT_BASE_URL=https://YOUR_SERVICE.onrender.com npm run test:e2e
```

Without Playwright, walk the four routes manually at 1440×900 and save screenshots for Devpost.

## Video & Devpost

- [ ] `docs/video-script.md` rehearsed twice on the hosted URL
- [ ] YouTube upload public, under 3:00, captions on
- [ ] `docs/devpost.md` checklist complete; testing instructions include buyer login + URL + repo
- [ ] Three screenshots: control room, PayPal confirmation, Insights

## Console

- [ ] No red errors on `/`, `/shop`, `/control`, `/insights` after warm load
