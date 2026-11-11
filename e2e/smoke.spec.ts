import { test, expect } from "./fixtures";

/**
 * Smoke routes use each project's configured viewport.
 * Uses the isolated worker server.
 */

for (const path of ["/", "/shop", "/control", "/insights"]) {
  test(`loads ${path}`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    await page.goto(path, { waitUntil: "domcontentloaded", timeout: 120_000 });
    await expect(page.locator("main")).toBeVisible();
    if (path === "/shop") await expect(page.getByRole("heading", { name: "Hearth & Wick" })).toBeVisible();
    if (path === "/control") await expect(page.locator(".tabs")).toBeVisible();
    if (path === "/insights") await expect(page.locator(".studio-frame")).toBeVisible();
    expect(errors, `console errors on ${path}`).toEqual([]);
  });
}
