# Deploy ShopCrew on Render

Updated 9 November 2026. This guide matches the paid-disk Blueprint in `render.yaml`.
Nothing is deployed by editing this file. Render billing starts when you create the services.

## 1. Understand the deployment

The Blueprint creates two resources in Oregon:

- `shopcrew`: one paid Node web service, 1 CPU / 2 GB, serving React, Fastify, agents, SSE and PayPal endpoints. The original 512 MB deployment exceeded its memory limit during startup.
- `shopcrew-operations`: an on-demand Render Workflow with three registered tasks. Its parent task fans out inventory and spending analysis, combines results, and posts a report back to the app.

The web service has a 1 GB persistent disk at `/var/data`. The database is `/var/data/pglite`; the refundable capture ledger is `/var/data/capture-pool.json`.
Workflows receive a snapshot over the Render SDK and use an authenticated callback. They never open PGlite or move money.
No separate static site, Redis, cron, worker, or Postgres database is required for this setup.

## 2. Credits and cost

1. Open the correct Render workspace and its Billing page. Confirm credits are applied, their expiry, and any payment-method requirement.
2. Inspect the Blueprint's service price before approving creation. Credit balance, service compute, disk, workflow runs, build usage and bandwidth must all be considered. No fixed dollar estimate is assumed here.
3. This YAML uses `1c-2g` because the 512 MB instance ran out of memory during startup. Review the increased monthly estimate before syncing. After deployment, monitor memory during startup, Insights loading, and Advance day. Watch the projected total through 15 December.
4. Keep GitHub's `KEEPWARM` variable unset or false. An always-on paid service does not need that workflow.
5. Render credits do not fund Gemini, Groq, or OpenAI calls. Configure those providers' budgets separately.

Official references: [compute plans](https://render.com/docs/compute-plans), [Workflows](https://render.com/docs/workflows), [disks](https://render.com/docs/disks).

## 3. Prepare PayPal and AI credentials

1. At https://developer.paypal.com, create or select your sandbox Business account and sandbox application. Use its sandbox Client ID and Secret.
2. Create a sandbox Personal buyer and a supplier account. Record their sandbox login details privately. Keep the business sandbox balance sufficient for payouts and confirm Payouts is enabled for the app/account.
3. Use a different email without a sandbox account for the unclaimed payout demonstration.
4. Never use production PayPal credentials for this shared demo. Set `PAYPAL_ENV=sandbox`.
5. For first boot, keep `LLM_PROVIDER=replay`. For the final live AI demo choose ONE:
   - Gemini: `LLM_PROVIDER=gemini`, `LLM_MODEL=gemini-2.5-flash`, `GOOGLE_GENERATIVE_AI_API_KEY` from your Google account (confirm model access there).
   - Groq: `LLM_PROVIDER=groq`, `LLM_MODEL=llama-3.3-70b-versatile`, `GROQ_API_KEY` (confirm current model access).
6. The current fallback uses the same `LLM_MODEL` for both providers. Do not assume Gemini-to-Groq fallback works with a Gemini model name. Leave `LLM_FALLBACK_PROVIDER` empty if using one provider. Replay/rule fallbacks keep the app usable but do not prove a live model call succeeded.
7. If you want Insights' AI assistant, set `AG_STUDIO_OPENAI_API_KEY` separately. Without it, Insights still works. The Blueprint lowers the proxy's estimated daily cap to 50,000 and per-minute limit to 5. This is approximate accounting, not a hard provider billing cap.
8. Obtain AG Grid and AG Studio licence keys valid through judging, or verify the watermarked experience is acceptable for your submission.

## 4. Prepare and push code

In PowerShell at `D:\PayPal`:

```powershell
npm ci
npm run typecheck
npm test
npm run build
git status --short
git diff --check
git diff
```

Review ALL modified and untracked files. Many predate the deployment work. Include the complete implementation in your commit; omit `.env`, credentials, runtime databases and backups. `.env` is ignored. Review capture fixtures for sandbox IDs and accidental private data before publishing.

After reviewing and staging the intended files in your Git client, commit and push them to the branch Render will deploy. Confirm the files exist on GitHub. Do not deploy an old `main` that lacks the new modules.

## 5. Create the Blueprint

1. In Render choose **New > Blueprint**.
2. Connect `https://github.com/Chinmoy-04/ShopCrew-PayPal` and the branch containing this work.
3. Use the root `render.yaml`; do not set an `apps/server` root directory.
4. Review both resources, region, paid compute and disk before creating them.
5. Supply the prompted values. For optional unused keys, leave them unset/empty if allowed; otherwise remove the unused `sync: false` entries before syncing. Do not put placeholder API keys in the environment.
6. Deploy. The web build is `npm ci && npm run build`; start is `npm run start`; health path is `/healthz`.
7. The workflow build is `npm ci && npm run build -w @shopcrew/server`; start is `node apps/server/dist/workflows/index.js`. It has no HTTP health endpoint.
8. If updating an EXISTING Blueprint, manually add new secrets in the service Environment panel: Render ignores new `sync: false` values on subsequent syncs.

The Blueprint shares only the callback token automatically. After creation, copy the Workflow slug (from its Render page) into the web service's `RENDER_WORKFLOW_SLUG`, and set the Workflow's `SHOPCREW_BASE_URL` to the web service's public HTTPS URL. Leave these two fields empty during initial creation if the form permits it; they are not needed for the website to boot. This avoids circular service references. If a placeholder is required, replace it with the actual value before dispatching any Workflow runs. Do not deploy a second copy of an already created service.

## 6. Set environment variables

On the **web service**:

- `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`: sandbox app credentials.
- `PAYPAL_ENV=sandbox` (Blueprint).
- `PUBLIC_BASE_URL`: actual `https://…onrender.com` URL, with no extra path. Set after Render assigns it.
- `PAYPAL_WEBHOOK_ID`: set in step 7; old localhost/tunnel webhook IDs are not the hosted registration.
- `SUPPLIER_EMAILS`: sandbox supplier email; currently only the first comma-separated address is used.
- `UNCLAIMED_SUPPLIER_EMAIL`: email without a sandbox account.
- `DEMO_BUYER_EMAIL`: sandbox buyer login email; this value is public.
- `DEMO_BUYER_HINT`: instructions for obtaining the sandbox password from the submission testing instructions.
- `ADMIN_TOKEN`: generated. Copy it privately from Environment for resets, backups and Workflow dispatch. Do not publish it or use the local default.
- `PGLITE_DIR=/var/data/pglite`, `CAPTURE_POOL_PATH=/var/data/capture-pool.json` (Blueprint).
- Leave `DATABASE_URL` unset. Do not enter a blank-looking placeholder URL.
- Leave `CAPTURE_POOL_JSON` unset for a fresh hosted demo. It is an optional one-time bootstrap only when the mutable file does not exist.
- `DEMO_PUBLIC_RESET=0` (Blueprint). To give judges reset access without sharing the admin token, deliberately change to `1`; this resets shared state and has a per-IP cooldown.
- Optional provider and licence keys from step 3.
- `RENDER_API_KEY`: generate a Render API key in your account settings. Store only on the web service; it authorizes paid Workflow dispatch. Use the least access Render offers and revoke after judging.
- `RENDER_WORKFLOW_SLUG`: copy the actual Workflow slug from its Render page after creation (the part before `/operationsReview`).
- `WORKFLOW_CALLBACK_TOKEN`: generated; automatically shared with the Workflow.

On the **Workflow service**, verify `SHOPCREW_BASE_URL` is the web service's HTTPS URL and `WORKFLOW_CALLBACK_TOKEN` matches the web service. Do not add PayPal, database, or model credentials there. Task compute uses Render's default Flex plan; each child has a 120-second timeout, the parent 300 seconds, and up to two retries. Usage is billed per run.

Save environment changes and wait for the resulting deployment. Supplier emails are seeded into the database: changing them AFTER initial seeding requires a controlled demo reset before the next demo.

## 7. Register the hosted webhook

1. Open the web service's Render **Shell**, at the repository root.
2. Confirm `PUBLIC_BASE_URL` is the hosted URL and sandbox credentials are configured.
3. Run:

```bash
node scripts/register-webhook.mjs
```

4. Save the returned webhook ID as web-service `PAYPAL_WEBHOOK_ID`. Wait for restart.
5. In PayPal's developer dashboard verify the URL is `https://YOUR_SERVICE.onrender.com/api/paypal/webhooks`, for the same sandbox app as the keys. The script subscribes to checkout/capture/refund/payout events. Inspect its output for errors; it is not an idempotent upsert, so do not repeatedly register duplicates.
6. If running locally instead, use `node --env-file=.env scripts/register-webhook.mjs` and set the hosted URL explicitly. Plain `node scripts/register-webhook.mjs` does not load `.env`.

## 8. Verify the actual demo

1. Open `/healthz`: expect `ok:true`, `db:"pglite"`, `dryRun:false`. The last flag only means both keys are present, not that PayPal accepted them.
2. Open `/`, `/shop`, `/control`, `/insights` and verify browser console/network errors. Deep links must render after refresh.
3. Check out with your sandbox buyer. Confirm PayPal order and capture IDs, then wait for webhook confirmation. Verify delivery in PayPal's webhook dashboard; polling reconciliation alone does not prove webhook delivery.
4. Create TWO sufficiently funded captures (at least $45 for the large slot and $36 for the small slot; preferably much larger for repeated demos). Qualifying captures populate the hosted pool automatically. Capture amount must cover the planned cumulative refunds, not just one run.
5. Reset the demo using the generated admin token. This seeds the two demonstration orders from the hosted capture pool.
6. Advance one day. Verify the automatic refund, edit the pending refund to $20 and approve, inspect PayPal IDs, test the supplier payout, cancel an unclaimed payout if PayPal reports that state, roll back a price change, and test Pause.
7. Repeat after reset. PayPal money is sandbox money but refund limits remain real within that sandbox. Reset does not replenish a capture; use fresh checkouts when exhausted. Inspect LIVE/DRY labels; exhaustion can deliberately fall back to DRY.
8. Restart/redeploy the service. Confirm stock, proposals, audit and the pool remain. Browser-local Insights layouts/grid preferences live in localStorage and are not in the server database.
9. Test on a phone. Monitor Render memory; increase compute if necessary and update YAML so the next sync preserves that choice.

## 9. Run and demonstrate Render Workflows

In local PowerShell (do not commit the token):

```powershell
$demoBase = 'https://YOUR_SERVICE.onrender.com'
$adminSecret = Read-Host 'Render ADMIN_TOKEN' -MaskInput
$adminHeaders = @{ 'x-admin-token' = $adminSecret }
Invoke-RestMethod -Method Post -Uri "$demoBase/api/workflows/review" -Headers $adminHeaders -ContentType 'application/json' -Body '{}'
```

1. The response is HTTP 202 with a request ID and Render task run ID. It means accepted, not completed.
2. Open **shopcrew-operations > Runs** in Render. Inspect `operationsReview` and its parallel `inventoryReview` / `spendingReview` children.
3. Wait for success. The parent returns a combined report and posts it to ShopCrew with a separate callback token.
4. Open the control room's Audit grid: look for `workflow.operations_review` from `render-workflows`. You can also open `/api/workflows/reports` for the latest 20 reports.
5. The report includes the snapshot's day/time, Holt-Winters forecast, stock-cover risk, budget pressure and pending approvals. It may be stale relative to later user actions; it is advisory, never approval to move money.
6. Duplicate callbacks for a request are stored once. A failed task can retry analysis and callback without paying suppliers or refunding customers again. The same root request ID is used as the Render dispatch idempotency key.
7. Dispatch is admin-only and limited to 3/minute. No automatic schedule is enabled. Child tasks require input and are not intended to be manually launched with `[]`.

Sponsor demo wording: "Render hosts our storefront and control room. Render Workflows fans out demand-risk and spending reviews, then writes an auditable operations briefing back to ShopCrew. The existing policy gate controls payment execution." Do not claim the payment agents have been moved to Workflows or that these report tasks use an LLM. Demonstrate live LLM functionality separately.

## 10. Database details and choices

### What exists today

PGlite is PostgreSQL compiled to run embedded in the Node process. Drizzle uses the same PostgreSQL-style schema for PGlite and network Postgres. This is not SQLite or an external database server.

The database stores catalog/stock, customers/orders/items, checkout drafts, simulated sales, competitor prices, forecasts, policies, proposals, execution actions/idempotency keys, refunds, payouts, webhook receipts, audit records, simulation state and Studio AI telemetry.

The separate capture-pool JSON file maps seed orders to actual sandbox capture IDs and keeps cumulative refunded amounts across demo resets. It is not a database backup or a source of fresh funds. This implementation now reads the mutable file before environment bootstrap data and replaces it through a temporary file. Invalid existing JSON fails closed rather than silently discarding refund history.

### Why the paid disk is enough for this demo

- Both mutable stores are under `/var/data`, so restarts/redeploys keep them. The source tree and build outputs remain ephemeral.
- One web instance owns PGlite. A separate process must not open the same data directory. Workflows use snapshots/callbacks instead.
- No 30-day database expiration exists for this paid-disk design. Billing/credit exhaustion and resource deletion still affect availability.
- Disk-backed Render services cannot scale horizontally and have brief downtime during deploys. The disk is not accessible from builds, pre-deploy commands, one-off jobs, or Workflow instances.
- This is a demo storage design, not a production multi-tenant commerce platform. Process-local event delivery, locks, rate counters and estimated AI budgets also assume one instance.

### What reset does

Reset truncates the application tables, including audit, actions, webhook receipts, checkout drafts and Studio telemetry, then reseeds. It preserves the external capture-pool file. It does not undo PayPal refunds, payouts, or external webhook deliveries. Pause activity and wait for in-flight actions/workflows to finish before resetting. A completed Workflow callback after reset can append an old snapshot report.

### What happens if DATABASE_URL is set

The server selects network Postgres instead of PGlite, creates/updates tables using its startup SQL, and seeds an empty product catalog. Setting the URL does NOT migrate PGlite's data. If the URL is broken/expired, startup fails; there is no automatic failover. Unsetting it returns to the separate PGlite directory, potentially old state. Do not switch drivers casually during judging.

Free Render Postgres expires after 30 days and has no backups. The earlier plan to create one on 15–16 November is no longer recommended; there is no reason to introduce that dependency after the submission deadline. See [Render free database limitations](https://render.com/docs/free#free-postgres).

Paid managed Postgres becomes useful when multiple processes need direct DB access, you need managed database recovery, or you grow beyond this demo. It is a separate paid resource. Even then this project's JSON capture ledger, SSE bus and process-local locks still need attention before multiple web instances are safe.

### If you intentionally choose paid managed Postgres

1. Create a paid Render Postgres instance in the same workspace/region; review cost first. `docs/render-postgres.yaml` is now a paid example, not part of the default Blueprint.
2. Back up the existing database and capture pool; pause agents and wait for in-flight work.
3. Decide whether to migrate data or start a fresh demo. No automated PGlite-to-Postgres migration is included. A PGlite data-directory archive is not a `pg_restore` archive; export/import logically with compatible PostgreSQL tooling and verify every table if preserving history.
4. Set web `DATABASE_URL` to Render's internal connection string and redeploy. Do not expose that string to the frontend or commit it.
5. Check `/healthz` says `postgres`. Keep the disk/capture-pool configuration until that ledger is moved into Postgres as well.
6. Verify checkout, refunds, payouts and webhook deduplication again. Preserve the old data until verification is complete.

## 11. Back up and recover

Pause agents, stop other demo users, and wait for money actions and Workflows to settle before taking these two separate backups. They are not a transactionally paired snapshot.

From the same local PowerShell session as step 9:

```powershell
Invoke-WebRequest -Uri "$demoBase/api/admin/backup/database" -Headers $adminHeaders -OutFile .\shopcrew-pglite.tar.gz
Invoke-WebRequest -Uri "$demoBase/api/admin/backup/capture-pool" -Headers $adminHeaders -OutFile .\shopcrew-capture-pool.json
```

Keep them privately outside the repository. The database endpoint uses PGlite's `dumpDataDir('gzip')`; it does not copy files from an open database. If using Postgres, it returns 409: use `pg_dump` instead. Render cautions against relying on raw disk snapshot restore for custom database recovery.

Verify a PGlite backup by restoring it into a NEW local directory:

```powershell
node scripts/restore-pglite.mjs .\shopcrew-pglite.tar.gz .\.data\restore-check
```

The script refuses an existing destination. To recover hosting, upload the archive privately using Render SSH/SCP, pause the demo, restore to a new disk directory with this script, then set `PGLITE_DIR` to that new directory and restart. Restore/check the matching capture ledger separately. Never run a second PGlite process against the active data directory. Verify actual remaining refund amounts against PayPal before resuming: database restoration cannot reverse external transactions and an old ledger can understate refunds.

Backups are not automatic/offsite in this implementation. Do not commit backup archives or your copied ledger. A persistent disk prevents routine redeploy data loss, not operator mistakes or external payment mismatches.

## 12. Submission and freeze

Official deadline: **12 November 2026, 21:00 Budapest** (12:00 PST). Judging is **1–15 December**. Keep access and funding available through judging; retain the submitted commit and avoid feature changes after the deadline without organizer guidance.

1. Add the hosted URL, repo URL, sandbox buyer login, honest simulation details, and a public YouTube video under 3 minutes to Devpost.
2. Capture screenshots of checkout confirmation, the decision control room, Insights, and the Render task run tree/audit report.
3. Include live model configuration in your testing path; a successful replay demo alone does not establish a live AI integration.
4. Verify all instructions logged out and rehearse twice after reset. Check the public repository displays its MIT licence.
5. Update `docs/devpost.md` and the README with the actual URL. Select only sponsor categories whose current requirements your submission satisfies.
6. Keep credentials, credit balance, licence expiration and model budgets available through 15 December.

Sources: [official rules](https://paypalaihackathon.devpost.com/rules), [Render sponsor page](https://paypalaihackathon.devpost.com/details/render), [task definitions](https://render.com/docs/workflows-defining-tasks), [triggering runs](https://render.com/docs/workflows-running), [Blueprint reference](https://render.com/docs/blueprint-spec), [persistent disks](https://render.com/docs/disks).
