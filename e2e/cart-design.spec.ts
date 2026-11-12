import { test, expect } from './fixtures';

test('CART DESIGN multi-item totals, quantity controls, imagery and empty state', async ({ page, request }) => {
  const catalog = await request.get('/api/products').then(response => response.json());
  const chosen = ['CEDAR', 'FIG', 'LINEN'].map(sku => catalog.find((product: any) => product.sku === sku));
  const initial = chosen.map((product, index) => ({ sku: product.sku, qty: index === 0 ? 2 : 1 }));
  await page.addInitScript(items => localStorage.setItem('shopcrew-cart', JSON.stringify(items)), initial);
  await page.goto('/cart');
  await expect(page.locator('.cart-line')).toHaveCount(3);
  await expect(page.locator('.cart-heading-count')).toHaveText('4');
  const total = chosen.reduce((sum, product, index) => sum + product.price * (index === 0 ? 2 : 1), 0);
  await expect(page.locator('.cart-total')).toContainText(total.toFixed(2));
  await page.getByRole('button', { name: `Increase ${chosen[0].name} quantity` }).click();
  await expect(page.locator('.cart-total')).toContainText((total + chosen[0].price).toFixed(2));
  await page.getByRole('button', { name: `Decrease ${chosen[0].name} quantity` }).click();
  await expect(page.locator('.cart-total')).toContainText(total.toFixed(2));
  for (const img of await page.locator('.cart-line-image img').all()) {
    await img.scrollIntoViewIfNeeded();
    await expect(img).toHaveJSProperty('complete', true);
    expect(await img.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath('cart-redesign.png'), fullPage: true });
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await expect(page.locator('.cart-empty-state')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Checkout', exact: true })).toHaveCount(0);
  await page.getByRole('link', { name: 'Browse the shop.', exact: true }).click();
  await expect(page).toHaveURL(/\/shop$/);
});

test('CART DESIGN unavailable products cannot proceed to checkout and can be removed', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('shopcrew-cart', JSON.stringify([{ sku: 'UNAVAILABLE', qty: 1 }])));
  await page.route('**/api/products', route => route.fulfill({ json: [] }));
  await page.goto('/cart');
  await expect(page.getByText('This product is no longer available.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Checkout', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(page.locator('.cart-empty-state')).toBeVisible();
});
