import { useEffect, useMemo, useRef, useState } from "react";
import type { ColDef, GridApi } from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import { api, type OrderRow } from "../../api/client";
import { onLive } from "../../hooks/useLiveEvents";
import { useSimTime } from "../../hooks/SimTimeContext";
import { openIntegratedChart } from "../chartHelpers";
import { gridTheme } from "../theme";

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function timeOfDayLabel(iso: string | null | undefined) {
  if (!iso) return "";
  const date = new Date(iso);
  return `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
}

function msOfDayFromIso(iso: string) {
  const date = new Date(iso);
  return date.getUTCHours() * 3_600_000 + date.getUTCMinutes() * 60_000;
}

export function OrdersGrid() {
  const { simDay, msOfDay, autorun, paused } = useSimTime();
  const [allRows, setAllRows] = useState<OrderRow[]>([]);
  const apiRef = useRef<GridApi | null>(null);

  const columnDefs: ColDef<OrderRow>[] = [
    { field: "simDay", headerName: "Day", sort: "desc", width: 90, chartDataType: "category", enableRowGroup: true },
    {
      headerName: "Time",
      colId: "timeOfDay",
      width: 100,
      valueGetter: (p) => timeOfDayLabel(p.data?.createdAt),
      comparator: (_a, _b, nodeA, nodeB) =>
        msOfDayFromIso(nodeA?.data?.createdAt ?? "") - msOfDayFromIso(nodeB?.data?.createdAt ?? ""),
    },
    { field: "createdAt", headerName: "Date", valueFormatter: (p) => (p.value ? new Date(p.value).toLocaleDateString(undefined, { timeZone: "UTC" }) : "") },
    { field: "customer" },
    { field: "source", chartDataType: "category", enableRowGroup: true, filter: "agSetColumnFilter" },
    { field: "status", rowGroup: true, hide: true, chartDataType: "category" },
    {
      field: "total",
      valueFormatter: (p) => `$${Number(p.value ?? 0).toFixed(2)}`,
      chartDataType: "series",
      enableValue: true,
      aggFunc: "sum",
    },
    {
      field: "refundedTotal",
      headerName: "Refunded",
      valueFormatter: (p) => `$${Number(p.value ?? 0).toFixed(2)}`,
      chartDataType: "series",
      enableValue: true,
      aggFunc: "sum",
    },
    { field: "paypalOrderId", headerName: "PayPal order" },
    { field: "paypalCaptureId", headerName: "Capture" },
  ];

  useEffect(() => {
    void api.orders().then(setAllRows);
    return onLive((event) => {
      if (event.type === "order.upserted") {
        const order = event.order as OrderRow;
        if (!order?.id) return;
        setAllRows((prev) => {
          const index = prev.findIndex((row) => row.id === order.id);
          if (index >= 0) {
            const next = prev.slice();
            next[index] = order;
            return next;
          }
          return [order, ...prev];
        });
      }
      if (event.type === "sim.reset" || event.type === "sim.updated") void api.orders().then(setAllRows);
    });
  }, []);

  const visibleRows = useMemo(() => {
    if (!autorun || paused) return allRows;
    return allRows.filter((row) => {
      if (row.simDay < simDay) return true;
      if (row.simDay > simDay) return false;
      return msOfDayFromIso(row.createdAt) <= msOfDay;
    });
  }, [allRows, autorun, paused, simDay, msOfDay]);

  useEffect(() => {
    apiRef.current?.setGridOption("rowData", visibleRows);
  }, [visibleRows]);

  function handleCapturePool() {
    const token = prompt("Admin token?");
    if (!token) return;
    api.capturePool(token)
      .then((res) => alert(`✓ Capture pool linked:\n${res.mapping.map((o) => `${o.id} → ${o.paypalCaptureId ?? "—"}`).join("\n")}`))
      .catch((err: Error) => alert(`✗ ${err.message}`));
  }

  function chartRevenueByDay() {
    if (!apiRef.current) return;
    openIntegratedChart(apiRef.current, {
      chartType: "groupedColumn",
      columns: ["simDay", "total", "refundedTotal"],
      title: "Revenue by day",
      aggFunc: "sum",
    });
  }

  function chartRevenueBySource() {
    if (!apiRef.current) return;
    openIntegratedChart(apiRef.current, {
      chartType: "pie",
      columns: ["source", "total"],
      title: "Revenue by source",
      aggFunc: "sum",
    });
  }

  return (
    <>
      <div className="bar">
        <button type="button" className="btn" onClick={chartRevenueByDay}>Revenue by day</button>
        <button type="button" className="btn" onClick={chartRevenueBySource}>Revenue by source</button>
        <button type="button" className="btn" title="Link real PayPal captures so test refunds are live (not DRY)" onClick={handleCapturePool}>Link capture pool</button>
      </div>
      {autorun && !paused && (
        <p className="note">Showing orders up to {pad(Math.floor(msOfDay / 3_600_000))}:{pad(Math.floor((msOfDay % 3_600_000) / 60_000))} on day {simDay}.</p>
      )}
      <div className="grid-wrap">
        <AgGridReact
          theme={gridTheme}
          rowData={visibleRows}
          columnDefs={columnDefs}
          getRowId={(p) => p.data.id}
          cellFlashDuration={500}
          groupDisplayType="groupRows"
          groupDefaultExpanded={-1}
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
              { statusPanel: "agAggregationComponent", statusPanelParams: { aggFuncs: ["sum", "avg", "count"] }, align: "right" },
            ],
          }}
          onGridReady={(e) => { apiRef.current = e.api; }}
        />
      </div>
    </>
  );
}
