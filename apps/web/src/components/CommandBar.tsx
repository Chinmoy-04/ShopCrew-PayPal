import { FormEvent, useEffect, useState } from "react";
import type { GridApi } from "ag-grid-community";
import { api } from "../api/client";

const PRESETS = [
  { label: "Needs approval", query: "show pending approval" },
  { label: "Refunds over $20", query: "show refunds over $20" },
  { label: "Blocked by policy", query: "blocked by policy" },
  { label: "Group by agent", query: "group by agent" },
  { label: "Approved by me", query: "approved by me" },
];

export function CommandBar({ grid, getApi, onGrid }: { grid: string; getApi: () => GridApi | null; onGrid: (name: string) => Promise<GridApi | null> }) {
  const [query, setQuery] = useState("show refunds over $20");
  const [explanation, setExplanation] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [chips, setChips] = useState<string[]>([]);
  const [undoState, setUndoState] = useState<{ filterModel: unknown; rowGroupCols: string[] } | null>(null);

  useEffect(() => { setUndoState(null); setChips([]); setExplanation(""); }, [grid]);
  async function run(nextQuery: string) {
    if (busy || !nextQuery.trim()) return;
    setError("");
    setBusy(true);
    setQuery(nextQuery);
    const gridApi = getApi();
    let schema: unknown = null;
    let state: unknown = null;
    try {
      schema = gridApi && "getStructuredSchema" in gridApi
        ? (gridApi as GridApi & { getStructuredSchema: (o?: unknown) => unknown }).getStructuredSchema({ exclude: ["columnSizing", "pivot"] })
        : null;
      state = gridApi?.getState();
    } catch {
      schema = null;
    }
    try {
      let previous = {
        filterModel: gridApi?.getFilterModel() ?? null,
        rowGroupCols: gridApi?.getRowGroupColumns().map((col) => col.getColId()) ?? [],
      };
      const result = await api.nl(nextQuery, grid, state, schema);
      const target = result.grid && result.grid !== grid ? await onGrid(result.grid) : getApi();
      if (!target || target.isDestroyed()) throw new Error("Grid is not ready");
      if (result.grid && result.grid !== grid) previous = {
        filterModel: target.getFilterModel(), rowGroupCols: target.getRowGroupColumns().map(col => col.getColId()),
      };
      setExplanation(result.explanation);
      setUndoState(previous);

      if (result.gridState && target) {
        const known = new Set(target.getColumns()?.map((col) => col.getColId()) ?? []);
        // Drop unknown columns before setState when possible.
        void known;
        target.setState(result.gridState as never, result.propertiesToIgnore as never);
      } else if (result.simple && target) {
        target.setFilterModel(result.simple.filterModel);
        target.setRowGroupColumns(result.simple.rowGroupCols);
      }
      const applied: string[] = [];
      const fm = result.simple?.filterModel ?? {};
      for (const [key, value] of Object.entries(fm)) {
        applied.push(`${key}: ${JSON.stringify(value)}`);
      }
      if (result.simple?.rowGroupCols?.length) applied.push(`group: ${result.simple.rowGroupCols.join(",")}`);
      setChips(applied);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not apply that");
    } finally {
      setBusy(false);
    }
  }

  function undo() {
    const target = getApi();
    if (!target || !undoState) return;
    target.setFilterModel(undoState.filterModel as never);
    target.setRowGroupColumns(undoState.rowGroupCols);
    setChips([]);
    setExplanation("Reverted the last grid filter.");
    setUndoState(null);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    await run(query);
  }

  return (
    <div className="command-bar">
      <div className="preset-chips">
        {PRESETS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            className="preset-chip"
            disabled={busy}
            onClick={() => void run(preset.query)}
          >
            {preset.label}
          </button>
        ))}
      </div>
      <form className="command-bar-form" onSubmit={submit}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Ask the grid"
          disabled={busy}
          placeholder="Ask the grid in plain English…"
        />
        <button className="btn primary" type="submit" disabled={busy}>{busy ? "…" : "Apply"}</button>
        <button className="btn" type="button" disabled={!undoState || busy} onClick={undo}>Undo</button>
      </form>
      {!!chips.length && (
        <div className="preset-chips applied-chips">
          {chips.map((chip) => (
            <span key={chip} className="preset-chip active">{chip}</span>
          ))}
        </div>
      )}
      {(explanation || error) && (
        <div className="command-bar-feedback">
          {explanation && <span className="note">{explanation}</span>}
          {error && <span className="error">{error}</span>}
        </div>
      )}
    </div>
  );
}
