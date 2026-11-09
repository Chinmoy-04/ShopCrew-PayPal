import { Component, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type {
  AgAiHarnessSetup,
  AgDataSourcesDefinition,
  AgReportState,
  AgStudioMode,
  AgWidgetsConfig,
} from "ag-studio";
import { AgStudioAiModule } from "ag-studio";
import { AgStudio, AgStudioProvider } from "ag-studio-react";
import { api } from "../api/client";
import { onLive } from "../hooks/useLiveEvents";
import { buildStudioAi } from "../studio/ai";
import { buildStudioData, type InsightsPayload } from "../studio/data";
import { shopCrewReport, STUDIO_STATE_KEY } from "../studio/initial-report";
import type { ShopCrewRegistry } from "../studio/registry";
import { shopCrewStudioTheme } from "../studio/theme";
import { buildShopCrewWidgets } from "../studio/widgets";

function loadSavedReport(): AgReportState | null {
  try {
    const raw = localStorage.getItem(STUDIO_STATE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AgReportState;
  } catch {
    return null;
  }
}

export function InsightsPage({
  licenseKey,
  studioAiEnabled,
  studioAiModels,
}: {
  licenseKey?: string;
  studioAiEnabled?: boolean;
  studioAiModels?: string[];
}) {
  const [payload, setPayload] = useState<InsightsPayload | null>(null);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<AgStudioMode>("view");
  const [dataEpoch, setDataEpoch] = useState(0);
  const [initialState] = useState<AgReportState<ShopCrewRegistry>>(
    () => (loadSavedReport() as AgReportState<ShopCrewRegistry> | null) ?? shopCrewReport,
  );
  const [savedNote, setSavedNote] = useState("");
  const [anomaly, setAnomaly] = useState<{ day: number; amount: number; z: number } | null>(null);
  const [prefillPrompt, setPrefillPrompt] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reload = useCallback(() => {
    api
      .insights()
      .then((data) => {
        setPayload(data as InsightsPayload);
        setDataEpoch((n) => n + 1);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load insights"));
    fetch("/api/insights/anomalies")
      .then((r) => r.json())
      .then((data: { spike?: { day: number; amount: number; z: number } | null }) => {
        setAnomaly(data.spike ?? null);
      })
      .catch(() => setAnomaly(null));
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    return onLive(() => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => reload(), 1500);
    });
  }, [reload]);

  const studioData = useMemo(() => (payload ? buildStudioData(payload) : null), [payload, dataEpoch]);

  const ai = useMemo<AgAiHarnessSetup | undefined>(() => {
    if (!studioAiEnabled) return undefined;
    return buildStudioAi(studioAiModels?.length ? studioAiModels : ["gpt-4.1-mini"]);
  }, [studioAiEnabled, studioAiModels]);

  const widgets = useMemo(
    () => (defaults: AgWidgetsConfig) => buildShopCrewWidgets(defaults),
    [],
  );

  const onStateUpdated = useCallback((event: { state: AgReportState }) => {
    try {
      localStorage.setItem(STUDIO_STATE_KEY, JSON.stringify(event.state));
      setSavedNote("Report layout saved in this browser");
    } catch {
      setSavedNote("Could not save layout");
    }
  }, []);

  function resetReport() {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith("shopcrew-studio-report")) localStorage.removeItem(key);
    }
    window.location.reload();
  }

  function openAnomalyThread() {
    setPrefillPrompt(
      "Is any agent refunding unusually much? Build a refund anomaly widget for the last 30 days using refund-sentinel.",
    );
    setMode("edit");
  }

  if (error) {
    return (
      <main className="page">
        <div className="error">{error}</div>
      </main>
    );
  }

  if (!payload || !studioData) {
    return (
      <main className="page">
        <p className="note">Loading ShopCrew insights…</p>
      </main>
    );
  }

  return (
    <main className="page insights-page">
      <header className="insights-header">
        <div>
          <h1>Insights</h1>
          <p className="note">
            AG Studio report with ShopCrew widgets{studioAiEnabled ? " and custom agents" : ""}.
            {!licenseKey && " Running without a licence key (watermark OK for the hackathon)."}
            {!studioAiEnabled && " Set AG_STUDIO_OPENAI_API_KEY to enable Studio AI."}
          </p>
        </div>
        <div className="insights-actions">
          <button type="button" className="btn" aria-pressed={mode === "view"} onClick={() => setMode("view")}>
            View
          </button>
          <button type="button" className="btn primary" aria-pressed={mode === "edit"} onClick={() => setMode("edit")}>
            Edit report
          </button>
          <button type="button" className="btn" onClick={resetReport}>
            Reset layout
          </button>
          {savedNote && <span className="note">{savedNote}</span>}
        </div>
      </header>

      {anomaly && (
        <div className="insights-anomaly" role="status">
          <strong>
            Refund spike {anomaly.z.toFixed(1)} sigma above average (day {anomaly.day}, $
            {anomaly.amount.toFixed(2)})
          </strong>
          <button type="button" className="btn primary" onClick={openAnomalyThread}>
            Ask refund-sentinel
          </button>
        </div>
      )}

      {prefillPrompt && (
        <p className="note insights-prefill">
          Prefill for Studio AI: <em>{prefillPrompt}</em> — open Ask Studio and send this prompt.
        </p>
      )}

      <StudioShell
        key={dataEpoch}
        licenseKey={licenseKey ?? ""}
        data={studioData}
        mode={mode}
        initialState={initialState}
        onStateUpdated={onStateUpdated}
        ai={ai}
        widgets={widgets}
      />
    </main>
  );
}

function StudioShell({
  licenseKey,
  data,
  mode,
  initialState,
  onStateUpdated,
  ai,
  widgets,
}: {
  licenseKey: string;
  data: ReturnType<typeof buildStudioData>;
  mode: AgStudioMode;
  initialState: AgReportState<ShopCrewRegistry>;
  onStateUpdated: (event: { state: AgReportState }) => void;
  ai?: AgAiHarnessSetup;
  widgets: (defaults: AgWidgetsConfig) => AgWidgetsConfig<ShopCrewRegistry>;
}) {
  const modules = useMemo(() => (ai ? [AgStudioAiModule] : []), [ai]);
  const studioData = data as AgDataSourcesDefinition<ShopCrewRegistry>;

  return (
    <ErrorBoundary>
      <div className="studio-frame">
        <AgStudioProvider licenseKey={licenseKey || undefined} modules={modules}>
          <AgStudio<ShopCrewRegistry>
            style={{ height: "100%", width: "100%" }}
            theme={shopCrewStudioTheme}
            data={studioData}
            mode={mode}
            initialState={initialState}
            enableFilterEditingInViewMode
            onStateUpdated={onStateUpdated}
            widgets={widgets}
            ai={ai}
          />
        </AgStudioProvider>
      </div>
    </ErrorBoundary>
  );
}

class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean; message: string }> {
  state = { failed: false, message: "" };
  static getDerivedStateFromError(error: unknown) {
    return { failed: true, message: error instanceof Error ? error.message : "Studio failed to render" };
  }
  render() {
    if (this.state.failed) {
      return (
        <div className="error">
          AG Studio could not render ({this.state.message}). Advance a day in the control room so there is data, then reload.
        </div>
      );
    }
    return this.props.children;
  }
}
