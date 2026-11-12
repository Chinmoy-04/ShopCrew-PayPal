import { test, expect } from "./fixtures";

async function prepare(page: import("@playwright/test").Page, ai = false) {
  let populated = false;
  await page.route("**/api/config", (route) =>
    route.fulfill({
      json: { dryRun: true, studioAiEnabled: ai, studioAiModels: ["qa-one"] },
    }),
  );
  await page.route("**/api/insights", async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    data.refunds = Array.from({ length: 26 }, (_, index) => ({
      id: `refund-${index}`,
      day: index - 30,
      amount: index === 25 ? 186.43 : index + 1,
      agent: "cs",
      order: "qa-order",
      status: "confirmed",
      path: "dry",
      proposalId: "",
    }));
    data.payouts = populated
      ? [
          {
            id: "qa-payout",
            createdAt: "2026-11-12T12:00:00Z",
            sku: "QA-PAYOUT-SKU",
            receiver: "qa-supplier@example.invalid",
            status: "SUCCESS",
            amount: 125,
          },
        ]
      : [];
    data.studioAiRuns = populated
      ? [
          {
            id: "qa-ai-run",
            threadId: "qa-thread",
            runId: "qa-run",
            agentId: "refund-sentinel",
            query: "QA recorded investigation",
            status: "completed",
            toolCalls: [],
            createdAt: "2026-11-12T12:00:00Z",
            finishedAt: null,
          },
        ]
      : [];
    await route.fulfill({ json: data });
  });
  await page.goto("/insights");
  return {
    populate: () => {
      populated = true;
    },
  };
}
const widget = (page: import("@playwright/test").Page, title: string) =>
  page
    .locator(".ag-studio-layout-widget")
    .filter({ has: page.getByText(title, { exact: true }) });

test("INSIGHTS empty payout and AI widgets explain their sources and recover when records arrive", async ({
  page,
}) => {
  const data = await prepare(page, true);
  const navigation = page.getByRole("navigation", { name: "Report pages" });
  await navigation.getByRole("button", { name: "Money", exact: true }).click();
  await expect(
    widget(page, "Payout pipeline").getByText("No payout records yet", {
      exact: true,
    }),
  ).toBeAttached();
  await expect(
    widget(page, "Supplier payouts").getByText("No payout records yet", {
      exact: true,
    }),
  ).toBeAttached();
  await expect(widget(page, "Supplier payouts").locator("a")).toHaveAttribute(
    "href",
    /\/control\?tab=decisions/,
  );
  await navigation
    .getByRole("button", { name: "Live agents", exact: true })
    .click();
  await expect(
    widget(page, "Studio AI activity").getByText(
      "No Studio AI investigations yet",
      { exact: true },
    ),
  ).toBeAttached();
  await widget(page, "Studio AI activity")
    .getByRole("button", { name: "Open Ask Studio" })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Message input" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Done editing", exact: true }).click();
  data.populate();
  const refreshed = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/insights" && response.ok(),
  );
  await page.getByRole("button", { name: "Refresh insights" }).click();
  await refreshed;
  await expect(
    widget(page, "Studio AI activity").getByRole("gridcell", {
      name: "QA recorded investigation",
      exact: true,
    }),
  ).toBeAttached();
  await navigation.getByRole("button", { name: "Money", exact: true }).click();
  await expect(
    widget(page, "Supplier payouts").getByRole("gridcell", {
      name: "QA-PAYOUT-SKU",
      exact: true,
    }),
  ).toBeAttached();
  await expect(
    widget(page, "Payout pipeline").locator(".insight-bars"),
  ).toBeAttached();
});

test("INSIGHTS dense chart labels have space and refund history uses readable time-series axes", async ({
  page,
}, info) => {
  await prepare(page);
  const navigation = page.getByRole("navigation", { name: "Report pages" });
  await navigation.getByRole("button", { name: "Money", exact: true }).click();
  const budget = widget(page, "Per-agent budget burn");
  await budget.scrollIntoViewIfNeeded();
  await expect(budget.locator(".insight-axis-category")).toHaveCount(5);
  const labels = await budget
    .locator(".insight-axis-category")
    .evaluateAll((elements) =>
      elements.map((element) => {
        const box = (element as SVGGraphicsElement).getBBox();
        return { y: box.y, height: box.height };
      }),
    );
  for (let index = 1; index < labels.length; index++)
    expect(labels[index].y - labels[index - 1].y).toBeGreaterThanOrEqual(
      labels[index - 1].height + 8,
    );
  await budget.getByText("View exact values (5)", { exact: true }).click();
  await expect(budget.locator("tbody tr")).toHaveCount(5);
  await budget.getByText("View exact values (5)", { exact: true }).click();
  await page.screenshot({ path: info.outputPath("budget-readable.png") });
  await navigation
    .getByRole("button", { name: "Live agents", exact: true })
    .click();
  const refund = widget(page, "Refund anomaly strip");
  await refund.scrollIntoViewIfNeeded();
  await expect(refund.locator(".insight-bars-time")).toBeVisible();
  await expect(refund.locator(".insight-refund-peak")).toContainText("$186.43");
  await expect(refund.locator(".insight-chart-data summary")).toHaveText(
    "View exact values (26)",
  );
  const ticks = await refund.locator(".insight-axis-tick").count();
  expect(ticks).toBeLessThan(16);
  await page.screenshot({ path: info.outputPath("refund-readable.png") });
});
