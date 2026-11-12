import { test, expect } from './fixtures';

test('CHECKOUT DESIGN order summary shows current items and totals; empty cart has recovery', async ({ page, request, context }) => {
  const products = await request.get('/api/products').then(response => response.json());
  const cedar = products.find((product: any) => product.sku === 'CEDAR');
  const fig = products.find((product: any) => product.sku === 'FIG');
  await page.addInitScript(() => localStorage.setItem('shopcrew-cart', JSON.stringify([{ sku: 'CEDAR', qty: 2 }, { sku: 'FIG', qty: 1 }])));
  await page.goto('/checkout');
  await expect(page.getByRole('heading', { name: 'Checkout', exact: true })).toBeVisible();
  await expect(page.locator('.checkout-order-item')).toHaveCount(2);
  await expect(page.locator('.checkout-grand-total')).toContainText((cedar.price * 2 + fig.price).toFixed(2));
  await expect(page.getByRole('button', { name: 'Place demo order', exact: true })).toBeVisible();
  for (const image of await page.locator('.checkout-order-item img').all()) {
    await image.scrollIntoViewIfNeeded();
    await expect(image).toHaveJSProperty('complete', true);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath('checkout-redesign.png'), fullPage: true });
  const cart = await context.newPage();
  await cart.goto('/cart');
  await cart.getByRole('button', { name: 'Clear', exact: true }).click();
  await expect(page.getByText('Nothing to pay for.', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Place demo order', exact: true })).toHaveCount(0);
  await page.getByRole('link', { name: 'Explore the candles', exact: true }).click();
  await expect(page).toHaveURL(/\/shop$/);
  await cart.close();
});
