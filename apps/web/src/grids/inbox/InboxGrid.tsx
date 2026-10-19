import { useEffect, useState } from "react";
import type { ColDef, GridApi, GridReadyEvent } from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import { api, type MessageRow } from "../../api/client";
import { AskAgent } from "../../components/AskAgent";
import { onLive } from "../../hooks/useLiveEvents";
import { gridTheme } from "../theme";

function SentimentBadge(props: { value?: string | null }) {
  if (!props.value) return null;
  const emoji = props.value === "negative" ? "😠" : props.value === "positive" ? "😊" : "😐";
  return <span className={`badge ${props.value}`}>{emoji} {props.value}</span>;
}

function CategoryBadge(props: { value?: string | null }) {
  if (!props.value) return null;
  return <span className={`badge cat-${props.value.replace(/\s/g, "_").toLowerCase()}`}>{props.value}</span>;
}

function StatusBadge(props: { value?: string | null }) {
  if (!props.value) return null;
  return <span className={`badge ${String(props.value).replace(/\s/g, "_")}`}>{String(props.value).replace(/_/g, " ")}</span>;
}

function ActionBadge(props: { value?: string | null }) {
  if (!props.value) return null;
  const label = props.value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return <span className="badge action">{label}</span>;
}

function Detail(props: { data: MessageRow }) {
  const row = props.data;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function decide(action: "approve" | "reject") {
    if (!row.proposalId || busy) return;
    setBusy(true);
    setError("");
    try {
      if (action === "approve") await api.approve(row.proposalId);
      else await api.reject(row.proposalId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="detail">
      <div className="inbox-body">{row.body}</div>
      {row.draftReply && (
        <div className="inbox-draft">
          <div className="note">Draft reply from agent</div>
          <div className="inbox-draft-text">{row.draftReply}</div>
        </div>
      )}
      {row.agentReasoning && (
        <div className="inbox-reasoning">
          <div className="note">Agent reasoning</div>
          <div>{row.agentReasoning}</div>
        </div>
      )}
      {row.policyReasons?.length > 0 && (
        <div className="inbox-policy">
          <div className="note">Policy flags</div>
          <ul>
            {row.policyReasons.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        </div>
      )}
      {row.proposalId && row.proposalStatus === "pending_approval" && (
        <div className="actions" style={{ marginTop: 8 }}>
          <button className="btn primary" onClick={() => void decide("approve")} disabled={busy}>
            ✓ Approve draft reply
          </button>
          <button className="btn danger" onClick={() => void decide("reject")} disabled={busy}>
            ✗ Reject
          </button>
          {error && <span className="error">{error}</span>}
        </div>
      )}
      {row.proposalId && (
        <AskAgent proposalId={row.proposalId} proposalType={row.proposalType} />
      )}
    </div>
  );
}

export function InboxGrid({ onGrid }: { onGrid: (api: GridApi) => void }) {
  const [rows, setRows] = useState<MessageRow[]>([]);
  const [apiRef, setApiRef] = useState<GridApi | null>(null);

  async function load() {
    const next = await api.messages();
    setRows(next);
    apiRef?.setGridOption("rowData", next);
  }

  useEffect(() => {
    void load();
    return onLive((event) => {
      if (event.type === "sim.advanced" || event.type === "sim.reset") void load();
    });
  }, [apiRef]);

  const columnDefs: ColDef<MessageRow>[] = [
    { field: "simDay", headerName: "Day", width: 70, filter: "agNumberColumnFilter", sort: "desc" },
    { field: "customer", headerName: "Customer", minWidth: 130, filter: "agTextColumnFilter" },
    { field: "channel", headerName: "Channel", width: 100, filter: "agSetColumnFilter" },
    { field: "category", headerName: "Category", cellRenderer: CategoryBadge, minWidth: 140, filter: "agSetColumnFilter" },
    { field: "sentiment", headerName: "Sentiment", cellRenderer: SentimentBadge, width: 130, filter: "agSetColumnFilter" },
    { field: "body", headerName: "Message", flex: 2, minWidth: 220, filter: "agTextColumnFilter", autoHeight: true, wrapText: true },
    { field: "agentAction", headerName: "Agent action", cellRenderer: ActionBadge, minWidth: 140, filter: "agSetColumnFilter" },
    { field: "proposalStatus", headerName: "Decision", cellRenderer: StatusBadge, minWidth: 140, filter: "agSetColumnFilter" },
  ];

  return (
    <div className="grid-wrap">
      <AgGridReact
        theme={gridTheme}
        rowData={rows}
        columnDefs={columnDefs}
        getRowId={(p) => p.data.id}
        masterDetail
        detailCellRenderer={Detail}
        detailRowHeight={420}
        isRowMaster={() => true}
        sideBar
        statusBar={{ statusPanels: [{ statusPanel: "agTotalAndFilteredRowCountComponent", align: "left" }] }}
        onGridReady={(event: GridReadyEvent) => { setApiRef(event.api); onGrid(event.api); }}
      />
    </div>
  );
}
