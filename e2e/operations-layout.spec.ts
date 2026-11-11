import { test, expect } from './fixtures';

test('WORKSPACE day log opens in a wide readable panel with long entries, close and Escape', async ({ page }) => {
  await page.route('**/api/kpis', async route => {
    const response = await route.fetch();
    const kpis = await response.json();
    await route.fulfill({ json: { ...kpis, summary: Array.from({ length: 40 }, (_, index) => `Log entry ${index + 1}: The crew reviewed orders and prepared proposals for the store owner.`).join('\n\n') } });
  });
  await page.goto('/control');
  const mobile = (page.viewportSize()?.width ?? 1440) <= 700;
  if (mobile) await page.getByRole('button', { name: 'Expand navigation' }).click();
  const trigger = page.getByRole('button', { name: 'Day log', exact: true });
  await trigger.click();
  const panel = page.locator('.day-log-panel:popover-open');
  await expect(panel).toBeVisible();
  const bounds = await panel.boundingBox();
  expect(bounds!.width).toBeGreaterThan(mobile ? 300 : 500);
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  expect(await panel.locator('.day-log-body').evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true);
  await panel.locator('.day-log-body').evaluate(element => { element.scrollTop = element.scrollHeight; });
  await expect(panel).toContainText('Log entry 40:');
  await page.screenshot({ path: test.info().outputPath('day-log.png') });
  await panel.getByRole('button', { name: 'Close day log' }).click();
  await expect(panel).toHaveCount(0);
  await trigger.click();
  await panel.getByRole('button', { name: 'Close day log' }).press('Escape');
  await expect(panel).toHaveCount(0);
  await expect(trigger).toBeFocused();
  if (mobile) await expect(page.getByRole('button', { name: 'Collapse navigation' })).toBeVisible();
});

test('WORKSPACE sidebar separates operations from the storefront and preserves deep links', async ({ page }, info) => {
  await page.goto('/control?tab=orders');
  const sidebar = page.getByRole('complementary', { name: 'Workspace navigation' });
  await expect(sidebar).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Orders', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('heading', { level: 1, name: 'Orders' })).toBeVisible();
  await expect(page.locator('.ag-root-wrapper')).toBeVisible();
  const desktop = (page.viewportSize()?.width ?? 1440) > 700;
  if (desktop) {
    const grid = await page.locator('.ag-root-wrapper').boundingBox();
    expect(grid!.y).toBeLessThan(380);
    expect(grid!.height).toBeGreaterThan(400);
  }
  await page.screenshot({ path: test.info().outputPath('control-workspace.png'), fullPage: true });
  await sidebar.getByRole('link', { name: 'Insights', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Insights', exact: true })).toBeVisible();
  await expect(sidebar.getByRole('link', { name: 'Insights', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('.studio-frame')).toBeVisible();
  await expect(page.locator('.sc-stack')).toBeVisible();
  if (!desktop) {
    await expect(page.locator('.studio-frame').getByRole('button', { name: 'Filters', exact: true })).toHaveAttribute('aria-expanded', 'false');
  }
  await page.screenshot({ path: info.outputPath('insights-workspace.png'), fullPage: true });
  await sidebar.getByRole('link', { name: 'Inventory', exact: true }).click();
  await expect(page).toHaveURL(/tab=inventory/);
  await expect(page.getByRole('tab', { name: 'Inventory', exact: true })).toHaveAttribute('aria-selected', 'true');
  await sidebar.getByRole('link', { name: 'Shop', exact: true }).click();
  await expect(page.locator('.operations-sidebar')).toHaveCount(0);
  await expect(page.locator('.store-hero')).toBeVisible();
  await expect(page.locator('.nav')).not.toHaveClass(/operations-sidebar/);
});

test('WORKSPACE all seven sections and vertical keyboard navigation retain their grids', async ({ page }) => {
  await page.goto('/control');
  for (const label of ['Inbox', 'Orders', 'Payouts', 'Inventory', 'Policies', 'Audit log', 'Decisions']) {
    const tab = page.getByRole('tab', { name: label, exact: true });
    await tab.click();
    await expect(tab).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('heading', { name: label, exact: true })).toBeVisible();
    await expect(page.locator('.ag-root-wrapper')).toBeVisible();
  }
  const decisions = page.getByRole('tab', { name: 'Decisions', exact: true });
  await decisions.focus();
  await decisions.press('ArrowDown');
  await expect(page.getByRole('tab', { name: 'Inbox', exact: true })).toBeFocused();
  await expect(page).toHaveURL(/tab=inbox/);
  await page.getByRole('tab', { name: 'Inbox', exact: true }).press('End');
  await expect(page.getByRole('tab', { name: 'Audit log', exact: true })).toBeFocused();
  await page.getByRole('tab', { name: 'Audit log', exact: true }).press('Home');
  await expect(decisions).toBeFocused();
  await expect(decisions).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', 'operations-tab-decisions');
});

test('WORKSPACE simulation controls work in the sidebar and mobile rail expands with Escape recovery', async ({ page }) => {
  await page.goto('/control');
  const sidebar = page.getByRole('complementary', { name: 'Workspace navigation' });
  const mobile = (page.viewportSize()?.width ?? 1440) <= 700;
  if (mobile) {
    await page.getByRole('button', { name: 'Expand navigation' }).click();
    await expect(page.getByRole('button', { name: 'Collapse navigation' })).toHaveAttribute('aria-expanded', 'true');
  }
  const dayBefore = await page.request.get('/api/sim').then(r => r.json());
  await sidebar.getByRole('button', { name: 'Advance day', exact: true }).click();
  await expect.poll(async () => (await page.request.get('/api/sim').then(r => r.json())).simDay).toBe(dayBefore.simDay + 1);
  await sidebar.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(sidebar.getByRole('button', { name: 'Resume', exact: true })).toBeVisible();
  await sidebar.getByRole('button', { name: 'Resume', exact: true }).click();
  await expect(sidebar.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  if (mobile) {
    await sidebar.getByRole('button', { name: 'Pause', exact: true }).press('Escape');
    await expect(page.getByRole('button', { name: 'Expand navigation' })).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
});
