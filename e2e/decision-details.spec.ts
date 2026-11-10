import { test, expect } from "@playwright/test";

// All APIs are mocked: this regression must never execute a payment.
const baseURL = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:8787";
for (const width of [1440, 390]) {
  test(`decision details open and close at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const proposal = {
      id: "detail-regression", agent: "cs", type: "refund", status: "pending_approval",
      summary: "Review damaged candle refund", amount: 20, simDay: 1,
      createdAt: "2026-11-10T10:00:00Z", confidenceModel: 0.8, riskScore: 30,
      reasoning: "The delivery arrived damaged. Review the partial refund.",
      policy: { reasons: ["Owner approval required."] }, trace: [],
    };
    await page.route("**/api/**", async (route) => {
      if (route.request().method() !== "GET") return route.abort();
      const pathname = new URL(route.request().url()).pathname;
      const bodies: Record<string, unknown> = {
        "/api/config": { dryRun: true }, "/api/proposals": [proposal],
        "/api/sim": { simDay: 1, autorun: false, pausedAll: false },
        "/api/kpis": { autoApproved: 0, paused: false, spendToday: 0, budget: 150, revenueToday: 0, pending: 1, decisions: 1, hoursSaved: 0 },
        "/api/events": "", "/api/payouts": [],
      };
      await route.fulfill({ json: bodies[pathname] ?? [] });
    });
    await page.goto(`${baseURL}/control`, { waitUntil: "domcontentloaded" });
    await expect(page.locator('.ag-row[row-id="detail-regression"]').first()).toBeVisible();
    if (width < 600) {
      // AG Grid unpins action columns on small screens; scroll to the Actions column.
      await page.locator(".ag-body-horizontal-scroll-viewport").evaluate((element) => {
        element.scrollLeft = element.scrollWidth;
      });
    }
    const details = page.getByRole("button", { name: "Toggle details: Review damaged candle refund", exact: true });
    await expect(details).toBeVisible({ timeout: 60_000 });
    await details.click();
    const card = page.locator(".decision-card");
    await expect(card).toBeVisible();
    await expect(card).toContainText(proposal.reasoning);
    await expect(card).toContainText("Owner approval required.");
    await details.click();
    await expect(card).toHaveCount(0);
    await details.focus();
    await page.keyboard.press("Enter");
    await expect(card).toBeVisible();
  });
}
