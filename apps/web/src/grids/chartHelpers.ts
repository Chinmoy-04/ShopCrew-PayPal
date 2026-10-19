import type { ChartType, CreateRangeChartParams, GridApi } from "ag-grid-community";

/**
 * Integrated Charts need leaf rows. With collapsed groupRows, createRangeChart
 * often opens an empty "No data to display" pie/column. Expand, ungroup briefly,
 * chart all rows, then restore grouping.
 */
export function openIntegratedChart(
  api: GridApi,
  options: {
    chartType: ChartType;
    columns: string[];
    title: string;
    aggFunc?: CreateRangeChartParams["aggFunc"];
  },
) {
  const { chartType, columns, title, aggFunc = "sum" } = options;
  api.expandAll();

  const groupIds = api.getRowGroupColumns().map((col) => col.getColId());
  if (groupIds.length) api.setRowGroupColumns([]);

  // Ensure category columns used by the chart are visible (hidden group cols break pies)
  for (const colId of columns) {
    api.setColumnsVisible([colId], true);
  }

  const rowCount = api.getDisplayedRowCount();
  if (rowCount <= 0) {
    if (groupIds.length) api.setRowGroupColumns(groupIds);
    return;
  }

  api.createRangeChart({
    chartType,
    aggFunc,
    suppressChartRanges: true,
    unlinkChart: true,
    cellRange: {
      columns,
      rowStartIndex: 0,
      rowEndIndex: rowCount - 1,
    },
    chartThemeOverrides: {
      common: { title: { text: title, enabled: true } },
    },
  });

  // Restore grouping after the chart has snapped its data
  if (groupIds.length) {
    requestAnimationFrame(() => api.setRowGroupColumns(groupIds));
  }
}
