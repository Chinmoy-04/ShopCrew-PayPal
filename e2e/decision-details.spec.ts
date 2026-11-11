import { test, expect } from "./fixtures";
import { revealGridControl } from "./grid-ui";

// All APIs are mocked: this regression must never execute a payment.
for (const width of [1440, 390]) {
  test(`decision details open and close at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width < 600 ? 844 : 900 });
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
      if (pathname === "/api/events") return route.fulfill({ contentType: "text/event-stream", body: ": fixture connected\n\n" });
      const bodies: Record<string, unknown> = {
        "/api/config": { dryRun: true }, "/api/proposals": [proposal],
        "/api/sim": { simDay: 1, autorun: false, pausedAll: false },
        "/api/kpis": { autoApproved: 0, paused: false, spendToday: 0, budget: 150, revenueToday: 0, pending: 1, decisions: 1, hoursSaved: 0 },
        "/api/payouts": [],
      };
      await route.fulfill({ json: bodies[pathname] ?? [] });
    });
    await page.goto('/control', { waitUntil: "domcontentloaded" });
    await expect(page.locator('.ag-row[row-id="detail-regression"]').first()).toBeVisible();
    const details = page.getByRole("button", { name: "Toggle details: Review damaged candle refund", exact: true });
    if (width < 600) {
      // AG Grid unpins action columns on small screens; scroll to the Actions column.
      await revealGridControl(page, details, 'end');
    }
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
