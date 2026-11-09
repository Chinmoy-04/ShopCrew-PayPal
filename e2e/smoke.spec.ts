import { test, expect } from "@playwright/test";

/**
 * Smoke routes at 1440×900. Run after `npx playwright install` (optional dev dependency).
 * Base URL: PLAYWRIGHT_BASE_URL or http://localhost:8787
 */
const baseURL = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:8787";

test.use({ viewport: { width: 1440, height: 900 } });

for (const path of ["/", "/shop", "/control", "/insights"]) {
  test(`loads ${path}`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    await page.goto(`${baseURL}${path}`, { waitUntil: "networkidle", timeout: 120_000 });
    await expect(page.locator("body")).toBeVisible();
    expect(errors, `console errors on ${path}`).toEqual([]);
  });
}
