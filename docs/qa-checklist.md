# Submission checklist

This checklist reflects the current Devpost requirements. The deadline is **November 12, 2026 at 12:00 PM Pacific (9:00 PM Budapest)**.

## Repository and local demo

- [ ] Confirm a fresh clone installs with `npm ci`.
- [ ] Run `npm run typecheck`, `npm test`, and `npm run build`.
- [ ] Run `npm start` and open `/`, `/shop`, `/control`, and `/insights`.
- [ ] Confirm `.env`, sandbox passwords, payment IDs, database files, and test artifacts are not part of the public commit.
- [ ] Keep `LICENSE` visible in the GitHub About section.

## Hosted demo

- [ ] Add the current Render URL to `docs/devpost.md` and the Devpost form.
- [ ] Warm the app with `node scripts/warmup.mjs <public-demo-url>` and confirm `/healthz` is healthy.
- [ ] Confirm the app uses PayPal Sandbox credentials and that the public reset works as documented.
- [ ] Verify one checkout, one refund, and one supplier payout on the final hosted build; keep the provider-confirmed result visible.
- [ ] Confirm the demo remains free and available during the judging period through December 15, 2026.

## Browser coverage

The Playwright suite runs against its own isolated DRY server. It covers Chromium, Firefox, and WebKit at desktop and phone sizes; it does not exercise real PayPal transactions.

```bash
npx playwright install --with-deps chromium firefox webkit
npm run test:e2e
```

Do not point the destructive test suite at the hosted service.

## Devpost packet

- [ ] Paste the project description and tools list from `docs/devpost.md`.
- [ ] Describe the significant work completed during the hackathon period.
- [ ] Add the current public demo URL or confirm the repository run instructions are complete.
- [ ] Add sandbox buyer testing instructions in Devpost; do not commit passwords or API keys.
- [ ] Upload a public YouTube video under three minutes, showing the project working. Add captions and use only material you have permission to include.
- [ ] Add current screenshots for the control room, PayPal order confirmation, and Insights dashboard.
- [ ] Select only categories available in the form and supported by the final project.
- [ ] Submit before the deadline and confirm Devpost shows the entry as submitted rather than draft.
