import { test, expect } from './fixtures';
import { revealGridControl } from './grid-ui';

test('UI presentation evidence preserves route access and fits the viewport', async ({ page }, info) => {
  for (const [route, ready, name] of [
    ['/', '.hero', 'marketing'], ['/shop', '.product-card', 'shop'],
    ['/shop/CEDAR', 'button', 'product'], ['/control', '.ag-root', 'control'],
    ['/insights', '.studio-frame', 'insights'], ['/cart', 'h1', 'cart'],
    ['/checkout', 'h1', 'checkout'],
  ]) {
    await page.goto(route);
    await expect(page.locator(ready).first()).toBeVisible();
    await expect(page.locator('main')).toBeVisible();
    await page.screenshot({ path: `.data/ui-upgrade/${process.env.UI_EVIDENCE_STAGE || 'after'}/${info.project.name}-${name}.png`, fullPage: true });
    if (process.env.UI_EVIDENCE_STAGE !== 'before') expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), route).toBe(true);
  }
});

test('UI scrolling respects reduced motion and restores browsing position', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Meet your back office.' })).toBeAttached();
  await expect(page.locator('html')).not.toHaveClass(/lenis/);
  await page.getByRole('link', { name: 'Skip to content' }).focus();
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeInViewport();
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(page.locator('html')).toHaveClass(/lenis/);
  await page.getByRole('heading', { name: 'Meet your back office.' }).scrollIntoViewIfNeeded();
  const position = await page.evaluate(() => scrollY);
  expect(position).toBeGreaterThan(100);
  await page.locator('.owner-section a').scrollIntoViewIfNeeded();
  const returnPosition = await page.evaluate(() => scrollY);
  await page.locator('.owner-section a').click();
  await expect(page).toHaveURL(/\/control\?tab=policies/);
  await expect(page.locator('html')).not.toHaveClass(/lenis/);
  await page.goBack();
  await expect(page.locator('html')).toHaveClass(/lenis/);
  await expect.poll(async () => Math.abs(await page.evaluate(() => scrollY) - returnPosition)).toBeLessThan(3);
  await page.locator('.nav').getByRole('link', { name: 'Cart', exact: true }).click();
  await expect(page.locator('html')).not.toHaveClass(/lenis/);
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
});

test('UI product photography loads and failed images retain the product and purchase action', async ({ page }) => {
  await page.goto('/shop/CEDAR');
  const photo = page.locator('.product-photo img');
  await expect(photo).toBeVisible();
  await expect.poll(() => photo.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  await page.route('**/images/hearth-wick/cedar*', route => route.abort());
  await page.reload();
  await expect(page.locator('.swatch-fallback')).toContainText('Cedar & Smoke');
  await expect(page.getByRole('button', { name: 'Add to cart', exact: true })).toBeEnabled();
});

test('UI decision data failures show a usable retry without losing the grid', async ({ page }) => {
  let unavailable = true;
  await page.route('**/api/proposals', route => unavailable
    ? route.fulfill({ status: 503, json: { error: 'QA decisions unavailable' } })
    : route.fulfill({ json: [{ id: 'qa-load-recovered', agent: 'cs', type: 'refund', amount: 8,
      status: 'pending_approval', summary: 'Synthetic recovered decision', createdAt: '2026-01-01T00:00:00Z' }] }));
  await page.goto('/control');
  await expect(page.getByRole('alert')).toHaveCount(2);
  await expect(page.getByRole('alert').first()).toContainText('QA decisions unavailable');
  unavailable = false;
  await page.getByRole('button', { name: 'Retry decisions' }).click();
  await page.getByRole('button', { name: 'Retry summary' }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.locator('.ag-row[row-id="qa-load-recovered"]').first()).toBeVisible();
});

test('UI refund warning is persistent and associated with the exact approval action', async ({ page }, info) => {
  await page.route('**/api/proposals', route => route.fulfill({ json: [{
    id: 'qa-ui-refund', agent: 'cs', type: 'refund', amount: 45, status: 'pending_approval',
    summary: 'Synthetic UI refund', createdAt: '2026-01-01T00:00:00Z',
    reasoning: 'Synthetic UI reasoning', policy: { reasons: ['Synthetic policy'] },
  }] }));
  await page.goto('/control');
  const approve = page.getByRole('button', { name: 'Approve $45.00', exact: true });
  await expect(page.locator('.ag-row[row-id="qa-ui-refund"]').first()).toBeVisible();
  if ((page.viewportSize()?.width ?? 1440) < 600) await revealGridControl(page, approve, 'end');
  await expect(approve).toBeEnabled();
  await expect(approve).toHaveAttribute('aria-describedby', 'refund-warning-qa-ui-refund');
  const warning = page.locator('#refund-warning-qa-ui-refund');
  await expect(warning).toHaveText('Refunds cannot be reversed.');
  await page.getByRole('button', { name: 'Toggle details: Synthetic UI refund' }).click();
  await expect(page.locator('.refund-detail-warning')).toHaveText('Refunds cannot be reversed.');
  await expect(page.getByRole('button', { name: 'Rollback', exact: true })).toBeDisabled();
  await page.screenshot({ path: `.data/ui-upgrade/after/${info.project.name}-refund-detail.png`, fullPage: true });
});
