import { useEffect, useRef, useState } from "react";
import type { ColDef, GridApi } from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import { api, type PayoutRow } from "../../api/client";
import { NegotiationTimeline } from "../../components/NegotiationTimeline";
import { onLive } from "../../hooks/useLiveEvents";
import { gridTheme } from "../theme";

function PayoutDetail(props: { data: PayoutRow }) {
  const row = props.data;
  return (
    <div className="detail">
      <p><strong>Payout to:</strong> {row.receiver} — <strong>${Number(row.amount).toFixed(2)}</strong> — {row.status}</p>
      <p className="note">Sender batch: {row.senderBatchId} | Payout item: {row.payoutItemId ?? "—"}</p>
      {row.negotiation?.length && row.qty != null && row.quote != null ? (
        <NegotiationTimeline transcript={row.negotiation} quote={row.quote} qty={row.qty} />
      ) : <p className="note">No negotiation log for this payout.</p>}
    </div>
  );
}

export function PayoutsGrid() {
  const [rows, setRows] = useState<PayoutRow[]>([]);
  const apiRef = useRef<GridApi | null>(null);
  const columnDefs: ColDef<PayoutRow>[] = [
    { field: "createdAt", valueFormatter: (p) => (p.value ? new Date(p.value).toLocaleTimeString() : "") },
    { field: "sku" },
    { field: "receiver", flex: 1 },
    { field: "amount", valueFormatter: (p) => `$${Number(p.value).toFixed(2)}` },
    { field: "status" },
    { field: "senderBatchId", headerName: "Sender batch" },
    { field: "payoutBatchId", headerName: "Batch" },
    { field: "payoutItemId", headerName: "Item" },
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
      <AgGridReact
        theme={gridTheme}
        rowData={rows}
        columnDefs={columnDefs}
        getRowId={(p) => p.data.id}
        cellFlashDuration={500}
        masterDetail
        detailCellRenderer={PayoutDetail}
        detailRowHeight={320}
        isRowMaster={() => true}
        onGridReady={(e) => { apiRef.current = e.api; }}
      />
    </div>
  );
}
