import { useEffect, useRef, useState } from "react";
import type { ColDef, GridApi } from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import { api, type AuditRow } from "../../api/client";
import { onLive } from "../../hooks/useLiveEvents";
import { gridTheme } from "../theme";

export function AuditGrid() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const apiRef = useRef<GridApi | null>(null);
  const columnDefs: ColDef<AuditRow>[] = [
    { field: "ts", headerName: "Time", valueFormatter: (p) => (p.value ? new Date(p.value).toLocaleTimeString() : "") },
    { field: "actor" },
    { field: "agent" },
    { field: "event" },
    { field: "correlationId", rowGroup: true, hide: true },
    { field: "message", flex: 2 },
  ];
  useEffect(() => {
    const load = () => void api.audit().then(setRows);
    load();
    return onLive((event) => {
      if (event.type === "audit.appended" && apiRef.current) {
        const entry = event.entry as AuditRow;
        apiRef.current.applyTransactionAsync({ add: [entry], addIndex: 0 });
      }
      if (event.type === "sim.reset") load();
    });
  }, []);
  return (
    <>
      <div className="bar">
        <button className="btn" onClick={() => apiRef.current?.exportDataAsCsv()}>Export CSV</button>
        <button className="btn" onClick={() => apiRef.current?.exportDataAsExcel()}>Export Excel</button>
      </div>
      <div className="grid-wrap">
        <AgGridReact theme={gridTheme} rowData={rows} columnDefs={columnDefs} getRowId={(p) => p.data.id} groupDisplayType="groupRows" onGridReady={(e) => { apiRef.current = e.api; }} />
      </div>
    </>
  );
}
