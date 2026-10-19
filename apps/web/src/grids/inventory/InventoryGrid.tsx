import { useEffect, useState } from "react";
import type { ColDef, ValueFormatterParams } from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import { api, type InventoryRow } from "../../api/client";
import { onLive } from "../../hooks/useLiveEvents";
import { gridTheme } from "../theme";

function hasDemand(row: InventoryRow | undefined | null) {
  return Number(row?.forecast ?? 0) > 0.05;
}

function isInfiniteCover(row: InventoryRow | undefined | null) {
  return !hasDemand(row) || Number(row?.daysOfCover ?? 0) >= 900;
}

function coverLabel(row: InventoryRow | undefined | null) {
  if (!row) return "";
  if (!hasDemand(row)) return "No demand";
  if (row.stock <= 0) return "0 (empty)";
  return row.daysOfCover.toFixed(1);
}

function stockStatus(row: InventoryRow | undefined | null) {
  if (!row) return "";
  if (row.stock <= 0 && hasDemand(row)) return "Out of stock";
  if (row.stock <= 0 && !hasDemand(row)) return "Empty · no demand";
  if (row.stock < row.reorderPoint) return "Reorder soon";
  if (isInfiniteCover(row)) return "In stock · quiet";
  if (row.daysOfCover < 7) return "Running low";
  return "Healthy";
}

function StatusBadge(props: { data?: InventoryRow }) {
  const label = stockStatus(props.data);
  if (!label) return null;
  const tone =
    label.startsWith("Out") || label.startsWith("Reorder") || label.startsWith("Running")
      ? "pending_approval"
      : label.startsWith("Empty")
        ? "neutral"
        : "confirmed";
  return <span className={`badge ${tone}`}>{label}</span>;
}

function InventoryDetail(props: { data: InventoryRow }) {
  const row = props.data;
  if (!row) return null;
  const spark = row.spark ?? [];
  const max = Math.max(...spark, 1);
  const status = stockStatus(row);
  return (
    <div className="detail proposal-detail">
      <div className="proposal-detail-header">
        <strong>{row.name}</strong>
        <span className="note">({row.sku})</span>
        <StatusBadge data={row} />
      </div>
      <p className="note">
        Days of cover = stock ÷ forecast/day.
        {isInfiniteCover(row)
          ? " Forecast is ~0, so cover is not meaningful (we do not show 999)."
          : ` Right now that is ${row.stock} ÷ ${row.forecast.toFixed(2)} ≈ ${row.daysOfCover.toFixed(1)} days.`}
      </p>
      <div className="inventory-reorder">
        <div>Stock: <strong>{row.stock}</strong></div>
        <div>Cover: <strong>{coverLabel(row)}</strong></div>
        <div>Reorder point: <strong>{row.reorderPoint}</strong></div>
        <div>Lead time: <strong>{row.leadTimeDays}</strong> days</div>
        <div>Forecast / day: <strong>{row.forecast.toFixed(2)}</strong> (MAPE {row.mape.toFixed(1)}%)</div>
        <div>Price: <strong>${row.price.toFixed(2)}</strong></div>
        <div>Competitor min: <strong>{row.competitorMin == null ? "—" : `$${row.competitorMin.toFixed(2)}`}</strong></div>
      </div>
      <p className="note">
        {status === "Out of stock" || status === "Reorder soon"
          ? "Inventory agent will propose a supplier order when cover falls inside the reorder point."
          : status === "Empty · no demand"
            ? "No forecasted sales, so the agent will not restock this SKU yet."
            : "Stock looks fine relative to lead time and forecast."}
      </p>
      {spark.length > 0 && (
        <div className="inventory-spark">
          <div className="note">Last 28 days demand</div>
          <div className="spark-bars" aria-hidden>
            {spark.map((v, i) => (
              <span
                key={i}
                className="spark-bar"
                style={{ height: `${Math.max(8, (v / max) * 100)}%` }}
                title={`${v}`}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function InventoryGrid() {
  const [rows, setRows] = useState<InventoryRow[]>([]);
  const columnDefs: ColDef<InventoryRow>[] = [
    { field: "sku", width: 100, pinned: "left" },
    { field: "name", flex: 1, minWidth: 160 },
    {
      headerName: "Status",
      colId: "stockStatus",
      minWidth: 140,
      valueGetter: (p) => stockStatus(p.data),
      cellRenderer: StatusBadge,
    },
    {
      field: "stock",
      width: 90,
      cellClassRules: {
        "risk-high": (p) => Number(p.value) <= 0 || Number(p.data?.stock) < Number(p.data?.reorderPoint),
        "risk-mid": (p) =>
          Number(p.value) > 0 &&
          Number(p.data?.stock) >= Number(p.data?.reorderPoint) &&
          hasDemand(p.data) &&
          Number(p.data?.daysOfCover) < 7,
        "risk-low": (p) =>
          Number(p.value) > 0 &&
          Number(p.data?.stock) >= Number(p.data?.reorderPoint) &&
          hasDemand(p.data) &&
          Number(p.data?.daysOfCover) >= 14,
      },
    },
    {
      field: "daysOfCover",
      headerName: "Days of cover",
      minWidth: 130,
      valueFormatter: (p: ValueFormatterParams<InventoryRow>) => coverLabel(p.data),
      tooltipValueGetter: (p) =>
        isInfiniteCover(p.data)
          ? "No meaningful forecast — cover is not stock÷demand right now"
          : `${p.data?.stock ?? 0} units ÷ ${Number(p.data?.forecast ?? 0).toFixed(2)} / day`,
      cellClassRules: {
        "risk-high": (p) => Number(p.data?.stock) <= 0 && hasDemand(p.data),
        "risk-mid": (p) => hasDemand(p.data) && Number(p.data?.daysOfCover) >= 3 && Number(p.data?.daysOfCover) < 7,
        // never paint the 999 sentinel as "healthy green"
        "risk-low": (p) =>
          hasDemand(p.data) && Number(p.data?.stock) > 0 && Number(p.data?.daysOfCover) >= 14 && Number(p.data?.daysOfCover) < 900,
      },
    },
    {
      field: "forecast",
      headerName: "Forecast / day",
      valueFormatter: (p) => Number(p.value ?? 0).toFixed(2),
    },
    { field: "reorderPoint", headerName: "Reorder at", width: 110 },
    { field: "leadTimeDays", headerName: "Lead days", editable: true, width: 100, onCellValueChanged: (e) => { if (e.data) void api.saveLeadTime(e.data.sku, Number(e.newValue)); } },
    { field: "price", valueFormatter: (p) => `$${Number(p.value).toFixed(2)}`, width: 90 },
    { field: "competitorMin", headerName: "Competitor", valueFormatter: (p) => (p.value == null ? "—" : `$${Number(p.value).toFixed(2)}`), width: 110 },
    {
      field: "spark",
      headerName: "28 days",
      minWidth: 140,
      cellRenderer: "agSparklineCellRenderer",
      cellRendererParams: { sparklineOptions: { type: "line" } },
    },
    { field: "mape", headerName: "MAPE", hide: true },
    { field: "elasticity", hide: true },
    { field: "r2", headerName: "R²", hide: true },
    { field: "lower", headerName: "Low", hide: true },
    { field: "upper", headerName: "High", hide: true },
  ];

  useEffect(() => {
    const load = () => void api.inventory().then(setRows);
    load();
    return onLive((event) => {
      if (event.type === "inventory.changed" || event.type === "sim.updated" || event.type === "sim.reset") load();
    });
  }, []);

  return (
    <div className="grid-wrap">
      <AgGridReact
        theme={gridTheme}
        rowData={rows}
        columnDefs={columnDefs}
        getRowId={(p) => p.data.id}
        masterDetail
        detailCellRenderer={InventoryDetail}
        detailRowHeight={260}
        isRowMaster={() => true}
        tooltipShowDelay={400}
        sideBar
        statusBar={{
          statusPanels: [
            { statusPanel: "agTotalAndFilteredRowCountComponent", align: "left" },
            { statusPanel: "agAggregationComponent", statusPanelParams: { aggFuncs: ["sum", "avg"] }, align: "right" },
          ],
        }}
      />
    </div>
  );
}
