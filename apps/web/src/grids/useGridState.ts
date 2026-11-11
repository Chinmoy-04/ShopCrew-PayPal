import { useCallback, useMemo, useRef } from "react";
import type { GridApi, GridReadyEvent, StateUpdatedEvent } from "ag-grid-community";

const PREFIX = "shopcrew-grid-state-v1:";

export function useGridState(gridId: string) {
  const apiRef = useRef<GridApi | null>(null);
  const storageKey = `${PREFIX}${gridId}`;

  const initialState = useMemo(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return undefined;
      const saved = JSON.parse(raw);
      if (!saved || typeof saved !== "object" || Array.isArray(saved)) return undefined;
      if (typeof saved.version !== "string") return undefined;
      for (const [section, field] of [
        ["rowGroup", "groupColIds"], ["sort", "sortModel"],
        ["columnVisibility", "hiddenColIds"], ["columnOrder", "orderedColIds"],
        ["columnPinning", "leftColIds"], ["columnPinning", "rightColIds"],
        ["columnSizing", "columnSizingModel"], ["aggregation", "aggregationModel"],
      ]) {
        if (saved[section] !== undefined && (!saved[section] || typeof saved[section] !== "object"
          || (saved[section][field] !== undefined && !Array.isArray(saved[section][field])))) return undefined;
      }
      // AG Grid omits empty grouping from getState(). Explicitly restore that
      // choice rather than reapplying rowGroup defaults from column definitions.
      return { ...saved, rowGroup: saved.rowGroup ?? { groupColIds: [] } };
    } catch {
      return undefined;
    }
  }, [storageKey]);

  const onGridReady = useCallback((event: GridReadyEvent) => {
    apiRef.current = event.api;
    if (initialState) event.api.setRowGroupColumns(initialState.rowGroup.groupColIds);
  }, [initialState]);

  const onStateUpdated = useCallback((event: StateUpdatedEvent) => {
    try {
      const state = event.api.getState();
      localStorage.setItem(storageKey, JSON.stringify(state));
    } catch {
      /* ignore quota */
    }
  }, [storageKey]);

  const applyFilterModel = useCallback((filterModel: Record<string, unknown> | null) => {
    apiRef.current?.setFilterModel(filterModel);
  }, []);

  const getFilterModel = useCallback(() => apiRef.current?.getFilterModel() ?? null, []);

  return { initialState, onGridReady, onStateUpdated, applyFilterModel, getFilterModel, apiRef };
}
