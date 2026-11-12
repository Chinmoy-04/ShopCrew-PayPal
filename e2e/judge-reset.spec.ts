import { test, expect } from "./fixtures";

test("JUDGE reset explains Day 0, needs no token, supports cancel and restores stock", async ({ page, request }, info) => {
  await page.route("**/api/config", async route => {
    const response = await route.fetch();
    await route.fulfill({ json: { ...await response.json(), demoPublicReset: true } });
  });
  let resets = 0;
  await page.route("**/api/sim/reset", async route => {
    expect(route.request().headers()["x-admin-token"]).toBeUndefined();
    resets++;
    // The isolated worker retains owner-only mode; exercise its real reset
    // through this test proxy while server tests cover tokenless authorization.
    const response = await route.fetch({ headers: { ...route.request().headers(), "x-admin-token": "shopcrew-qa-only" } });
    await route.fulfill({ response });
  });
  await request.post("/api/sim/advance", { data: {} });
  await page.goto("/control?tab=policies");
  if ((page.viewportSize()?.width ?? 1440) <= 700) await page.getByRole("button", { name: "Expand navigation" }).click();
  const reset = page.getByRole("button", { name: "Reset demo", exact: true });
  await expect(reset).toBeAttached();
  await reset.scrollIntoViewIfNeeded();
  const dialog = page.waitForEvent("dialog");
  const firstClick = reset.click();
  const confirmation = await dialog;
  expect(confirmation.type()).toBe("confirm");
  expect(confirmation.message()).toContain("Day 0");
  expect(confirmation.message()).toContain("PayPal transactions");
  await confirmation.dismiss();
  await firstClick;
  expect(resets).toBe(0);
  const nextDialog = page.waitForEvent("dialog");
  const secondClick = reset.click();
  await (await nextDialog).accept();
  await secondClick;
  await expect.poll(() => resets).toBe(1);
  await expect.poll(async () => (await request.get("/api/sim")).json().then(sim => sim.simDay)).toBe(0);
  await expect(reset).toBeEnabled();
  await expect(page.locator(".sim-clock-compact strong")).toHaveText("Day 0");
  const product = await (await request.get("/api/products/NIGHT")).json();
  expect(product.stock).toBe(28);
  await page.screenshot({ path: info.outputPath("judge-day-zero.png"), fullPage: true });
});
