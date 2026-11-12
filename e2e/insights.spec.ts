import { test, expect } from "./fixtures";
import { shopCrewReport } from "../apps/web/src/studio/initial-report";
import {
  REPORT_KEY,
  LEGACY_REPORT_KEY,
} from "../apps/web/src/studio/report-state";

async function fixture(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    (window as any).EventSource = class {
      onopen: any;
      onmessage: any;
      onerror: any;
      constructor() {
        (window as any).__insightsSource = this;
      }
      close() {}
    };
  });
  let extra = false,
    fail = false;
  await page.route("**/api/insights", async (route) => {
    if (fail)
      return route.fulfill({ status: 503, json: { error: "QA unavailable" } });
    const response = await route.fetch(),
      payload = await response.json();
    const base = payload.proposals[0];
    payload.kpis = {
      ...payload.kpis,
      simDay: 7,
      autoApproved: 2,
      summary: "Two agents committed funds; two approvals need review.",
    };
    payload.policies = [
      { ...payload.policies[0], agent: "cs", dailyBudget: 100 },
      { ...payload.policies[0], agent: "supplier", dailyBudget: 900 },
    ];
    payload.proposals = [
      {
        ...base,
        id: "qa-first",
        simDay: 7,
        agent: "cs",
        type: "refund",
        status: "confirmed",
        amount: 25,
        summary: "Identical visible decision",
        decidedBy: "policy",
      },
      {
        ...base,
        id: "qa-second",
        simDay: 7,
        agent: "cs",
        type: "refund",
        status: "confirmed",
        amount: 25,
        summary: "Identical visible decision",
        decidedBy: "policy",
      },
      {
        ...base,
        id: "qa-pending",
        simDay: 7,
        agent: "cs",
        type: "refund",
        status: "pending_approval",
        amount: 5,
        decidedBy: null,
      },
      {
        ...base,
        id: "qa-older",
        simDay: 6,
        agent: "supplier",
        type: "payout",
        status: "pending_approval",
        amount: 10,
        decidedBy: null,
      },
      ...(extra
        ? [
            {
              ...base,
              id: "qa-new",
              simDay: 7,
              agent: "cs",
              type: "reply",
              status: "pending_approval",
              amount: null,
              decidedBy: null,
            },
          ]
        : []),
    ];
    payload.refunds = Array.from({ length: 12 }, (_, day) => ({
      id: `refund-${day}`,
      order: `order-${day}`,
      amount: day === 4 ? 100 : 1,
      status: "confirmed",
      day,
      path: "dry",
      agent: "cs",
      proposalId: "qa-first",
    }));
    await route.fulfill({ json: payload });
  });
  return {
    addDecision: () => {
      extra = true;
    },
    fail: () => {
      fail = true;
    },
    recover: () => {
      fail = false;
    },
  };
}
const metric = (page: import("@playwright/test").Page, title: string) =>
  page
    .locator(".ag-studio-layout-widget")
    .filter({ has: page.getByText(title, { exact: true }) })
    .locator(".insight-metric");

test("INSIGHTS daily metrics, scoped records, refund review and live refresh", async ({
  page,
}, info) => {
  const data = await fixture(page);
  await page.goto("/insights");
  await expect(metric(page, "Needs review")).toContainText("2");
  await expect(metric(page, "Needs review")).toContainText(
    "1 from earlier days",
  );
  await expect(metric(page, "Committed today")).toContainText("$50.00");
  await expect(page.locator(".insight-budget")).toContainText("5%");
  await expect(
    page.getByRole("button", { name: "Filters", exact: true }),
  ).toHaveAttribute("aria-expanded", "false");
  await page
    .locator(".insight-chart-values button")
    .filter({ hasText: "Confirmed" })
    .click();
  await expect(
    page.getByRole("button", { name: "qa-first", exact: true }),
  ).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "qa-pending", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Clear filters", exact: true })
    .click();
  await page.evaluate(() => {
    (window as any).__studioIdentity = document.querySelector(
      ".studio-frame > div",
    );
  });
  await page
    .getByRole("button", { name: "Review refunds", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("simulation day 4");
  await expect(page.getByRole("dialog")).toContainText("$100.00");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Review refunds", exact: true }),
  ).toBeFocused();
  await metric(page, "Needs review").click();
  await expect(page.getByLabel("Day", { exact: true })).toHaveValue("all");
  await expect(page.getByLabel("Status", { exact: true })).toHaveValue(
    "pending_approval",
  );
  await expect(
    page.getByRole("button", { name: "qa-older", exact: true }),
  ).toBeAttached();
  await page
    .getByRole("button", { name: "Clear filters", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "qa-first", exact: true }),
  ).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "qa-second", exact: true }),
  ).toHaveCount(1);
  await page
    .getByRole("button", { name: "qa-second", exact: true })
    .last()
    .click();
  await expect(page.getByRole("dialog")).toContainText("qa-second");
  await expect(
    page.getByRole("link", { name: "Open in Operations", exact: true }),
  ).toHaveAttribute("href", "/control?tab=decisions&focus=qa-second");
  await page.getByRole("button", { name: "Close details" }).click();
  data.addDecision();
  await page.evaluate(() =>
    (window as any).__insightsSource.onmessage({
      data: JSON.stringify({ type: "proposal.upserted" }),
    }),
  );
  await expect(metric(page, "Needs review")).toContainText("3");
  expect(
    await page.evaluate(
      () =>
        (window as any).__studioIdentity ===
        document.querySelector(".studio-frame > div"),
    ),
  ).toBe(true);
  data.fail();
  await page.getByRole("button", { name: "Refresh insights" }).click();
  await expect(page.getByRole("alert")).toContainText("last successful data");
  await expect(metric(page, "Committed today")).toContainText("$50.00");
  data.recover();
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.locator(".insight-load-error")).toHaveCount(0);
  for (const width of [1440, 1024, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page
      .getByRole("heading", { name: "Insights", exact: true })
      .scrollIntoViewIfNeeded();
    await expect(metric(page, "Needs review")).toBeAttached();
    await page.locator(".insight-live-brief").scrollIntoViewIfNeeded();
    await expect(page.locator(".ag-studio-overlay-loading")).toHaveCount(0);
    await page.screenshot({
      path: info.outputPath(`insights-${width}.png`),
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
    ).toBe(true);
  }
});

test("INSIGHTS custom charts remain functional across all report pages", async ({
  page,
}) => {
  await fixture(page);
  await page.goto("/insights");
  const navigation = page.getByRole("navigation", { name: "Report pages" });
  for (const [name, title] of [
    ["Money", "Per-agent budget burn"],
    ["Inventory", "Cover vs lead time"],
    ["Live agents", "Refund anomaly strip"],
  ]) {
    await navigation.getByRole("button", { name, exact: true }).click();
    const widget = page
      .locator(".ag-studio-layout-widget")
      .filter({ has: page.getByText(title, { exact: true }) });
    await expect(widget).toBeAttached();
    await widget.scrollIntoViewIfNeeded();
    await expect(widget.locator(".insight-bars")).toBeVisible();
    await expect(page.locator(".insight-widget-error")).toHaveCount(0);
  }
});

test("INSIGHTS recovers from corrupt storage and displays save failures without losing the report", async ({
  page,
}) => {
  await fixture(page);
  await page.addInitScript((key) => {
    localStorage.setItem(key, "{broken");
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (name, value) {
      if (name === key)
        throw new DOMException("QA storage full", "QuotaExceededError");
      return set.call(this, name, value);
    };
  }, REPORT_KEY);
  await page.goto("/insights");
  await expect(page.locator(".insight-notice")).toContainText(
    "default report has been restored",
  );
  await expect(page.getByRole("status")).toContainText("Could not save report");
  await expect(metric(page, "Needs review")).toContainText("2");
  const refreshed = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/insights" && response.ok(),
  );
  await page.getByRole("button", { name: "Refresh insights" }).click();
  await refreshed;
  await expect(metric(page, "Committed today")).toContainText("$50.00");
});

test("INSIGHTS AI copy prompt and editor draft survive live refresh", async ({
  page,
  context,
  browserName,
}) => {
  test.skip(
    browserName !== "chromium",
    "Clipboard permissions are exercised in Chromium",
  );
  const data = await fixture(page);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.route("**/api/config", (route) =>
    route.fulfill({
      json: { dryRun: true, studioAiEnabled: true, studioAiModels: ["qa-one"] },
    }),
  );
  await page.goto("/insights");
  await page.getByRole("button", { name: "Copy investigation prompt" }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(
    "simulation day 4",
  );
  await page.getByRole("button", { name: "Edit report", exact: true }).click();
  const input = page.getByRole("textbox", { name: "Message input" });
  await expect(input).toBeVisible();
  await input.fill("Keep this unsent investigation");
  data.addDecision();
  await page.evaluate(() =>
    (window as any).__insightsSource.onmessage({
      data: JSON.stringify({ type: "proposal.upserted" }),
    }),
  );
  await expect(metric(page, "Needs review")).toContainText("3");
  await expect(input).toHaveValue("Keep this unsent investigation");
  await page.getByRole("button", { name: "Done editing", exact: true }).click();
});

test("INSIGHTS preserves v5 layouts, saves v6, and confirms only the current report reset", async ({
  page,
}) => {
  await fixture(page);
  const legacy = structuredClone(shopCrewReport);
  legacy.pages[0].widgets!["custom-copy"] = structuredClone(
    legacy.pages[0].widgets!["kpi-auto"],
  );
  legacy.pages[0].widgetLayout!["custom-copy"] = {
    xTrack: 0,
    yTrack: 70,
    xSpan: 6,
    ySpan: 6,
  };
  await page.addInitScript(
    ({ key, report }) => {
      localStorage.setItem(key, JSON.stringify(report));
      localStorage.setItem("unrelated-report", "keep");
    },
    { key: LEGACY_REPORT_KEY, report: legacy },
  );
  await page.goto("/insights");
  await expect(page.locator(".studio-frame")).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        (key) =>
          JSON.parse(localStorage.getItem(key) || "{}").report?.pages[0]
            .widgets["custom-copy"]?.type,
        REPORT_KEY,
      ),
    )
    .toBe("daily-metric");
  await page.getByRole("button", { name: "Edit report", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Done editing", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Done editing", exact: true }).click();
  await page.getByLabel("Report options").click();
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "Reset report", exact: true }).click();
  expect(
    await page.evaluate(
      (key) =>
        !!JSON.parse(localStorage.getItem(key)!).report.pages[0].widgets[
          "custom-copy"
        ],
      REPORT_KEY,
    ),
  ).toBe(true);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Reset report", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        (key) =>
          JSON.parse(localStorage.getItem(key)!).report.pages[0].widgets[
            "custom-copy"
          ],
        REPORT_KEY,
      ),
    )
    .toBeUndefined();
  expect(
    await page.evaluate(
      (key) =>
        JSON.parse(localStorage.getItem(key)!).pages[0].widgets["custom-copy"]
          .type,
      LEGACY_REPORT_KEY,
    ),
  ).toBe("daily-metric");
  expect(
    await page.evaluate(() => localStorage.getItem("unrelated-report")),
  ).toBe("keep");
});
