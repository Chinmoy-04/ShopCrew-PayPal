# Paper Ledger UI upgrade

Implemented the approved Paper Ledger direction across marketing, Control Room,
Insights, and the Hearth & Wick shopping flow. Business interfaces and existing
request handlers remain in place. The original browser tests were not edited.

## Implementation

- `apps/web/src/styles/paper-ledger.css` contains the scoped visual layer; the
  existing stylesheet and its previous functional corrections are preserved.
- Marketing uses the five implemented agent roles, the original KPI sources,
  existing CTA destinations, and an accessible context-to-execution sequence.
- Kokonut UI Widget Grid was installed through its official shadcn registry,
  then adapted to a static marketing variant. Its item/title/icon/span/render
  composition and MIT attribution are retained; demo data, drag, and resize are
  excluded. Registry configuration is local to the web workspace.
- Lenis mounts on `/`, `/shop`, and product pages. It is destroyed on other
  routes and when reduced motion is requested. Touch scrolling remains native.
  Browsing history positions are restored. Two marketing sections have short,
  one-time reveals; initial content and purchase controls remain visible.
- Control Room retains the seven grids, original actions and grid state. Pending
  refunds have a persistent, associated irreversibility warning. Expanded Inbox
  refunds carry the same warning. Applied command chips occupy their own row so
  they cannot intercept Undo.
- Inbox expanded rows scroll normally instead of sticking over their approval
  controls. Multiline grid cells use text line spacing independent of row height.
- Decisions and supervision-summary load failures now have visible retry actions.
  Page-unload guards prevent late load results from updating a departed screen;
  request endpoints, calculations, and business action handlers are unchanged.
- Insights retains report IDs, mappings, calculations, layouts, storage keys,
  event refresh, and the existing Studio AI integration. Only presentation and
  save-feedback semantics change.
- Product imagery uses a frontend SKU mapping. Unknown products or failed images
  retain the original hue swatch. Prices, stock, descriptions, cart handlers,
  PayPal SDK behavior, and checkout states remain API/application-owned.

Installed skills used: impeccable, ui-ux-pro-max, imagegen, lenis, kokonutui, and
shadcn. Source inspection and official documentation were sufficient; Reverse
Engineer Anything was not required. The design detector returned no findings.

## Image assets and prompts

Generated with the built-in image-generation tool. Final project assets are in
`apps/web/public/images/hearth-wick/`: six product images plus one lifestyle
image, each with a 480px variant. All fourteen WebP files total 738,976 bytes.
Full-resolution generation masters and the review contact sheet are retained
locally in `.data/ui-upgrade/`.

Shared product prompt (substitute the SKU and scent props below):

> Use case: product-mockup. Generate a square premium editorial ecommerce
> photograph for Hearth & Wick candle [SKU]. A single simple cylindrical ivory
> ceramic candle vessel, unlit single wick, small blank forest green rectangular
> label with NO TEXT, sits centered occupying 58% of the frame on warm cream
> limestone. Warm natural daylight from upper left, soft shadow to right, front
> view slightly looking down into wax, 85mm lens. Minimal scent props: [SCENT],
> placed subtly along bottom edge. Consistent cream and forest green palette,
> tactile realistic ceramic and wax. Clean catalog composition, no typography,
> no collage, no extra vessels. Save output for this asset.

- CEDAR: cedar wood and a thin thread of smoke.
- LINEN: washed linen and sea salt.
- FIG: green fig leaves.
- NIGHT: night jasmine and orange peel.
- HONEY: honey and dried tobacco leaf.
- CITRUS: bitter oranges and green citrus leaves.

Lifestyle prompt:

> Use case: photorealistic-natural. Wide horizontal 3:2 editorial lifestyle
> photograph for Hearth & Wick, independent candle shop. One ivory ceramic
> candle with blank forest-green label and lit single wick, resting on warm
> limestone beside folded washed linen, a cedar sprig and small fig branch.
> Warm afternoon sunlight through a window, subtle shadows. Candle on right
> third, calm cream negative space on left for HTML website heading. Natural,
> tactile, warm cream and muted forest palette. No writing, no logos, no collage.

Images illustrate the demo catalog and make no ingredient or manufacturing
claims. Names remain HTML text rather than generated labels.

## Verification and evidence

Final gate: **PASS**. Typecheck and production build pass. Backend tests pass
**64/64** across 17 files. The integrated browser matrix passes **336/336**:
all 51 original cases plus five new UI cases, in Chromium, Firefox, and WebKit
at desktop and mobile sizes. There are zero failed, skipped, flaky, or retried
executions. The compact machine-readable summary is `ui-upgrade-results.json`.

Local evidence lives in `.data/ui-upgrade/`, separately from the established
baseline and its three stability runs:

- `before/` and `after/`: desktop/mobile route screenshots, plus refund details.
- `final-typecheck.log`, `final-build.log`, `backend-tests.log`.
- `focused-results.json`: the toolbar correction and four new presentation
  regressions across all six browser/viewport projects, 30/30 passing.
- `final2-results.json`, `final2-report/`, and `final2-artifacts/`: final integrated gate.
- `preservation-check.json`: 79,304 protected files matched their starting
  SHA-256 hashes; zero changed, missing, or added files.
- `handler-comparison.json`: original JSX event callbacks match the starting
  source for shopping, Control Room, Insights, and decision actions/details.
  The two new retry controls are additional handlers.

Intermediate runs are retained. The first restricted browser launch could not
reach its isolated servers. Early overlapping runs shared artifact directories
and encountered missing trace files; rebuilds also interrupted asset loading.
The command regression additionally found a genuine chip/Undo overlap, fixed in
CSS. The first integrated run found an Inbox sticky-row obstruction and a
Decisions load rejection during reload. Both received UI corrections, with
dedicated repetition and failure/retry coverage. The new mobile warning test uses the existing grid-scroll helper before
asserting on the virtualized Actions column. No original business assertion was
removed or weakened. Final runs use dedicated output directories and a stable
build.

The Inbox sticky-row correction passed 17 executed checks in its separate
three-repetition matrix; the remaining attempt stopped before the test body
because its isolated server was assigned port 6666. A direct local check
confirmed the fetch runtime rejects that port as `bad port`. The subsequent
complete integrated run passed without retries. The harness and its exception
gate were not weakened.

Backend tests created four new timestamped test databases. Cleanup verified that
every file in those directories was absent from the starting snapshot, checked
their resolved workspace paths and absence of redirects, and removed only those
four directories. The final protected-tree comparison has zero additions as well
as zero changed or missing files. Cleanup evidence is `unit-temp-cleanup.json`.

Screenshots (local evidence):

- Marketing: [before](../.data/ui-upgrade/before/chromium-desktop-marketing.png), [after](../.data/ui-upgrade/after/chromium-desktop-marketing.png).
- Storefront: [before](../.data/ui-upgrade/before/chromium-desktop-shop.png), [after](../.data/ui-upgrade/after/chromium-desktop-shop.png).
- Control Room: [before](../.data/ui-upgrade/before/chromium-desktop-control.png), [after](../.data/ui-upgrade/after/chromium-desktop-control.png).
- Insights: [before](../.data/ui-upgrade/before/chromium-desktop-insights.png), [after](../.data/ui-upgrade/after/chromium-desktop-insights.png).
- Mobile: [storefront](../.data/ui-upgrade/after/chromium-mobile-shop.png), [refund warning](../.data/ui-upgrade/after/chromium-mobile-refund-detail.png).

Reproduce after a build using PowerShell:

```powershell
npm run typecheck
npm run build
npm test
$env:QA_OUTPUT_DIR = '.data/ui-upgrade/recheck-artifacts'
$env:PLAYWRIGHT_HTML_OUTPUT_DIR = '.data/ui-upgrade/recheck-report'
$env:QA_RESULT_FILE = '.data/ui-upgrade/recheck-results.json'
npm run test:e2e
```

The browser harness creates and owns new DRY databases and capture files. It
does not use or reset existing sandbox records. These checks do not certify real
payment settlement, live Studio providers, or every vendor-generated menu.
