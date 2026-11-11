import type { ChartType, CreateRangeChartParams, GridApi } from "ag-grid-community";

/**
 * Integrated Charts need leaf rows. With collapsed groupRows, createRangeChart
 * often opens an empty "No data to display" pie/column. Ungroup briefly,
 * chart the filtered leaf rows, then restore the layout and expansion state.
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
  const columnState = api.getColumnState();
  const expanded = new Map<string, boolean>();
  api.forEachNode(node => { if (node.id) expanded.set(node.id, Boolean(node.expanded)); });
  const restore = () => {
    if (api.isDestroyed()) return;
    api.applyColumnState({ state: columnState, applyOrder: true });
    api.forEachNode(node => { if (node.id && (node.group || node.master)) node.setExpanded(expanded.get(node.id) ?? false); });
  };
  const groupIds = api.getRowGroupColumns().map((col) => col.getColId());
  if (groupIds.length) api.setRowGroupColumns([]);

  // Ensure category columns used by the chart are visible (hidden group cols break pies)
  for (const colId of columns) {
    api.setColumnsVisible([colId], true);
  }

  const rowCount = api.getDisplayedRowCount();
  if (rowCount <= 0) {
    restore();
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

  // The unlinked chart keeps its snapshot; viewing it must not change grid layout.
  requestAnimationFrame(restore);
}
