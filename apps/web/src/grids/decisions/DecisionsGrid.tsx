import { useEffect, useMemo, useState } from "react";
import type { ColDef, GridApi, GridReadyEvent, IStatusPanelParams } from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import { api, type Proposal } from "../../api/client";
import { DecisionCard } from "../../components/DecisionCard";
import { ViewMenu, type NamedView } from "../../components/ViewMenu";
import { onLive } from "../../hooks/useLiveEvents";
import { openIntegratedChart } from "../chartHelpers";
import { formatMoney, PayPalRef, PolicyVerdict } from "../renderers";
import { gridTheme } from "../theme";
import { useGridState } from "../useGridState";

function ConfidenceBar(props: { value?: number | null }) {
  if (props.value == null) return null;
  const pct = Math.round(props.value * 100);
  const color = pct >= 75 ? "var(--good)" : pct >= 50 ? "#c4860a" : "var(--bad)";
  return (
    <div className="progress-cell">
      <div className="progress-bar">
        <div className="progress-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span style={{ fontSize: 11, width: 28 }}>{pct}%</span>
    </div>
  );
}

function RiskBar(props: { value?: number | null }) {
  if (props.value == null) return null;
  const score = Math.round(Number(props.value));
  const color = score < 40 ? "var(--good)" : score < 70 ? "#c4860a" : "var(--bad)";
  return (
    <div className="progress-cell">
      <div className="progress-bar">
        <div className="progress-fill" style={{ width: `${Math.min(100, score)}%`, background: color }} />
      </div>
      <span style={{ fontSize: 11, width: 28 }}>{score}</span>
    </div>
  );
}

function rollbackDisabled(row: Proposal): { disabled: boolean; title: string } {
  if (row.type === "refund") return { disabled: true, title: "Refunds cannot be reversed" };
  if (row.type === "payout" || row.type === "purchase_order") {
    if (row.payoutStatus !== "UNCLAIMED") return { disabled: true, title: "Only an unclaimed payout can be cancelled" };
    return { disabled: false, title: "Cancel unclaimed payout" };
  }
  if (row.type === "price_change") {
    const ok = ["confirmed", "submitted", "auto_approved"].includes(row.status);
    return { disabled: !ok, title: ok ? "Restore previous price" : "Nothing to restore yet" };
  }
  return { disabled: true, title: "Rollback not available" };
}

function Actions(props: { data: Proposal }) {
  const row = props.data;
  if (!row?.id || row.id === "pending-total") return null;
  const pending = row.status === "pending_approval";
  const rb = rollbackDisabled(row);
  const amountLabel = row.amount != null ? ` $${Number(row.amount).toFixed(2)}` : "";
  return (
    <div className="actions">
      <button disabled={!pending} title={pending ? `Approve final amount${amountLabel}` : ""} onClick={() => api.approve(row.id)}>
        Approve{pending && amountLabel ? amountLabel : ""}
      </button>
      <button disabled={!pending} onClick={() => api.reject(row.id)}>Reject</button>
      <button disabled={rb.disabled} title={rb.title} onClick={() => void api.rollback(row.id)}>Rollback</button>
    </div>
  );
}

function Detail(props: { data: Proposal }) {
  return <DecisionCard row={props.data} />;
}

function OpsSummary(props: IStatusPanelParams) {
  const [summary, setSummary] = useState("Pending: $0.00 | Auto: 0 | Manual: 0");

  useEffect(() => {
    function refresh() {
      let pendingAmt = 0;
      let pendingCount = 0;
      let autoCount = 0;
      let manualCount = 0;
      props.api.forEachNode((node) => {
        const row = node.data as Proposal | undefined;
        if (!row?.id || row.id === "pending-total") return;
        if (row.status === "pending_approval") {
          pendingAmt += row.amount ?? 0;
          pendingCount += 1;
        }
        if (row.status === "auto_approved") autoCount += 1;
        if (row.decidedBy === "owner" || row.status === "confirmed") manualCount += 1;
      });
      setSummary(`Pending: $${pendingAmt.toFixed(2)} (${pendingCount}) | Auto: ${autoCount} | Manual: ${manualCount}`);
    }
    refresh();
    props.api.addEventListener("modelUpdated", refresh);
    props.api.addEventListener("rowDataUpdated", refresh);
    return () => {
      props.api.removeEventListener("modelUpdated", refresh);
      props.api.removeEventListener("rowDataUpdated", refresh);
    };
  }, [props.api]);

  return <span className="note" style={{ padding: "0 8px" }}>{summary}</span>;
}

export function DecisionsGrid({ onGrid, focusId }: { onGrid: (api: GridApi) => void; focusId?: string | null }) {
  const [rows, setRows] = useState<Proposal[]>([]);
  const [apiRef, setApiRef] = useState<GridApi | null>(null);
  const [view, setView] = useState<NamedView>("needs");
  const [editError, setEditError] = useState("");
  const gridState = useGridState("decisions");

  async function load() {
    const next = await api.proposals();
    setRows(next);
    apiRef?.setGridOption("rowData", next);
  }

  useEffect(() => {
    void load();
    return onLive((event) => {
      if (event.type === "proposal.upserted" && apiRef) {
        const proposal = event.proposal as Proposal;
        const exists = apiRef.getRowNode(proposal.id);
        apiRef.applyTransactionAsync(exists ? { update: [proposal] } : { add: [proposal], addIndex: 0 });
      }
      if (event.type === "sim.reset") void load();
    });
  }, [apiRef]);

  useEffect(() => {
    if (!focusId || !apiRef) return;
    const node = apiRef.getRowNode(focusId);
    if (!node) return;
    node.setExpanded(true);
    apiRef.ensureNodeVisible(node, "middle");
    node.setSelected(true);
  }, [focusId, apiRef, rows]);

  const pending = rows.filter((row) => row.status === "pending_approval").reduce((sum, row) => sum + (row.amount ?? 0), 0);

  function chartSpendByAgent() {
    if (!apiRef) return;
    openIntegratedChart(apiRef, {
      chartType: "groupedColumn",
      columns: ["agent", "amount"],
      title: "Spend by agent",
      aggFunc: "sum",
    });
  }

  function chartStatusBreakdown() {
    if (!apiRef) return;
    openIntegratedChart(apiRef, {
      chartType: "pie",
      columns: ["status", "amount"],
      title: "Status breakdown",
      aggFunc: "sum",
    });
  }

  const columnDefs: ColDef<Proposal>[] = useMemo(() => [
    { field: "status", headerName: "Verdict", cellRenderer: PolicyVerdict, filter: "agSetColumnFilter", chartDataType: "category", enableRowGroup: true, width: 130 },
    {
      field: "type",
      headerName: "Kind",
      filter: "agSetColumnFilter",
      enableRowGroup: true,
      width: 110,
      valueFormatter: (p) => {
        if (p.value === "reply") return "Reply";
        if (p.value === "refund") return "Refund";
        if (p.value === "payout") return "Payout";
        if (p.value === "price_change") return "Price";
        if (p.value === "discount") return "Discount";
        return String(p.value ?? "");
      },
    },
    {
      field: "summary",
      headerName: "What the agent wants",
      flex: 1,
      minWidth: 220,
      cellRenderer: (p: { data?: Proposal; value?: string }) => (
        <span>
          {p.data?.editedByOwner && <span className="badge edited" title="Edited by you">edited</span>}{" "}
          {p.value}
        </span>
      ),
    },
    {
      field: "amount",
      headerName: "Amount",
      editable: (p) => p.data?.status === "pending_approval",
      valueFormatter: (p) => (p.value == null || p.data?.type === "reply" ? "—" : formatMoney(Number(p.value))),
      onCellValueChanged: (e) => {
        if (!e.data?.id || !e.node) return;
        const previous = e.oldValue;
        const node = e.node;
        void api.edit(e.data.id, Number(e.newValue)).then((updated) => {
          setEditError("");
          node.setData(updated);
        }).catch((err: Error) => {
          setEditError(err.message);
          node.setDataValue("amount", previous);
        });
      },
      chartDataType: "series",
      enableValue: true,
      aggFunc: "sum",
      width: 110,
    },
    { field: "confidenceModel", headerName: "Confidence", cellRenderer: ConfidenceBar, minWidth: 110 },
    { field: "riskScore", headerName: "Risk", cellRenderer: RiskBar, minWidth: 90 },
    { field: "paypalRef", headerName: "PayPal", cellRenderer: PayPalRef, minWidth: 140 },
    { field: "createdAt", headerName: "Time", width: 90, valueFormatter: (p) => (p.value ? new Date(p.value).toLocaleTimeString() : "") },
    { field: "agent", rowGroup: true, hide: true, enableRowGroup: true, chartDataType: "category" },
    {
      colId: "editedByOwner",
      headerName: "Edited",
      hide: true,
      filter: "agSetColumnFilter",
      valueGetter: (p) => (p.data?.editedByOwner ? "true" : "false"),
    },
    { field: "targetRef", headerName: "Target", hide: true },
    { field: "policyResult", headerName: "Policy", hide: true },
    { field: "decidedBy", filter: "agSetColumnFilter", hide: true },
    { field: "reason", filter: "agTextColumnFilter", hide: true },
    { field: "simDay", filter: "agNumberColumnFilter", hide: true },
    { headerName: "Actions", cellRenderer: Actions, sortable: false, filter: false, minWidth: 260, pinned: "right" },
  ], []);

  return (
    <div className="grid-panel">
      <div className="grid-toolbar">
        <ViewMenu api={apiRef} active={view} onSelect={setView} />
        <button type="button" className="btn" onClick={chartSpendByAgent}>Chart spend</button>
        <button type="button" className="btn" onClick={chartStatusBreakdown}>Chart status</button>
        <span className="note">Expand a row for reasoning / tool trace / PayPal ids</span>
      </div>
      {editError && <div className="error">{editError}</div>}
      <div className="grid-wrap">
        <AgGridReact
          theme={gridTheme}
          rowData={rows}
          columnDefs={columnDefs}
          getRowId={(p) => p.data.id}
          cellFlashDuration={500}
          masterDetail
          detailCellRenderer={Detail}
          detailRowHeight={480}
          isRowMaster={(p) => Boolean(p.data?.id && p.data.id !== "pending-total")}
          groupDisplayType="groupRows"
          groupDefaultExpanded={1}
          enableCharts
          cellSelection
          initialState={gridState.initialState}
          onStateUpdated={gridState.onStateUpdated}
          sideBar={{
            toolPanels: [
              "columns",
              "filters",
              { id: "charts", labelDefault: "Charts", labelKey: "charts", iconKey: "chart", toolPanel: "agChartsToolPanel" },
            ],
          }}
          statusBar={{
            statusPanels: [
              { statusPanel: "agTotalAndFilteredRowCountComponent", align: "left" },
              { statusPanel: OpsSummary, align: "left" },
              { statusPanel: "agAggregationComponent", statusPanelParams: { aggFuncs: ["sum", "avg", "count"] }, align: "right" },
            ],
          }}
          pinnedTopRowData={[{ id: "pending-total", summary: "Pending total (money waiting on you)", amount: pending, status: "" } as Proposal]}
          getContextMenuItems={(params) => [
            {
              name: "Approve selected under $50",
              action: () => {
                const ids = params.api.getSelectedRows().map((row) => row.id).filter(Boolean);
                void api.approveSelected(ids, 50).then(load);
              },
            },
            "separator",
            "chartRange",
            ...(params.defaultItems ?? []),
          ]}
          rowSelection={{ mode: "multiRow" }}
          onGridReady={(event: GridReadyEvent) => {
            setApiRef(event.api);
            onGrid(event.api);
            gridState.onGridReady(event);
            if (!gridState.initialState) {
              event.api.setFilterModel({ status: { filterType: "set", values: ["pending_approval"] } });
            }
          }}
        />
      </div>
    </div>
  );
}
