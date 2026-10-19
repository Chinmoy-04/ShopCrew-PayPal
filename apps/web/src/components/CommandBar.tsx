import { FormEvent, useState } from "react";
import type { GridApi } from "ag-grid-community";
import { api } from "../api/client";

const PRESETS = [
  { label: "Needs approval", query: "show pending approval" },
  { label: "Refunds", query: "show refunds" },
  { label: "Auto-approved", query: "show auto approved today" },
];

export function CommandBar({ grid, getApi, onGrid }: { grid: string; getApi: () => GridApi | null; onGrid: (name: string) => void }) {
  const [query, setQuery] = useState("show pending approval");
  const [explanation, setExplanation] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function run(nextQuery: string) {
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
      const result = await api.nl(nextQuery, grid, state, schema);
      if (result.grid && result.grid !== grid) onGrid(result.grid);
      setExplanation(result.explanation);
      await Promise.resolve();
      const target = getApi();
      if (result.gridState && target) {
        target.setState(result.gridState as never, result.propertiesToIgnore as never);
      } else if (result.simple && target) {
        target.setFilterModel(result.simple.filterModel);
        if (result.simple.rowGroupCols.length) target.setRowGroupColumns(result.simple.rowGroupCols);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not apply that");
    } finally {
      setBusy(false);
    }
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
      </form>
      {(explanation || error) && (
        <div className="command-bar-feedback">
          {explanation && <span className="note">{explanation}</span>}
          {error && <span className="error">{error}</span>}
        </div>
      )}
    </div>
  );
}
