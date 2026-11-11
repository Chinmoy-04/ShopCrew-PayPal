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

## Automated functional baseline

```bash
npx playwright install --with-deps chromium firefox webkit
npm run build
npm run test:e2e
```

The suite launches its own isolated DRY server and runs Chromium, Firefox and WebKit at desktop and phone widths. Do not configure a hosted target for destructive tests. Reports are written to `playwright-report/` and failure traces/screenshots to `test-results/`.

See [functional verification](functional-verification.md) for covered cases, defects, current results and outstanding acceptance work. This suite does not yet certify every control or real PayPal/AI integrations.

## Video & Devpost

- [ ] `docs/video-script.md` rehearsed twice on the hosted URL
- [ ] YouTube upload public, under 3:00, captions on
- [ ] `docs/devpost.md` checklist complete; testing instructions include buyer login + URL + repo
- [ ] Three screenshots: control room, PayPal confirmation, Insights

## Console

- [ ] No red errors on `/`, `/shop`, `/control`, `/insights` after warm load
