import { useEffect, useMemo, useState } from "react";
import type { ColDef, GridApi, GridReadyEvent, IStatusPanelParams } from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import { api, type NegoStep, type Proposal } from "../../api/client";
import { AskAgent } from "../../components/AskAgent";
import { NegotiationTimeline } from "../../components/NegotiationTimeline";
import { onLive } from "../../hooks/useLiveEvents";
import { openIntegratedChart } from "../chartHelpers";
import { gridTheme } from "../theme";

function Badge(props: { value?: string | null }) {
  if (!props.value) return null;
  return <span className={`badge ${props.value}`}>{String(props.value).replace(/_/g, " ")}</span>;
}

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

function Actions(props: { data: Proposal }) {
  const row = props.data;
  if (!row?.id || row.id === "pending-total") return null;
  const pending = row.status === "pending_approval";
  const done = ["confirmed", "submitted", "rolled_back"].includes(row.status);
  return (
    <div className="actions">
      <button disabled={!pending} onClick={() => api.approve(row.id)}>Approve</button>
      <button disabled={!pending} onClick={() => api.reject(row.id)}>Reject</button>
      <button disabled={!done && row.status !== "confirmed"} onClick={() => api.rollback(row.id)}>Rollback</button>
    </div>
  );
}

function typeLabel(type: string) {
  if (type === "reply") return "Customer reply (no money moves)";
  if (type === "refund") return "Refund proposal";
  if (type === "payout") return "Supplier payout";
  if (type === "price_change") return "Price change";
  if (type === "discount") return "Discount proposal";
  return type.replace(/_/g, " ");
}

function typeHint(type: string) {
  if (type === "reply") return "The agent will send a message only. Approving this does not refund or charge anyone.";
  if (type === "refund") return "Approving sends a PayPal refund on the captured order.";
  if (type === "payout") return "Approving pays the supplier through PayPal Payouts.";
  if (type === "price_change") return "Approving updates the shop price. You can roll it back later.";
  if (type === "discount") return "Approving applies a temporary discount if policy allows.";
  return "Review the agent reasoning and policy before you approve.";
}

function Detail(props: { data: Proposal }) {
  const row = props.data;
  const inputs = row.inputs as { quote?: number; qty?: number } | null;
  const trace = row.trace as NegoStep[] | null;
  const toolArgs = row.toolArgs as { body?: string } | null;
  const draftReply = row.type === "reply" ? toolArgs?.body : null;

  return (
    <div className="detail proposal-detail">
      <div className="proposal-detail-header">
        <span className={`badge ${row.type}`}>{typeLabel(row.type)}</span>
        {row.status && <span className={`badge ${row.status}`}>{String(row.status).replace(/_/g, " ")}</span>}
        {row.amount != null && row.type !== "reply" && (
          <span className="proposal-detail-amount">${Number(row.amount).toFixed(2)}</span>
        )}
      </div>
      <p className="note proposal-detail-hint">{typeHint(row.type)}</p>

      <div className="proposal-detail-block">
        <div className="note">What the agent decided</div>
        <p><strong>{row.summary}</strong></p>
        <p>{row.reasoning}</p>
      </div>

      {draftReply && (
        <div className="proposal-detail-block inbox-draft">
          <div className="note">Draft customer reply</div>
          <div className="inbox-draft-text">{draftReply}</div>
        </div>
      )}

      {row.policyResult && (
        <div className="proposal-detail-block">
          <div className="note">Policy check</div>
          <p>{row.policyResult}</p>
        </div>
      )}

      {row.type === "payout" && trace?.length && inputs?.quote != null && inputs?.qty != null && (
        <NegotiationTimeline transcript={trace} quote={inputs.quote} qty={inputs.qty} />
      )}

      <details className="proposal-detail-raw">
        <summary className="note">Technical details (for debugging)</summary>
        <pre style={{ fontSize: 11, overflow: "auto", maxHeight: 120 }}>{JSON.stringify({ tool: row.toolName, args: row.toolArgs, trace: row.trace }, null, 2)}</pre>
      </details>

      {row.id && row.id !== "pending-total" && (
        <AskAgent proposalId={row.id} proposalType={row.type} />
      )}
    </div>
  );
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

export function DecisionsGrid({ onGrid }: { onGrid: (api: GridApi) => void }) {
  const [rows, setRows] = useState<Proposal[]>([]);
  const [apiRef, setApiRef] = useState<GridApi | null>(null);

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

  const pending = rows.filter((row) => row.status === "pending_approval").reduce((sum, row) => sum + (row.amount ?? 0), 0);

  function applyView(kind: "needs" | "refunds" | "all") {
    if (!apiRef) return;
    if (kind === "all") {
      apiRef.setFilterModel(null);
      return;
    }
    if (kind === "needs") {
      apiRef.setFilterModel({ status: { filterType: "set", values: ["pending_approval"] } });
      return;
    }
    apiRef.setFilterModel({ type: { filterType: "set", values: ["refund"] } });
  }

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
    { field: "status", headerName: "Status", cellRenderer: Badge, filter: "agSetColumnFilter", chartDataType: "category", enableRowGroup: true, width: 140 },
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
    { field: "summary", headerName: "What the agent wants", flex: 1, minWidth: 220 },
    {
      field: "amount",
      headerName: "Amount",
      editable: (p) => p.data?.status === "pending_approval",
      valueFormatter: (p) => (p.value == null || p.data?.type === "reply" ? "—" : `$${Number(p.value).toFixed(2)}`),
      onCellValueChanged: (e) => { if (e.data?.id) void api.edit(e.data.id, Number(e.newValue)); },
      chartDataType: "series",
      enableValue: true,
      aggFunc: "sum",
      width: 110,
    },
    { field: "confidenceModel", headerName: "Confidence", cellRenderer: ConfidenceBar, minWidth: 110 },
    { field: "riskScore", headerName: "Risk", cellRenderer: RiskBar, minWidth: 90 },
    { field: "createdAt", headerName: "Time", width: 90, valueFormatter: (p) => (p.value ? new Date(p.value).toLocaleTimeString() : "") },
    { field: "agent", rowGroup: true, hide: true, enableRowGroup: true, chartDataType: "category" },
    { field: "targetRef", headerName: "Target", hide: true },
    { field: "policyResult", headerName: "Policy", hide: true },
    { field: "decidedBy", filter: "agSetColumnFilter", hide: true },
    { field: "reason", filter: "agTextColumnFilter", hide: true },
    { field: "simDay", filter: "agNumberColumnFilter", hide: true },
    { field: "paypalRef", headerName: "PayPal", hide: true },
    { headerName: "Actions", cellRenderer: Actions, sortable: false, filter: false, minWidth: 210, pinned: "right" },
  ], []);

  return (
    <div className="grid-panel">
      <div className="grid-toolbar">
        <div className="preset-chips">
          <button type="button" className="preset-chip" onClick={() => applyView("needs")}>Needs approval</button>
          <button type="button" className="preset-chip" onClick={() => applyView("refunds")}>Refunds</button>
          <button type="button" className="preset-chip" onClick={() => applyView("all")}>Everything</button>
        </div>
        <button type="button" className="btn" onClick={chartSpendByAgent}>Chart spend</button>
        <button type="button" className="btn" onClick={chartStatusBreakdown}>Chart status</button>
        <span className="note">Expand a row for draft reply / negotiation / ask why</span>
      </div>
      <div className="grid-wrap">
        <AgGridReact
          theme={gridTheme}
          rowData={rows}
          columnDefs={columnDefs}
          getRowId={(p) => p.data.id}
          cellFlashDuration={500}
          masterDetail
          detailCellRenderer={Detail}
          detailRowHeight={420}
          isRowMaster={(p) => Boolean(p.data?.id && p.data.id !== "pending-total")}
          groupDisplayType="groupRows"
          groupDefaultExpanded={1}
          enableCharts
          cellSelection
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
            // Start on the work queue — not 40+ already-confirmed replies
            event.api.setFilterModel({ status: { filterType: "set", values: ["pending_approval"] } });
          }}
        />
      </div>
    </div>
  );
}
