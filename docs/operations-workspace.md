# Operations workspace

Control Room and Insights use a separate application shell inspired by the supplied
Stitch export for project `7370842352231287034`, screen
`11cdf19be59f4fd780899198bc568c57`. The export and its two downloaded image
references are retained locally in `.data/stitch/`. The generated emblem and
profile image are reference material; the implementation uses the existing
ShopCrew identity and Lucide icons.

The layout retains the storefront's cream, forest green, and existing fonts.
The seven control sections, pending badges, Insights link, and store shortcuts
sit in the sidebar. Existing simulation controls render there through React
portals, preserving their provider, API calls, and event handlers. The workspace
uses the full viewport height. Home, shop, cart, and checkout keep the browsing
shell and stylesheet behavior.

Below 701px, navigation becomes a compact icon rail. Its expand control reveals
labels and simulation controls. Escape closes it and restores focus. Section
tabs support Arrow Up/Down, Home, and End. Existing query parameters and grid
state remain in use. Insights retains report editing and persistence, with its
filter panel initially collapsed on phones and technical setup notes available
under Report details.

## Validation

- Web TypeScript check and full production build passed.
- Impeccable's mechanical detector returned no findings.
- 24/24 layout and navigation checks passed across Chromium, Firefox, and WebKit,
  at 1440px and 390px. Checks cover every section, deep links, keyboard navigation,
  simulation actions, mobile Escape recovery, and return to the storefront.
- 17/17 existing desktop Control Room regression tests passed, including command
  filters and Undo, cross-section commands, review focus, charts, exports, edits,
  approval propagation, live refresh, and saved Insights layouts.
- Desktop and mobile screenshots were reviewed in two bounded inspection rounds.
  The first round found simulation overflow and an Escape event routing issue;
  both were corrected and verified in the final round.

Local evidence: `.data/operations-layout/final-results.json`,
`.data/operations-layout/regression-results.json`, and the corresponding
`final-artifacts/` and `regression-artifacts/` directories. Test servers used
isolated DRY databases rather than the running sandbox's data.
