# Insights improvement plan

Date: 12 November 2026. Status: implemented.

Implementation uses AG Studio 3.0's public component lifecycle, native grid widgets, and locally installed Bklit registry charts. Existing v5 reports are preserved and migrated to a versioned v6 envelope; Reset report adopts the new overview. Explorer controls live in a Studio-positioned widget in the new default report and remain available above legacy layouts.

Verification: server/web typechecks and production build pass; 11 focused unit tests pass. Desktop and phone browser coverage verifies metrics, chart filtering, distinct record IDs, refund review, live refresh, all four pages, corrupt/full storage, migration/reset, editor drafts, and existing Studio AI behavior. Responsive captures cover 1440, 1024, and 390 pixels. The design detector reported no findings. The original planning notes below record the design rationale; npm connectivity was restored and Bklit installation completed.

## Direction

Prioritize a daily operational overview with drill-down, as confirmed by the user. Help the owner answer: What needs my attention? What did agents do today? How much budget is committed? Which records explain a result?

Preserve the existing cream, forest-green, Outfit, and Fraunces identity. Use AG Studio as the report system, AG Grid for records and analysis, and Bklit for custom chart widgets. Keep the Operations, Money, Inventory, and Live agents report pages, with Operations as the default overview.

## Findings from the screenshot and source

- Custom widgets repeat Studio's title and card border inside their own content. This creates two headings and two containers for one chart.
- The status bars and status donut repeat the same analysis while the decision grid sits far below them.
- The filter sidebar occupies substantial width on the default desktop view; a separate large Moves money widget consumes more chart space.
- The Live brief occupies a full report row without visible body text in the screenshot. It maps a text field through a value widget; verify rendering and use a text-capable presentation.
- `InsightsPage.tsx` increments `dataEpoch` and keys `StudioShell` with it, recreating the provider and Studio on every successful reload.
- `useWidgetRows.ts` depends on mapping/sort references for query execution. Verify that Studio refreshes with unchanged mappings still trigger a new query, instead of depending on whole-report remounts.
- Snapshot KPIs describe today, while decision charts have no default day filter. The screenshot's pending counts therefore describe potentially different populations.
- `snapshot.budgetUsedPct` is an unweighted average of agent burn percentages when per-agent data exists. This is different from total money committed divided by total budget.
- The current spend KPI includes submitted/executing/auto-approved monetary proposals as well as confirmed ones. It must not be presented as settled PayPal money.
- The decision grid maps an aggregated amount without the decision ID. Rows with identical displayed dimensions can collapse together.
- The anomaly button currently switches to editing and displays a prompt to copy; it does not start the advertised investigation.
- Saved state is parsed without structural validation, and Reset deletes every storage key with the report prefix before reloading the window.

## Proposed daily overview

Reading order, top to bottom:

1. **Compact header:** Insights, current simulation day, last successful refresh, and a single Edit report action. Report reset belongs in an overflow menu. Show Done editing and Studio's editing controls only in edit mode.
2. **Attention summary:** one compact refund alert when relevant, with amount, explicitly labeled simulation day, and Review refunds. Technical sigma details belong in the explanation. AI investigation is a secondary action when available.
3. **Daily summary:** a readable one- or two-line brief, followed by four concise metrics: Needs review, Auto-approved today, Committed today, and Estimated time saved today. Needs review counts all outstanding approvals and explicitly identifies any from earlier days. Clicking a metric opens the matching records with its exact scope.
4. **Two main charts:** decision status for the selected day, and budget utilization with committed amount / daily cap and remaining amount. Remove the duplicate default status donut. Keep useful optional chart types available in Studio's widget catalog.
5. **Decision explorer:** compact day, agent, status, and money-movement controls; proposed amount by agent/type; then the decision grid. Default day is the current simulation day. Historical choices use simulation-day labels, not invented calendar dates.

Keep the snapshot summary explicitly marked Today; explorer controls affect the explorer's decision widgets. Implement those as scoped widget filters/cross-filter configuration in Studio, rather than claiming that unrelated snapshot, inventory, and decision tables share a global filter. Opening an earlier-day pending approval must carry an explicit day override.

Collapse the Filters panel by default in viewing mode. Existing filter values remain effective and discoverable. Disable creation/editing of arbitrary filter definitions in view mode; provide authored filter controls for normal exploration. Edit mode retains the complete native Studio experience.

## Library responsibilities

### AG Studio

- Keep `AgStudioProvider`, `AgStudio`, the typed `ShopCrewRegistry`, and `createWidgets` from `ag-studio-react`.
- Let Studio own report pages, widget layout, data mappings, aggregation, filter state, editor forms, and report persistence. Do not introduce a separate dashboard layout engine or a second independent filter store.
- Prefer built-in value, text, grid, filter, and standard chart widgets where they satisfy the need. Custom widgets add business-specific visualization and interaction.
- Keep schema/source IDs stable. Replace synchronous table data through the supported `data` property update path in installed 3.0; remove `key={dataEpoch}`. Reserve `api.reload()` for a source-loading strategy that requires it. Schema changes are a separate initialization/migration concern.
- Centralize custom-widget data queries in `useWidgetRows`. Connect query invalidation to the React widget refresh lifecycle so filter/data changes rerun the query even when mapping references stay unchanged; cancel obsolete requests. Verify this with a focused integration check before removing remounts. Installed 3.0 exposes no public widget data-change event or 3.1 data-handle API: do not invent a subscription or import private wrapper internals.
- Use `widgetApi.getData()` for custom-widget data, `toggleCrossFilter()` for supported chart selection, and `formatFieldValue()` for Studio-aware formatting. Provide a keyboard-accessible equivalent for chart selection.
- Studio renders the widget title and outer surface exactly once. Bklit components render the plot and relevant annotations inside it.
- Debounce persistence. Validate a versioned application storage envelope, preserve the existing v5 report as a backup, and migrate compatible saved layouts. Keep stable custom-widget type IDs where their meaning is unchanged. A changed budget definition should use a new field ID rather than silently changing an old saved report.
- Reset only the current report after a clear confirmation, using Studio state APIs; avoid a full-page reload and blanket storage deletion. Display save failures without discarding the active report.

### AG Grid

- Use Studio's built-in grid widget for report detail tables. In the installed version its configuration is narrower than arbitrary `GridOptions`; do not pass unsupported standalone-grid props into it.
- Include `decisions.id` in the underlying mapping to preserve one row per decision. Use readable status labels, USD formatting, day sorting, and a decision-ID cell renderer that opens detail. Keep aggregate tables separate from record tables.
- Default visible columns: decision, day, agent, action, status, proposed amount, and summary. Keep reasons, risk, confidence, and money-movement metadata available on demand.
- Open a read-only detail drawer from the decision ID, reusing existing decision-detail presentation where possible. Include a link to the relevant Operations record for approval actions, avoiding a second approval workflow in Insights.
- Keep grouping and pivoting as optional analysis views using Studio's native grid/pivot widgets. Retain virtualization for record tables and export the currently scoped data.
- If a later requirement needs standalone AG Grid, use a dedicated component with stable `getRowId`, memoized definitions, existing module/license initialization, and saved grid state. This is not needed for the default report table.

### Bklit custom widgets

- **Decision status:** replace `StatusStack`'s hand-built bars with `@bklit/bar-chart`, horizontal orientation, readable status names, counts, and contextual tooltips. Map click/keyboard selection back to Studio filters; color by status meaning rather than sorted index.
- **Budget utilization:** replace `PulseMeter`'s CSS ring with `@bklit/ring-chart`. Show the exact ratio and money amounts; keep warning thresholds configurable. A zero/missing budget displays an explanatory state. Over-budget values remain visible numerically even if the arc is capped.
- **Refund pattern:** replace `RefundAnomalyStrip` with `@bklit/bar-chart` for daily totals and anomaly emphasis. Use a single documented calculation shared with the server, including baseline scope, minimum observations, zero-refund days, and boundary comparison. The banner and chart must agree.
- **Secondary pages:** use Bklit bars for budget burn, payout status totals, inventory cover versus lead time, and supplier savings. Preserve `DecisionTicker` as a non-chart list widget. Do not depict payout status totals as a conversion funnel unless actual cohort transitions are available.
- Configure `@bklit` as `https://ui.bklit.com/r/{name}.json` in `apps/web/components.json`. From `apps/web`, run `npx shadcn@latest info --json`, then install required registry charts with the project npm runner. Start with bar-chart and ring-chart; add further components only for a selected design.
- Use actual generated import paths. Let shadcn resolve peer dependencies; do not guess or manually pin Visx/Motion packages.
- Compose Cartesian charts in documented order: chart root, grid, series, axes, tooltip. Use the ring-specific documented composition for the budget widget.
- Define shared chart tokens and use `chartCssVars`, `--chart-1` through `--chart-5`, and popover surface tokens. Match Studio and Grid to the same semantic palette.
- Keep chart measurements responsive to widget resizing. Respect reduced motion; avoid replaying entrance animation on every live refresh.

## Data and interaction contract

- **Needs review:** count outstanding `pending_approval` decisions across days, with an earlier-day subtotal. Drill-down uses that same population.
- **Auto-approved today:** preserve and explain the existing policy-approved status criteria. Derive the drill-down from those exact criteria.
- **Committed today:** monetary proposals in the existing counted lifecycle states, explicitly distinguished from confirmed/settled payment reporting. Format as USD.
- **Estimated time saved:** identify the existing estimate of 0.15 hours per decision. Do not imply measured labor savings. Historical comparisons require real historical inputs.
- **Budget utilization:** sum the chosen committed amounts divided by the corresponding daily policy caps. Confirm enabled-policy inclusion and avoid mixing a filtered numerator with an unrelated denominator. Label full-shop daily budget as unaffected by explorer filters.
- **Decision status and explorer totals:** use a common simulation-day/status/agent scope. Preserve stable IDs across queries and refreshes.
- Missing field mappings and empty results are different from query failures. Remove the helper's fallback to the first arbitrary numeric/string field; invalid mappings must be visible instead of producing plausible wrong numbers.
- Preserve last successful data on transient reload failure, show stale status and Retry, and clear errors after recovery. Abort obsolete fetches and clear the live-event debounce timer on unmount.
- Review refunds must work without AI. When AI is enabled, use a verified public harness/chat integration to open the investigation with context. If 3.0 lacks a supported prefill entry point, label the fallback honestly as Copy investigation prompt rather than claiming a chat has started.

## Layout and accessibility

- Desktop: compact summary, four metrics, a wide status chart beside a smaller budget widget, then the explorer. Move decision records substantially closer to the top than the current duplicate-chart layout.
- Tablet: two-column metrics and stacked analytical sections. Phone: one-column widgets, concise grid columns, and a full-width detail presentation.
- Use one vertical report scroll area in the app workspace; allow scrolling inside virtualized grids, but eliminate nested card/chart scrollbars. Ensure report navigation remains visible and reachable.
- Use supported Studio theme parameters for native internals, with scoped app styles for the surrounding shell. Avoid brittle DOM selectors or blanket overrides of AG classes.
- Maintain clear keyboard focus, text equivalents for chart values and severity, accessible controls, and appropriate live-region announcements. Do not announce every live data change.
- Installed Studio 3.0 does not expose the newer `responsiveLayoutBreakpoints` property found in current 3.1 docs. Plan a transient view-only layout projection using supported layout state, preserving canonical saved desktop layout and never persisting the projection. Validate this in the initial integration check; a 3.1 upgrade would be a separate, tested dependency change.

## Delivery sequence

1. **Foundation:** verify 3.0 data-refresh lifecycle behavior, fix metric definitions and row identity, validate saved state, and establish shared formatters/tokens. Validate responsive view projection and detail-cell integration against installed public types.
2. **Overview:** restructure the initial report, remove duplicate titles/charts, collapse viewer panels, add explicit scopes and functioning drill-down, and improve loading/error feedback.
3. **Bklit widgets:** install the required charts, replace status/budget/refund renderers, integrate Studio cross-filtering, and migrate secondary chart widgets without breaking saved report IDs.
4. **Verification:** test live refresh during viewing/editing, filtering, persistence/migration/reset, record drill-down, and desktop/mobile layout. Run relevant existing tests, web/server typecheck, and build. Extend tests for behavior changes rather than mirroring markup.

Primary files: `apps/web/src/pages/InsightsPage.tsx`; `apps/web/src/studio/{initial-report,data,registry,widgets,theme}.ts`; `apps/web/src/studio/widgets/*`; `apps/web/components.json`; scoped Insights styles; and `apps/server/src/insights/buildInsights.ts` where definitions must be shared. Preserve unrelated working-tree changes, including the currently modified Operations stylesheet/tests.

## Acceptance criteria

- A viewer can identify outstanding approvals, today's committed amount, and budget utilization without opening the editor.
- Each custom widget has one title, one surface, readable units, and no unnecessary nested scrolling.
- Changing the decision scope updates the relevant charts and table together; fixed daily metrics are visibly outside that scope.
- Clicking a status or metric produces matching record counts; identical-looking decisions retain distinct IDs and rows.
- A live event updates native and custom widgets without recreating Studio or losing filters, scroll position, editor work, or AI conversation.
- Reload restores the saved report; corrupt storage recovers safely; reset affects only the intended report.
- Alert and refund chart agree on anomaly results; zero budgets, empty results, missing mappings, and failed requests have distinct outcomes.
- Keyboard and touch users can filter and drill down. Validate at 1440, 1024, and 390 pixels, including reduced-motion behavior.

## Evidence and documentation

Repository versions: AG Studio/React 3.0.0, AG Grid 36.2.0, AG Charts Enterprise 14.2.0; React 19, Vite, Tailwind 4. The Bklit registry is currently absent. The attempted shadcn info command failed with npm DNS `ENOTFOUND`; no Bklit installation or runtime validation was performed for this planning task.

Use installed declaration files as the implementation authority when online documentation targets a newer release.

- [AG Studio widget overview](https://www.ag-grid.com/studio/react/widget-overview/)
- [AG Studio custom widgets](https://www.ag-grid.com/studio/react/custom-widgets/)
- [AG Studio API](https://www.ag-grid.com/studio/react/studio-api/)
- [AG Studio filters](https://www.ag-grid.com/studio/react/filters/)
- [AG Grid row IDs](https://www.ag-grid.com/react-data-grid/row-ids/)
- [Bklit bar chart](https://ui.bklit.com/docs/components/bar-chart)
- [Bklit ring chart](https://ui.bklit.com/docs/components/ring-chart)
- [Bklit variants gallery](https://ui.bklit.com/charts/bar-chart) and [Bklit Studio](https://ui.bklit.com/studio?chart=ring-chart) are implementation-time inspiration links; their previews were not retrievable during this review.
