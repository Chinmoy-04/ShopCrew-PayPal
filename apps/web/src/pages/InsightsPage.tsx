import { createPortal } from "react-dom";
import {
  Component,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Link } from "react-router-dom";
import { MoreHorizontal, X, RefreshCw } from "lucide-react";
import { dailyInsights, refundAnomalies } from "@shopcrew/shared";
import type {
  AgDataSourcesDefinition,
  AgReportState,
  AgStudioMode,
  AgWidgetsConfig,
  AgAiHarnessSetup,
} from "ag-studio";
import { AgStudioAiModule } from "ag-studio";
import { AgStudio, AgStudioProvider } from "ag-studio-react";
import type { CustomCellRendererProps } from "ag-grid-react";
import { onLive } from "../hooks/useLiveEvents";
import { buildStudioAi } from "../studio/ai";
import { buildStudioData, type InsightsPayload } from "../studio/data";
import { shopCrewReport } from "../studio/initial-report";
import type { ShopCrewRegistry } from "../studio/registry";
import { shopCrewStudioTheme } from "../studio/theme";
import { buildShopCrewWidgets } from "../studio/widgets";
import { usd, readable } from "../studio/widgets/InsightBars";
import {
  applyExplorer,
  defaultExplorer,
  explorerFromReport,
  loadReport,
  projectReport,
  restoreCanonicalLayout,
  serializeReport,
  REPORT_KEY,
  type Explorer,
  type Report,
} from "../studio/report-state";
import "../styles/insights.css";

type Drawer =
  { type: "decision"; id: string } | { type: "refunds"; day: number };

export function InsightsPage({
  licenseKey,
  studioAiEnabled,
  studioAiModels,
}: {
  licenseKey?: string;
  studioAiEnabled?: boolean;
  studioAiModels?: string[];
}) {
  const [loaded] = useState(() => {
    try {
      return loadReport(localStorage, shopCrewReport);
    } catch {
      return {
        report: structuredClone(shopCrewReport),
        saved: false,
        note: "Report storage is unavailable. Changes will remain in this session.",
      };
    }
  });
  const canonical = useRef<Report>(loaded.report);
  const studio = useRef<AgStudio<ShopCrewRegistry>>(null);
  const [payload, setPayload] = useState<InsightsPayload | null>(null);
  const [error, setError] = useState("");
  const [updated, setUpdated] = useState<Date | null>(null);
  const [mode, setMode] = useState<AgStudioMode>("view");
  const [note, setNote] = useState(loaded.note);
  const [saveNote, setSaveNote] = useState("");
  const [drawer, setDrawer] = useState<Drawer | null>(null);
  const [width, setWidth] = useState(window.innerWidth);
  const [scope, setScope] = useState<Explorer>(() =>
    loaded.saved ? explorerFromReport(loaded.report) : defaultExplorer(),
  );
  const [pageId, setPageId] = useState(loaded.report.selectedPageId);
  const [initial, setInitial] = useState<Report | null>(null);
  const liveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const request = useRef<AbortController | null>(null);
  const initialized = useRef(false);
  const interaction = useRef<(action: string) => void>(() => {});
  const [controlSlots, setControlSlots] = useState<Map<string, HTMLElement>>(
    () => new Map(),
  );
  const context = useRef({
    mountControls: (id: string, element: HTMLElement) =>
      setControlSlots((current) => new Map(current).set(id, element)),
    unmountControls: (id: string, element: HTMLElement) =>
      setControlSlots((current) => {
        if (current.get(id) !== element) return current;
        const next = new Map(current);
        next.delete(id);
        return next;
      }),
    onMetric: (action: string) => interaction.current(action),
    pendingEarlier: 0,
    sourceCounts: { payouts: 0, studio_ai_runs: 0 },
    pendingPayouts: [] as { id: string }[],
    aiEnabled: Boolean(studioAiEnabled),
    openStudioAi: () => setMode("edit"),
  });

  const reload = useCallback(async () => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    try {
      const response = await fetch("/api/insights", {
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("Could not refresh Insights");
      const next = (await response.json()) as InsightsPayload;
      if (controller.signal.aborted) return;
      setPayload(next);
      setUpdated(new Date());
      setError("");
    } catch (failure) {
      if (!controller.signal.aborted)
        setError(
          failure instanceof Error
            ? failure.message
            : "Could not refresh Insights",
        );
    }
  }, []);
  useEffect(() => {
    void reload();
    return () => request.current?.abort();
  }, [reload]);
  useEffect(() => {
    const stop = onLive(() => {
      if (liveTimer.current) clearTimeout(liveTimer.current);
      liveTimer.current = setTimeout(() => void reload(), 1500);
    });
    return () => {
      stop();
      if (liveTimer.current) clearTimeout(liveTimer.current);
    };
  }, [reload]);
  useEffect(() => {
    const resize = () => setWidth(window.innerWidth);
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  const persist = useCallback((report: Report) => {
    try {
      localStorage.setItem(REPORT_KEY, serializeReport(report));
      setSaveNote("Report saved in this browser");
    } catch {
      setSaveNote(
        "Could not save report. Your changes are still available in this session.",
      );
    }
  }, []);
  useEffect(
    () => () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        try {
          localStorage.setItem(REPORT_KEY, serializeReport(canonical.current));
        } catch {
          /* Keep the in-memory report intact. */
        }
      }
    },
    [],
  );

  const summary = useMemo(
    () =>
      payload
        ? dailyInsights(
            payload.proposals,
            payload.policies,
            payload.kpis.simDay,
          )
        : null,
    [payload],
  );
  context.current.pendingEarlier = summary?.pendingEarlier ?? 0;
  context.current.sourceCounts = {
    payouts: payload?.payouts.length ?? 0,
    studio_ai_runs: payload?.studioAiRuns?.length ?? 0,
  };
  context.current.pendingPayouts =
    payload?.proposals.filter(
      (row) => row.type === "payout" && row.status === "pending_approval",
    ) ?? [];
  context.current.aiEnabled = Boolean(studioAiEnabled);
  context.current.openStudioAi = () => {
    setMode("edit");
    const report = {
      ...canonical.current,
      panels: {
        ...canonical.current.panels,
        ai: { ...canonical.current.panels?.ai, collapsed: false },
      },
    };
    canonical.current = report;
    studio.current?.api?.setState(projectReport(report, width, true));
  };
  const data = useMemo(
    () => (payload ? buildStudioData(payload) : null),
    [payload],
  );
  const anomaly = useMemo(
    () => refundAnomalies(payload?.refunds ?? []).spike,
    [payload],
  );
  const ai = useMemo<AgAiHarnessSetup | undefined>(
    () =>
      studioAiEnabled
        ? buildStudioAi(
            studioAiModels?.length ? studioAiModels : ["gpt-4.1-mini"],
          )
        : undefined,
    [studioAiEnabled, studioAiModels],
  );
  const modules = useMemo(() => (ai ? [AgStudioAiModule] : []), [ai]);
  const DecisionCell = useMemo(
    () =>
      function DecisionLink(params: CustomCellRendererProps) {
        const id = String(params.value ?? "");
        return (
          <button
            type="button"
            className="insight-record-link"
            onClick={() => setDrawer({ type: "decision", id })}
          >
            {id}
          </button>
        );
      },
    [],
  );
  const widgets = useMemo(
    () => (defaults: AgWidgetsConfig) =>
      buildShopCrewWidgets(defaults, DecisionCell),
    [DecisionCell],
  );

  useEffect(() => {
    if (!payload || initialized.current) return;
    initialized.current = true;
    let report = canonical.current;
    if (!loaded.saved)
      report = applyExplorer(report, defaultExplorer(), payload.kpis.simDay);
    report = {
      ...report,
      panels: {
        ...report.panels,
        filters: { ...report.panels?.filters, collapsed: true },
      },
    };
    canonical.current = report;
    setInitial(projectReport(report, width, false));
  }, [payload, loaded.saved, width]);
  useEffect(() => {
    if (initial)
      studio.current?.api?.setState(
        projectReport(canonical.current, width, mode === "edit"),
      );
  }, [width, mode, initial]);
  const lastDay = useRef<number | null>(null);
  useEffect(() => {
    if (!payload) return;
    const previous = lastDay.current;
    lastDay.current = payload.kpis.simDay;
    if (
      previous === null ||
      previous === payload.kpis.simDay ||
      scope.day !== "today"
    )
      return;
    const report = applyExplorer(canonical.current, scope, payload.kpis.simDay);
    canonical.current = report;
    studio.current?.api?.setState(
      projectReport(report, width, mode === "edit"),
    );
  }, [payload, scope, width, mode]);

  const onStateUpdated = useCallback(
    (event: { state: AgReportState }) => {
      const incoming = event.state as Report;
      let next =
        width < 1200 && mode === "view"
          ? restoreCanonicalLayout(incoming, canonical.current)
          : incoming;
      if (mode === "edit")
        next = {
          ...next,
          pages: next.pages.map((page) => {
            const saved = canonical.current.pages.find(
              (item) => item.id === page.id,
            );
            const minimum = saved?.layout?.minWidth;
            return page.layout?.minWidth === Math.max(1000, minimum ?? 0)
              ? { ...page, layout: { ...page.layout, minWidth: minimum } }
              : page;
          }),
        };
      canonical.current = next;
      setPageId(next.selectedPageId);
      setScope((current) => {
        const restored = explorerFromReport(next);
        if (current.day === "today" && restored.day === String(lastDay.current))
          restored.day = "today";
        return JSON.stringify(restored) === JSON.stringify(current)
          ? current
          : restored;
      });
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        saveTimer.current = null;
        persist(canonical.current);
      }, 500);
    },
    [width, mode, persist],
  );
  function changeScope(next: Explorer, scroll = false) {
    if (!payload) return;
    setScope(next);
    setPageId("operations");
    const report = applyExplorer(canonical.current, next, payload.kpis.simDay);
    canonical.current = report;
    studio.current?.api?.setState(
      projectReport(report, width, mode === "edit"),
    );
    if (scroll)
      requestAnimationFrame(() =>
        document.querySelector(".studio-frame [role=grid]")?.scrollIntoView({
          behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
            ? "instant"
            : "smooth",
          block: "center",
        }),
      );
  }
  interaction.current = (action) =>
    changeScope(
      action === "pending"
        ? { ...defaultExplorer(), day: "all", status: "pending_approval" }
        : {
            ...defaultExplorer(),
            preset:
              action === "auto" || action === "committed" ? action : undefined,
          },
      true,
    );
  function resetReport() {
    if (
      !window.confirm(
        "Reset this report to the improved default layout? Your previous v5 report backup will be kept.",
      )
    )
      return;
    const report = applyExplorer(
      structuredClone(shopCrewReport),
      defaultExplorer(),
      payload!.kpis.simDay,
    );
    canonical.current = report;
    setScope(defaultExplorer());
    setPageId("operations");
    studio.current?.api?.setState(
      projectReport(report, width, mode === "edit"),
    );
    persist(report);
    setNote("");
  }
  async function copyPrompt() {
    const prompt = `Investigate refunds on simulation day ${anomaly?.day}. Compare daily totals across available history using refund-sentinel and explain the unusual refund amount.`;
    try {
      await navigator.clipboard.writeText(prompt);
      setSaveNote(
        "Investigation prompt copied. Paste it into Ask Studio in Edit report.",
      );
    } catch {
      setNote(`Copy this investigation prompt: ${prompt}`);
    }
  }
  const days = [
    ...new Set(payload?.proposals.map((row) => row.simDay) ?? []),
  ].sort((a, b) => b - a);
  const explorerControls = payload && pageId === "operations" && (
    <section
      className="insight-explorer-controls"
      aria-label="Decision explorer filters"
    >
      <span className="insight-scope-label">Decision explorer</span>
      <label>
        Day
        <select
          aria-label="Day"
          value={scope.day}
          onChange={(event) =>
            changeScope({ ...scope, day: event.target.value })
          }
        >
          <option value="today">Today · day {payload.kpis.simDay}</option>
          <option value="all">All days</option>
          {days.map((day) => (
            <option key={day} value={day}>
              Day {day}
            </option>
          ))}
        </select>
      </label>
      <label>
        Agent
        <select
          aria-label="Agent"
          value={scope.agent}
          onChange={(event) =>
            changeScope({ ...scope, agent: event.target.value })
          }
        >
          <option value="">All agents</option>
          {[...new Set(payload.proposals.map((row) => row.agent))]
            .sort()
            .map((agent) => (
              <option key={agent}>{agent}</option>
            ))}
        </select>
      </label>
      <label>
        Status
        <select
          aria-label="Status"
          value={scope.status}
          onChange={(event) =>
            changeScope({
              ...scope,
              status: event.target.value,
              preset: undefined,
            })
          }
        >
          <option value="">All statuses</option>
          {[...new Set(payload.proposals.map((row) => row.status))]
            .sort()
            .map((status) => (
              <option key={status} value={status}>
                {readable(status)}
              </option>
            ))}
        </select>
      </label>
      <label>
        Moves money
        <select
          aria-label="Moves money"
          value={scope.money}
          onChange={(event) =>
            changeScope({ ...scope, money: event.target.value })
          }
        >
          <option value="">All decisions</option>
          <option value="yes">Yes</option>
          <option value="no">No</option>
        </select>
      </label>
      <button
        type="button"
        className="btn"
        onClick={() => changeScope(defaultExplorer())}
      >
        Clear filters
      </button>
      <span className="insight-filter-note">
        {scope.preset
          ? `${scope.preset === "auto" ? "Policy approvals" : "Monetary commitments"} · `
          : ""}
        Daily summary stays on today.
      </span>
    </section>
  );
  return (
    <main className="page insights-page insights-v6">
      <header className="insights-header">
        <div>
          <h1>Insights</h1>
          <p className="insights-intro">
            The day's work, in view.
            {payload && <> · Simulation day {payload.kpis.simDay}</>}
          </p>
          <span className="insight-freshness">
            {updated
              ? `Updated ${updated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
              : "Loading report"}
          </span>
          {saveNote && (
            <span className="insight-save" role="status">
              {saveNote}
            </span>
          )}
        </div>
        <div className="insights-actions">
          <button
            type="button"
            className="btn insight-refresh"
            aria-label="Refresh insights"
            onClick={() => void reload()}
          >
            <RefreshCw size={16} />
          </button>
          <button
            type="button"
            className="btn primary"
            onClick={() =>
              setMode((current) => (current === "view" ? "edit" : "view"))
            }
          >
            {mode === "edit" ? "Done editing" : "Edit report"}
          </button>
          <details className="insight-menu">
            <summary className="btn" aria-label="Report options">
              <MoreHorizontal size={20} />
            </summary>
            <div>
              <button
                type="button"
                className="btn"
                disabled={!payload}
                onClick={resetReport}
              >
                Reset report
              </button>
            </div>
          </details>
        </div>
      </header>
      {note && <p className="insight-notice">{note}</p>}
      {error && (
        <div className="insight-load-error" role="alert">
          {payload ? "Showing the last successful data. " : ""}
          {error}{" "}
          <button type="button" className="btn" onClick={() => void reload()}>
            Retry
          </button>
        </div>
      )}
      {initial && (
        <nav className="insight-report-pages" aria-label="Report pages">
          {canonical.current.pages.map((page) => (
            <button
              type="button"
              key={page.id}
              aria-current={pageId === page.id ? "page" : undefined}
              onClick={() => {
                const report = {
                  ...canonical.current,
                  selectedPageId: page.id,
                };
                canonical.current = report;
                setPageId(page.id);
                studio.current?.api?.setState(
                  projectReport(report, width, mode === "edit"),
                );
              }}
            >
              {(
                {
                  operations: "Overview",
                  money: "Money",
                  inventory: "Inventory",
                  "live-agents": "Live agents",
                } as Record<string, string>
              )[page.id] ?? readable(page.id)}
            </button>
          ))}
        </nav>
      )}
      {anomaly && (
        <div className="insights-anomaly">
          <div>
            <strong>Unusual refunds · {usd(anomaly.amount)}</strong>
            <span>
              Simulation day {anomaly.day} · available-history comparison
            </span>
          </div>
          <div className="insights-actions">
            <button
              type="button"
              className="btn primary"
              onClick={() => setDrawer({ type: "refunds", day: anomaly.day })}
            >
              Review refunds
            </button>
            {studioAiEnabled && (
              <button
                type="button"
                className="btn"
                onClick={() => void copyPrompt()}
              >
                Copy investigation prompt
              </button>
            )}
          </div>
        </div>
      )}
      {!controlSlots.size && explorerControls}

      {!data || !initial ? (
        <p role="status">Loading ShopCrew insights…</p>
      ) : (
        <ErrorBoundary>
          <div
            className={`studio-frame${mode === "edit" ? " is-editing" : ""}`}
          >
            <AgStudioProvider
              licenseKey={licenseKey || undefined}
              modules={modules}
            >
              <AgStudio<ShopCrewRegistry>
                ref={studio}
                style={{ height: "100%", width: "100%" }}
                theme={shopCrewStudioTheme}
                data={data as AgDataSourcesDefinition<ShopCrewRegistry>}
                mode={mode}
                initialState={initial}
                context={context.current}
                onStateUpdated={onStateUpdated}
                widgets={widgets}
                ai={ai}
              />
            </AgStudioProvider>
          </div>
        </ErrorBoundary>
      )}
      {[...controlSlots].map(([id, element]) =>
        createPortal(explorerControls, element, id),
      )}
      {drawer && payload && (
        <InsightDrawer
          drawer={drawer}
          payload={payload}
          onClose={() => setDrawer(null)}
        />
      )}
    </main>
  );
}

function InsightDrawer({
  drawer,
  payload,
  onClose,
}: {
  drawer: Drawer;
  payload: InsightsPayload;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.showModal();
    return () => {
      dialog.current?.close();
      previous?.focus();
    };
  }, []);
  const proposal =
    drawer.type === "decision"
      ? payload.proposals.find((row) => row.id === drawer.id)
      : null;
  const refunds =
    drawer.type === "refunds"
      ? (payload.refunds?.filter((row) => row.day === drawer.day) ?? [])
      : [];
  return (
    <dialog
      ref={dialog}
      className="insight-drawer"
      aria-labelledby="insight-drawer-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <header>
        <h2 id="insight-drawer-title">
          {drawer.type === "refunds"
            ? `Refunds · simulation day ${drawer.day}`
            : "Decision details"}
        </h2>
        <button
          autoFocus
          type="button"
          className="btn"
          aria-label="Close details"
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </header>
      {drawer.type === "decision" ? (
        proposal ? (
          <>
            <p className="insight-detail-summary">{proposal.summary}</p>
            <dl>
              {[
                ["Decision", proposal.id],
                ["Agent", proposal.agent],
                ["Simulation day", proposal.simDay],
                ["Status", readable(proposal.status)],
                [
                  "Proposed amount",
                  proposal.amount === null
                    ? "No monetary amount"
                    : usd(proposal.amount),
                ],
                [
                  "Reasoning",
                  proposal.reasoning ||
                    proposal.reason ||
                    "No additional reasoning recorded",
                ],
                ["Risk", proposal.riskScore ?? "Not recorded"],
                [
                  "Confidence",
                  proposal.confidenceModel === null
                    ? "Not recorded"
                    : `${Math.round(proposal.confidenceModel * 100)}%`,
                ],
                [
                  "PayPal reference",
                  proposal.paypalRef || "No payment reference recorded",
                ],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
            <Link
              className="btn primary"
              to={`/control?tab=decisions&focus=${encodeURIComponent(proposal.id)}`}
            >
              Open in Operations
            </Link>
          </>
        ) : (
          <p>This decision is no longer in the current data.</p>
        )
      ) : (
        <>
          <p>
            {usd(refunds.reduce((sum, row) => sum + row.amount, 0))} refunded
            across {refunds.length} records.
          </p>
          <ul className="insight-refund-list">
            {refunds.map((row) => (
              <li key={row.id}>
                <strong>{usd(row.amount)}</strong>
                <span>
                  {row.agent} · {readable(row.status)}
                </span>
                <span>Order {row.order}</span>
                {row.proposalId && (
                  <Link
                    to={`/control?tab=decisions&focus=${encodeURIComponent(row.proposalId)}`}
                  >
                    Open decision in Operations
                  </Link>
                )}
              </li>
            ))}
          </ul>
          {!refunds.length && <p>No refund records remain for this day.</p>}
        </>
      )}
    </dialog>
  );
}
class ErrorBoundary extends Component<
  { children: ReactNode },
  { message: string }
> {
  state = { message: "" };
  static getDerivedStateFromError(error: unknown) {
    return {
      message:
        error instanceof Error ? error.message : "Studio failed to render",
    };
  }
  render() {
    return this.state.message ? (
      <div className="error" role="alert">
        Could not display the report: {this.state.message}
        <button
          type="button"
          className="btn"
          onClick={() => this.setState({ message: "" })}
        >
          Retry report
        </button>
      </div>
    ) : (
      this.props.children
    );
  }
}
