import { useCallback, useMemo, useRef } from "react";
import type { GridApi, GridReadyEvent, StateUpdatedEvent } from "ag-grid-community";

const PREFIX = "shopcrew-grid-state-v1:";

export function useGridState(gridId: string) {
  const apiRef = useRef<GridApi | null>(null);
  const storageKey = `${PREFIX}${gridId}`;

  const initialState = useMemo(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      return raw ? JSON.parse(raw) : undefined;
    } catch {
      return undefined;
    }
  }, [storageKey]);

  const onGridReady = useCallback((event: GridReadyEvent) => {
    apiRef.current = event.api;
  }, []);

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
