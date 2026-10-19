import { useEffect, useState } from "react";
import type { ColDef, ICellRendererParams } from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import { api, type Kpis, type Policy } from "../../api/client";
import { onLive } from "../../hooks/useLiveEvents";
import { gridTheme } from "../theme";

function EnabledToggle(props: ICellRendererParams<Policy, boolean>) {
  const row = props.data;
  if (!row) return null;
  const on = Boolean(props.value);
  return (
    <button
      type="button"
      className={`badge ${on ? "confirmed" : "blocked"}`}
      onClick={() => {
        void api.savePolicy(row.agent, { enabled: !on }).then((next) => {
          props.node.setData({ ...row, ...next });
        });
      }}
    >
      {on ? "Active" : "Paused"}
    </button>
  );
}

function BudgetMeter(props: ICellRendererParams<Policy, number> & { kpis: Kpis | null }) {
  const value = Number(props.value ?? 0);
  const spend = props.kpis?.spendToday ?? 0;
  const pct = value > 0 ? Math.min(100, Math.round((spend / value) * 100)) : 0;
  const color = pct >= 90 ? "var(--bad)" : pct >= 60 ? "#c4860a" : "var(--good)";
  return (
    <div className="progress-cell">
      <span style={{ width: 52, fontSize: 12 }}>${value.toFixed(0)}</span>
      <div className="progress-bar" title={`${pct}% of daily budget used ($${spend.toFixed(0)} spent)`}>
        <div className="progress-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span style={{ fontSize: 11, color: "var(--muted)", width: 32 }}>{pct}%</span>
    </div>
  );
}

export function PoliciesGrid() {
  const [rows, setRows] = useState<Policy[]>([]);
  const [kpis, setKpis] = useState<Kpis | null>(null);

  const columnDefs: ColDef<Policy>[] = [
    { field: "agent", minWidth: 120 },
    { field: "enabled", headerName: "Status", cellRenderer: EnabledToggle, editable: false, width: 110 },
    {
      field: "autoApproveMax",
      headerName: "Auto-approve max $",
      editable: true,
      onCellValueChanged: (e) => { if (e.data) void api.savePolicy(e.data.agent, { autoApproveMax: Number(e.newValue) }); },
    },
    {
      field: "dailyBudget",
      headerName: "Daily budget",
      editable: true,
      cellRenderer: BudgetMeter,
      cellRendererParams: { kpis },
      onCellValueChanged: (e) => { if (e.data) void api.savePolicy(e.data.agent, { dailyBudget: Number(e.newValue) }); },
      minWidth: 180,
    },
    {
      field: "maxPctOfOrder",
      headerName: "Max % of order",
      editable: true,
      onCellValueChanged: (e) => { if (e.data) void api.savePolicy(e.data.agent, { maxPctOfOrder: Number(e.newValue) }); },
    },
    {
      field: "maxPriceChangePct",
      headerName: "Max price change %",
      editable: true,
      onCellValueChanged: (e) => { if (e.data) void api.savePolicy(e.data.agent, { maxPriceChangePct: Number(e.newValue) }); },
    },
    {
      field: "minMarginPct",
      headerName: "Min margin %",
      editable: true,
      onCellValueChanged: (e) => { if (e.data) void api.savePolicy(e.data.agent, { minMarginPct: Number(e.newValue) }); },
    },
  ];

  useEffect(() => {
    const load = () => {
      void api.policies().then(setRows);
      void api.kpis().then(setKpis).catch(() => undefined);
    };
    load();
    return onLive((event) => {
      if (event.type === "policy.updated" || event.type === "sim.reset" || event.type === "sim.updated") load();
    });
  }, []);

  return (
    <div className="grid-wrap">
      <AgGridReact
        theme={gridTheme}
        rowData={rows}
        columnDefs={columnDefs}
        getRowId={(p) => p.data.agent}
        getRowClass={(p) => (p.data?.enabled === false ? "row-paused" : "")}
        sideBar
        statusBar={{ statusPanels: [{ statusPanel: "agAggregationComponent", align: "right" }] }}
        cellSelection
      />
    </div>
  );
}
