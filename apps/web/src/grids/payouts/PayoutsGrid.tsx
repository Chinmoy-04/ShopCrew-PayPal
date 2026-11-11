import { useEffect, useRef, useState } from "react";
import type { ColDef, GridApi } from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import { api, type PayoutRow } from "../../api/client";
import { NegotiationTimeline } from "../../components/NegotiationTimeline";
import { onLive } from "../../hooks/useLiveEvents";
import { formatMoney, PayPalRef } from "../renderers";
import { gridTheme } from "../theme";
import { useGridState } from "../useGridState";

function PayoutDetail(props: { data: PayoutRow }) {
  const row = props.data;
  const timeline = [
    { label: "Created", at: row.createdAt },
    ...(row.status ? [{ label: row.status, at: (row as PayoutRow & { confirmedAt?: string }).confirmedAt ?? row.createdAt }] : []),
  ];
  return (
    <div className="detail">
      <p><strong>Payout to:</strong> {row.receiver} — <strong>${Number(row.amount).toFixed(2)}</strong> — {row.status}</p>
      <p className="note">Sender batch: {row.senderBatchId} | Payout item: {row.payoutItemId ?? "—"}</p>
      <ul className="status-timeline">
        {timeline.map((item) => (
          <li key={item.label}><strong>{item.label}</strong>{item.at && <span className="note"> · {new Date(item.at).toLocaleString()}</span>}</li>
        ))}
      </ul>
      {row.negotiation?.length && row.qty != null && row.quote != null ? (
        <NegotiationTimeline transcript={row.negotiation} quote={row.quote} qty={row.qty} />
      ) : <p className="note">No negotiation log for this payout.</p>}
    </div>
  );
}

export function PayoutsGrid({ onGrid }: { onGrid?: (api: GridApi) => void } = {}) {
  const [rows, setRows] = useState<PayoutRow[]>([]);
  const apiRef = useRef<GridApi | null>(null);
  const gridState = useGridState("payouts");
  const columnDefs: ColDef<PayoutRow>[] = [
    { field: "createdAt", cellRenderer: "agGroupCellRenderer", valueFormatter: (p) => (p.value ? new Date(p.value).toLocaleTimeString() : "") },
    { field: "sku" },
    { field: "receiver", flex: 1 },
    { field: "amount", valueFormatter: (p) => formatMoney(Number(p.value)) },
    { field: "status" },
    { field: "senderBatchId", headerName: "Sender batch", cellRenderer: PayPalRef },
    { field: "payoutBatchId", headerName: "Batch", cellRenderer: PayPalRef },
    { field: "payoutItemId", headerName: "Item", cellRenderer: PayPalRef },
  ];
  useEffect(() => {
    const load = () => void api.payouts().then(setRows);
    load();
    return onLive((event) => {
      if (event.type === "payout.upserted" && apiRef.current) {
        const payout = event.payout as PayoutRow;
        const exists = apiRef.current.getRowNode(payout.id);
        apiRef.current.applyTransactionAsync(exists ? { update: [payout] } : { add: [payout], addIndex: 0 });
      }
      if (event.type === "sim.reset") load();
    });
  }, []);
  return (
    <div className="grid-wrap">
      <AgGridReact defaultColDef={{ filter: true, sortable: true, resizable: true }}
        theme={gridTheme}
        rowData={rows}
        columnDefs={columnDefs}
        getRowId={(p) => p.data.id}
        cellFlashDuration={500}
        masterDetail
        detailCellRenderer={PayoutDetail}
        detailRowHeight={320}
        isRowMaster={() => true}
        initialState={gridState.initialState}
        onStateUpdated={gridState.onStateUpdated}
        onGridReady={(e) => {
          apiRef.current = e.api;
          gridState.onGridReady(e);
          onGrid?.(e.api);
        }}
      />
    </div>
  );
}
