import type { AgReportState, AgFilterState } from "ag-studio";
import type { ShopCrewRegistry } from "./registry";

export const REPORT_KEY = "shopcrew-studio-report-v6";
export const LEGACY_REPORT_KEY = "shopcrew-studio-report-v5";
export type Report = AgReportState<ShopCrewRegistry>;
type StorageReader = Pick<Storage, "getItem">;
export function validReport(value: unknown): value is Report {
  if (!value || typeof value !== "object") return false;
  const report = value as Report;
  if (
    !Array.isArray(report.pages) ||
    !report.pages.length ||
    typeof report.selectedPageId !== "string"
  )
    return false;
  const ids = new Set<string>();
  return (
    report.pages.every((page) => {
      if (!page || typeof page.id !== "string" || ids.has(page.id))
        return false;
      ids.add(page.id);
      if (
        page.widgets &&
        (typeof page.widgets !== "object" || Array.isArray(page.widgets))
      )
        return false;
      if (
        Object.values(page.widgets ?? {}).some(
          (widget) =>
            !widget ||
            typeof widget.type !== "string" ||
            !widget.dataMapping ||
            typeof widget.dataMapping !== "object",
        )
      )
        return false;
      if (
        Object.values(page.widgetLayout ?? {}).some(
          (layout) =>
            !layout ||
            ![layout.xTrack, layout.yTrack, layout.xSpan, layout.ySpan].every(
              Number.isFinite,
            ) ||
            layout.xSpan <= 0 ||
            layout.ySpan <= 0,
        )
      )
        return false;
      return true;
    }) && ids.has(report.selectedPageId)
  );
}
export function loadReport(
  storage: StorageReader,
  fallback: Report,
): { report: Report; note: string; saved: boolean } {
  let damaged = false;
  for (const key of [REPORT_KEY, LEGACY_REPORT_KEY]) {
    try {
      const raw = storage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      const report =
        key === REPORT_KEY
          ? parsed.schemaVersion === 6 && parsed.report
          : parsed;
      if (validReport(report)) {
        const migrated = structuredClone(report);
        for (const page of migrated.pages) {
          const grid = page.widgets?.["decision-grid"];
          if (
            grid?.type === "grid" &&
            grid.dataMapping.cols.some((field) =>
              field.id.startsWith("decisions."),
            ) &&
            !grid.dataMapping.cols.some((field) => field.id === "decisions.id")
          )
            grid.dataMapping.cols.unshift({ id: "decisions.id" });
        }
        return {
          report: migrated,
          saved: true,
          note:
            key === LEGACY_REPORT_KEY
              ? "Your saved layout was preserved. Reset report to use the new overview."
              : "",
        };
      }
      damaged = true;
    } catch {
      damaged = true;
    }
  }
  return {
    report: structuredClone(fallback),
    saved: false,
    note: damaged
      ? "Saved report could not be read. The default report has been restored."
      : "",
  };
}
export const serializeReport = (report: Report) =>
  JSON.stringify({ schemaVersion: 6, report });

export interface Explorer {
  day: string;
  agent: string;
  status: string;
  money: string;
  preset?: "auto" | "committed";
}
export const defaultExplorer = (): Explorer => ({
  day: "today",
  agent: "",
  status: "",
  money: "",
});
const EXPLORER_FIELDS = new Set([
  "decisions.day",
  "decisions.agent",
  "decisions.status",
  "decisions.movesMoney",
  "decisions.decidedBy",
  "decisions.type",
]);
export function explorerFromReport(report: Report): Explorer {
  const filters =
    report.pages.find((page) => page.id === "operations")?.filter?.widget?.[
      "decision-grid"
    ] ?? [];
  const value = (id: string) =>
    filters.find((filter) => filter.field.id === id)?.model;
  const scalar = (id: string) => {
    const model = value(id);
    return model && "value" in model && !Array.isArray(model.value)
      ? String(model.value ?? "")
      : "";
  };
  return {
    day: scalar("decisions.day") || "all",
    agent: scalar("decisions.agent"),
    status: scalar("decisions.status"),
    money: scalar("decisions.movesMoney"),
    preset: value("decisions.decidedBy")
      ? "auto"
      : value("decisions.type")
        ? "committed"
        : undefined,
  };
}
export function applyExplorer(
  report: Report,
  scope: Explorer,
  today: number,
): Report {
  const filters: AgFilterState<ShopCrewRegistry>[] = [];
  const equal = (id: string, value: unknown) =>
    filters.push({ field: { id }, model: { operator: "equals", value } });
  if (scope.day !== "all")
    equal("decisions.day", scope.day === "today" ? today : Number(scope.day));
  if (scope.agent) equal("decisions.agent", scope.agent);
  if (scope.money) equal("decisions.movesMoney", scope.money);
  if (scope.status) equal("decisions.status", scope.status);
  if (scope.preset) {
    filters.push({
      field: { id: "decisions.status" },
      model: {
        operator: "OR",
        conditions: [
          "confirmed",
          "submitted",
          "executing",
          "auto_approved",
        ].map((value) => ({ operator: "equals", value })),
      },
    });
    if (scope.preset === "auto") equal("decisions.decidedBy", "policy");
    else
      filters.push({
        field: { id: "decisions.type" },
        model: {
          operator: "OR",
          conditions: ["refund", "payout"].map((value) => ({
            operator: "equals",
            value,
          })),
        },
      });
  }
  return {
    ...report,
    selectedPageId: "operations",
    pages: report.pages.map((page) => {
      if (page.id !== "operations") return page;
      const widget = { ...page.filter?.widget };
      for (const [id, definition] of Object.entries(page.widgets ?? {})) {
        if (
          !Object.values(definition?.dataMapping ?? {})
            .flat()
            .some((field) => field.id.startsWith("decisions."))
        )
          continue;
        widget[id] = [
          ...(widget[id] ?? []).filter(
            (filter) => !EXPLORER_FIELDS.has(filter.field.id),
          ),
          ...filters,
        ];
      }
      return {
        ...page,
        crossFilter: undefined,
        filter: { ...page.filter, widget },
      };
    }),
  };
}

/** Project only presentation. The caller retains canonical positions for persistence. */
export function projectReport(
  report: Report,
  width: number,
  editing: boolean,
): Report {
  if (width >= 1200 && !editing) return report;
  if (editing)
    return {
      ...report,
      pages: report.pages.map((page) => ({
        ...page,
        layout: {
          ...page.layout,
          minWidth: Math.max(1000, page.layout?.minWidth ?? 0),
        },
      })),
    };
  const phone = width < 768;
  return {
    ...report,
    pages: report.pages.map((page) => {
      const widgetLayout: NonNullable<typeof page.widgetLayout> = {};
      const entries = Object.entries(page.widgetLayout ?? {})
        .filter(
          (entry): entry is [string, NonNullable<(typeof entry)[1]>] =>
            !!entry[1],
        )
        .sort((a, b) => a[1].yTrack - b[1].yTrack || a[1].xTrack - b[1].xTrack);
      let y = 0,
        x = 0,
        rowHeight = 0;
      for (const [id, position] of entries) {
        const span = phone || position.xSpan > 12 ? 24 : 12;
        if (x + span > 24) {
          y += rowHeight;
          x = 0;
          rowHeight = 0;
        }
        const type = page.widgets?.[id]?.type;
        const height =
          type === "explorer-controls"
            ? phone
              ? 20
              : 12
            : type === "daily-metric" ||
                type === "live-brief" ||
                type === "value"
              ? Math.max(position.ySpan, 5)
              : Math.max(position.ySpan, 12);
        widgetLayout[id] = { xTrack: x, yTrack: y, xSpan: span, ySpan: height };
        x += span;
        rowHeight = Math.max(rowHeight, height);
      }
      return {
        ...page,
        widgetLayout,
        layout: { ...page.layout, minWidth: 0, columns: 24, height: undefined },
      };
    }),
  };
}
export function restoreCanonicalLayout(
  incoming: Report,
  canonical: Report,
): Report {
  return {
    ...incoming,
    pages: incoming.pages.map((page) => {
      const saved = canonical.pages.find((item) => item.id === page.id);
      return saved
        ? { ...page, widgetLayout: saved.widgetLayout, layout: saved.layout }
        : page;
    }),
  };
}
