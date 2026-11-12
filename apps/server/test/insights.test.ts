import { describe, expect, it } from "vitest";
import { dailyInsights, refundAnomalies } from "@shopcrew/shared";
import {
  applyExplorer,
  defaultExplorer,
  loadReport,
  projectReport,
  restoreCanonicalLayout,
  serializeReport,
  REPORT_KEY,
  LEGACY_REPORT_KEY,
  type Report,
} from "../../web/src/studio/report-state";

const decision = (
  id: string,
  simDay: number,
  amount: number,
  status = "confirmed",
  agent = "cs",
  type = "refund",
) => ({ id, simDay, amount, status, agent, type, decidedBy: "policy" });
describe("daily Insights definitions", () => {
  it("uses daily monetary commitments and a weighted shop budget, retaining older approvals", () => {
    const result = dailyInsights(
      [
        decision("a", 7, 25),
        decision("b", 7, 25, "executing", "supplier", "payout"),
        decision("c", 6, 900),
        decision("d", 6, 20, "pending_approval"),
        decision("e", 7, 20, "pending_approval"),
        decision("f", 7, 100, "confirmed", "pricing", "price_change"),
        decision("pending-total", 7, 999),
      ],
      [
        { agent: "cs", dailyBudget: 100 },
        { agent: "supplier", dailyBudget: 900 },
      ],
      7,
    );
    expect(result).toMatchObject({
      committed: 50,
      budget: 1000,
      utilization: 0.05,
      pendingAll: 2,
      pendingEarlier: 1,
      autoApproved: 3,
      estimatedHours: 0.6,
      decisions: 4,
    });
    expect(result.agents.map((row) => row.spent)).toEqual([25, 25]);
  });
  it("distinguishes no configured budget from zero utilization and retains over-budget ratios", () => {
    expect(dailyInsights([], [], 0).utilization).toBeNull();
    expect(
      dailyInsights([], [{ agent: "cs", dailyBudget: 100 }], 0).utilization,
    ).toBe(0);
    expect(
      dailyInsights(
        [decision("a", 0, 150)],
        [{ agent: "cs", dailyBudget: 100 }],
        0,
      ).utilization,
    ).toBe(1.5);
  });
  it("shares daily aggregation, minimum observations and inclusive anomaly boundaries", () => {
    expect(
      refundAnomalies([
        { day: 1, amount: 4 },
        { day: 1, amount: 5 },
        { day: 2, amount: 0 },
      ]).spike,
    ).toBeNull();
    const rows = [
      { day: 1, amount: 0 },
      { day: 2, amount: 0 },
      { day: 3, amount: 40 },
      { day: 3, amount: 60 },
    ];
    const baseline = refundAnomalies(rows);
    expect(baseline.series[2].amount).toBe(100);
    expect(refundAnomalies(rows, baseline.series[2].z).spike?.day).toBe(3);
    expect(
      refundAnomalies([
        { day: 1, amount: 5 },
        { day: 2, amount: 5 },
        { day: 3, amount: 5 },
      ]).spike,
    ).toBeNull();
  });
});
const report = (): Report => ({
  selectedPageId: "operations",
  pages: [
    {
      id: "operations",
      widgets: {
        "decision-grid": {
          type: "grid",
          dataMapping: { cols: [{ id: "decisions.id" }] },
        },
      },
      widgetLayout: {
        "decision-grid": { xTrack: 5, yTrack: 8, xSpan: 12, ySpan: 20 },
      },
      filter: {
        widget: {
          "decision-grid": [
            {
              field: { id: "decisions.summary" },
              model: { operator: "contains", value: "customer" },
            },
          ],
        },
      },
    },
  ],
});
describe("Insights report compatibility", () => {
  it("migrates v5 without mutating the backup or custom positions and prefers v6", () => {
    const saved = report(),
      entries = new Map([[LEGACY_REPORT_KEY, JSON.stringify(saved)]]);
    const storage = { getItem: (key: string) => entries.get(key) ?? null };
    expect(loadReport(storage, report())).toMatchObject({
      saved: true,
      report: saved,
    });
    const v6 = {
      ...saved,
      selectedPageId: "operations",
      panels: { filters: { collapsed: true } },
    };
    entries.set(REPORT_KEY, serializeReport(v6));
    expect(loadReport(storage, report()).report).toEqual(v6);
    expect(JSON.parse(entries.get(LEGACY_REPORT_KEY)!)).toEqual(saved);
  });
  it("recovers from malformed state and storage failures", () => {
    expect(
      loadReport(
        { getItem: () => '{"schemaVersion":6,"report":{"pages":[null]}}' },
        report(),
      ).saved,
    ).toBe(false);
    expect(
      loadReport(
        {
          getItem: () => {
            throw new Error("denied");
          },
        },
        report(),
      ).note,
    ).toContain("restored");
  });
  it("scopes all decision widgets without erasing unrelated authored filters", () => {
    const saved = report();
    const next = applyExplorer(
      saved,
      { ...defaultExplorer(), day: "all", status: "pending_approval" },
      7,
    );
    expect(next.pages[0].filter?.widget?.["decision-grid"]).toHaveLength(2);
    expect(
      next.pages[0].filter?.widget?.["decision-grid"]?.some(
        (filter) => filter.field.id === "decisions.day",
      ),
    ).toBe(false);
    expect(saved.pages[0].filter?.widget?.["decision-grid"]).toHaveLength(1);
  });
  it("never saves responsive positions over canonical positions", () => {
    const saved = report();
    const phone = projectReport(saved, 390, false);
    expect(phone.pages[0].widgetLayout?.["decision-grid"]?.xSpan).toBe(24);
    expect(restoreCanonicalLayout(phone, saved).pages[0].widgetLayout).toEqual(
      saved.pages[0].widgetLayout,
    );
    expect(projectReport(saved, 390, true).pages[0].widgetLayout).toEqual(
      saved.pages[0].widgetLayout,
    );
  });
});
