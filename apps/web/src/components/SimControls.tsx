import { useEffect, useState } from "react";
import { api, type Kpis, type SimState } from "../api/client";
import { onLive } from "../hooks/useLiveEvents";
import { useSimTime } from "../hooks/SimTimeContext";
import { SimClock } from "./SimClock";

export function SimControls() {
  const { setSimMeta } = useSimTime();
  const [sim, setSim] = useState<SimState | null>(null);
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showSummary, setShowSummary] = useState(false);

  async function refresh() {
    const [nextSim, nextKpis] = await Promise.all([api.sim(), api.kpis()]);
    setSim(nextSim);
    setKpis(nextKpis);
    if (nextSim) {
      setSimMeta({ simDay: nextSim.simDay, autorun: nextSim.autorun, paused: nextSim.pausedAll });
    }
  }

  useEffect(() => {
    void refresh();
    return onLive((event) => {
      if (event.type === "sim.updated" || event.type === "sim.reset" || event.type === "proposal.upserted") void refresh();
    });
  }, []);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await action();
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="control-toolbar">
      <div className="control-toolbar-row">
        <SimClock compact />
        <div className="control-actions">
          <button className="btn primary" disabled={busy || sim?.pausedAll} onClick={() => run(() => api.advance())}>Advance day</button>
          <button className="btn" disabled={busy} onClick={() => run(() => api.autorun(!sim?.autorun))}>{sim?.autorun ? "Stop" : "Auto-run"}</button>
          <button className="btn" disabled={busy} onClick={() => run(() => api.pause(!sim?.pausedAll))}>{sim?.pausedAll ? "Resume" : "Pause"}</button>
          <button className="btn" disabled={busy} onClick={() => run(() => api.reset(window.prompt("Admin token", "demo") || ""))}>Reset</button>
        </div>
        {kpis && (
          <div className="control-kpis">
            <span title="Revenue today"><em>Rev</em> ${kpis.revenueToday.toFixed(0)}</span>
            <span title="Auto / manual approvals"><em>Auto</em> {kpis.autoApproved}/{kpis.manualApproved}</span>
            <span title="Spend vs daily budget"><em>Spend</em> ${kpis.spendToday.toFixed(0)}/${kpis.budget.toFixed(0)}</span>
            <span title="Pending approvals" className={kpis.pending > 0 ? "kpi-pending" : ""}><em>Pending</em> {kpis.pending}</span>
          </div>
        )}
        {kpis?.summary && (
          <button type="button" className="btn control-summary-toggle" onClick={() => setShowSummary((v) => !v)}>
            {showSummary ? "Hide log" : "Day log"}
          </button>
        )}
      </div>
      {showSummary && kpis?.summary && <p className="note control-summary">{kpis.summary}</p>}
      {error && <span className="note">{error}</span>}
    </div>
  );
}
