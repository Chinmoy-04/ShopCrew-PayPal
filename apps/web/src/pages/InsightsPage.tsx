import { Component, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
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
  const [initialState] = useState<AgReportState<ShopCrewRegistry>>(
    () => (loadSavedReport() as AgReportState<ShopCrewRegistry> | null) ?? shopCrewReport,
  );
  const [savedNote, setSavedNote] = useState("");

  useEffect(() => {
    api
      .insights()
      .then((data) => setPayload(data as InsightsPayload))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load insights"));
  }, []);

  const studioData = useMemo(() => (payload ? buildStudioData(payload) : null), [payload]);

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
            AG Studio report with ShopCrew widgets{studioAiEnabled ? " and AI assistant" : ""}.
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

      {payload.kpis.summary && <p className="note insights-summary">{payload.kpis.summary}</p>}

      <StudioShell
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
  // Formats/buckets stay default; widgets are the only registry extension.
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
