import { test, expect } from "./fixtures";

for (const route of ["/shop", "/shop/NIGHT", "/cart"]) {
  test(`STOCK ${route} refreshes after a supplier restock without reloading`, async ({ page, request }) => {
    const catalog = await request.get("/api/products").then(response => response.json());
    const product = catalog.find((row: { sku: string }) => row.sku === "NIGHT");
    let stock = 0;
    await page.addInitScript((withCart) => {
      localStorage.setItem("shopcrew-cart", JSON.stringify(withCart ? [{ sku: "NIGHT", qty: 1 }] : []));
      (window as any).EventSource = class {
        onopen: any; onmessage: any; onerror: any;
        constructor() { (window as any).__stockEvents = this; }
        close() {}
      };
    }, route === "/cart");
    await page.route("**/api/products", handler => handler.fulfill({
      json: catalog.map((row: { sku: string }) => row.sku === "NIGHT" ? { ...row, stock } : row),
    }));
    await page.route("**/api/products/NIGHT", handler => handler.fulfill({ json: { ...product, stock } }));
    await page.goto(route);
    if (route === "/shop") await expect(page.locator('a[href="/shop/NIGHT"]')).toContainText("0 in stock");
    else if (route === "/shop/NIGHT") await expect(page.getByRole("button", { name: "Out of stock", exact: true })).toBeDisabled();
    else await expect(page.locator(".cart-stock-warning").first()).toContainText("Out of stock");

    stock = 10;
    await page.evaluate(() => (window as any).__stockEvents.onmessage({
      data: JSON.stringify({ type: "inventory.changed", sku: "NIGHT" }),
    }));
    if (route === "/shop") await expect(page.locator('a[href="/shop/NIGHT"]')).toContainText("10 in stock");
    else if (route === "/shop/NIGHT") await expect(page.getByRole("button", { name: "Add to cart", exact: true })).toBeEnabled();
    else await expect(page.locator(".cart-stock-warning")).toHaveCount(0);

    stock = 0;
    await page.evaluate(() => (window as any).__stockEvents.onmessage({
      data: JSON.stringify({ type: "sim.updated" }),
    }));
    if (route === "/shop") await expect(page.locator('a[href="/shop/NIGHT"]')).toContainText("0 in stock");
    else if (route === "/shop/NIGHT") await expect(page.getByRole("button", { name: "Out of stock", exact: true })).toBeDisabled();
    else await expect(page.locator(".cart-stock-warning").first()).toContainText("Out of stock");
  });
}
