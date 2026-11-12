import { test, expect, type Locator } from './fixtures';

async function activate(control: Locator) {
  if (test.info().project.use.hasTouch) await control.tap();
  else await control.click();
}
const admin = { 'x-admin-token': 'shopcrew-qa-only' };
test.beforeEach(async ({ request, page }) => {
  const health = await (await request.get('/healthz')).json();
  expect(health.dryRun, 'Never mutate a sandbox or existing server').toBe(true);
  expect((await request.post('/api/sim/reset', { headers: admin, data: {} })).ok()).toBe(true);
});

test('SHOP-01 catalog, cart persistence, quantity, removal, clear', async ({ page, request }) => {
  const products = await (await request.get('/api/products')).json();
  await page.goto('/shop');
  for (const product of products) await expect(page.getByText(product.name, { exact: true })).toBeVisible();
  const product = products.find((p: any) => p.stock > 2);
  await page.goto(`/shop/${product.sku}`);
  await activate(page.getByRole('button', { name: 'Add to cart', exact: true }));
  await page.getByRole('button', { name: 'Increase quantity', exact: true }).click();
  await page.getByRole('link', { name: 'Cart', exact: true }).last().click();
  await expect(page.getByRole('spinbutton')).toHaveValue('2');
  await page.reload();
  await expect(page.getByRole('spinbutton')).toHaveValue('2');
  await page.getByRole('spinbutton').fill('1');
  await expect(page.locator('.cart-total')).toContainText(product.price.toFixed(2));
  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(page.getByText('The cart is empty.', { exact: false })).toBeVisible();
  await page.goto(`/shop/${product.sku}`);
  await activate(page.getByRole('button', { name: 'Add to cart', exact: true }));
  await page.goto('/cart');
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Checkout', exact: true })).toHaveCount(0);
});

test('SHOP-02 real DRY checkout persists one order and stock change', async ({ page, request }) => {
  const products = await (await request.get('/api/products')).json();
  const product = products.find((p: any) => p.stock > 1);
  await page.goto(`/shop/${product.sku}`);
  await activate(page.getByRole('button', { name: 'Add to cart', exact: true }));
  await page.goto('/checkout');
  await activate(page.getByRole('button', { name: 'Place demo order' }));
  await expect(page).toHaveURL(/checkout\/success\?order=/);
  await expect(page.locator('.success-card')).toContainText('DRY');
  const after = await (await request.get(`/api/products/${product.sku}`)).json();
  expect(after.stock).toBe(product.stock - 1);
  expect(await page.evaluate(() => localStorage.getItem('shopcrew-cart'))).toBe('[]');
  await page.getByRole('link', { name: 'Open in control room', exact: true }).click();
  await expect(page).toHaveURL(/tab=orders/);
});

test('SHOP-03 malformed stored cart and missing product recover', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('shopcrew-cart', '{"invalid":true}'));
  await page.goto('/cart');
  await expect(page.getByText('The cart is empty.', { exact: false })).toBeVisible();
  await page.goto('/shop/DOES-NOT-EXIST');
  await expect(page.locator('.error')).toContainText('Product not found');
});

for (const tab of ['decisions', 'inbox', 'orders', 'payouts', 'inventory', 'policies', 'audit']) {
  test(`NAV-${tab} direct route, tab and refresh`, async ({ page }) => {
    await page.goto(`/control?tab=${tab}`);
    await expect(page.locator('.tabs button[aria-selected="true"]')).toContainText(tab);
    await expect(page.locator('.ag-root-wrapper').first()).toBeVisible();
    await page.reload();
    await expect(page.locator('.tabs button[aria-selected="true"]')).toContainText(tab);
  });
}

test('SIM-01 advance, pause/resume, log and cancel reset', async ({ page }) => {
  await page.goto('/control');
  await page.getByRole('button', { name: 'Advance day', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Day log', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Day log', exact: true }).click();
  await expect(page.locator('.control-summary')).toBeVisible();
  await page.getByRole('button', { name: 'Hide log', exact: true }).click();
  await page.getByRole('button', { name: 'Auto-run', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Stop', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Auto-run', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Advance day', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Advance day', exact: true })).toBeEnabled();
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Advance day', exact: true })).toBeEnabled();
});

test('API-01 validation and terminal decision protection', async ({ request }) => {
  const products = await (await request.get('/api/products')).json();
  for (const leadTimeDays of [-1, 0, 1.5]) {
    expect((await request.patch(`/api/products/${products[0].sku}`, { data: { leadTimeDays } })).status()).toBe(422);
  }
  expect((await request.patch(`/api/products/${products[0].sku}`, { data: { leadTimeDays: 12 } })).ok()).toBe(true);
  expect((await (await request.get(`/api/products/${products[0].sku}`)).json()).leadTimeDays).toBe(12);
  expect((await request.post('/api/checkout/orders', { data: { items: [] } })).status()).toBe(400);
  await request.post('/api/sim/advance', { data: {} });
  const rows = await (await request.get('/api/proposals')).json();
  const pending = rows.find((r: any) => r.status === 'pending_approval' && r.type === 'refund');
  expect(pending).toBeTruthy();
  for (const amount of [-1, 0, 'invalid']) expect((await request.patch(`/api/proposals/${pending.id}`, { data: { amount } })).status()).toBe(422);
  expect((await request.patch(`/api/proposals/${pending.id}`, { data: { amount: 20 } })).ok()).toBe(true);
  expect((await request.post(`/api/proposals/${pending.id}/approve`, { data: {} })).ok()).toBe(true);
  expect((await request.post(`/api/proposals/${pending.id}/reject`, { data: {} })).status()).toBe(409);
  const approved = await (await request.get(`/api/proposals/${pending.id}`)).json();
  expect(approved.amount).toBe(20);
  await expect.poll(async () => (await (await request.get(`/api/proposals/${pending.id}`)).json()).status).toBe('confirmed');
  expect((await request.post('/api/admin/capture-pool', { headers: admin, data: {} })).status()).toBe(422);
});

test('POLICY-01 toggle every agent persists', async ({ page, request }) => {
  await page.goto('/control?tab=policies');
  const policies = await (await request.get('/api/policies')).json();
  for (const policy of policies) {
    const row = page.locator(`.ag-row[row-id="${policy.agent}"]`);
    await row.getByRole('button', { name: 'Active', exact: true }).click();
    await expect(row.getByRole('button', { name: 'Paused', exact: true })).toBeVisible();
    expect((await (await request.get('/api/policies')).json()).find((p: any) => p.agent === policy.agent).enabled).toBe(false);
    await row.getByRole('button', { name: 'Paused', exact: true }).click();
    await expect(row.getByRole('button', { name: 'Active', exact: true })).toBeVisible();
  }
});

test('INSIGHTS-01 modes and layout reset', async ({ page }) => {
  await page.goto('/insights');
  await expect(page.getByRole('heading', { name: 'Insights', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Edit report', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Edit report', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'View', exact: true }).click();
  await expect(page.getByRole('button', { name: 'View', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Reset layout', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Insights', exact: true })).toBeVisible();
});

test('DECISION-01 reject and explanation persist in audit', async ({ request }) => {
  await request.post('/api/sim/advance', { data: {} });
  const rows = await (await request.get('/api/proposals')).json();
  const row = rows.find((r: any) => r.status === 'pending_approval');
  const answer = await request.post(`/api/proposals/${row.id}/ask`, { data: { question: 'Why this amount?' } });
  expect(answer.ok()).toBe(true);
  expect((await answer.json()).answer).toBeTruthy();
  expect((await request.post(`/api/proposals/${row.id}/reject`, { data: {} })).ok()).toBe(true);
  expect((await (await request.get(`/api/proposals/${row.id}`)).json()).status).toBe('rejected');
  expect((await request.post(`/api/proposals/${row.id}/approve`, { data: {} })).status()).toBe(409);
  const audit = await (await request.get('/api/audit')).json();
  expect(audit.some((a: any) => a.proposalId === row.id && a.event === 'owner.asked')).toBe(true);
  expect(audit.some((a: any) => a.proposalId === row.id && a.event === 'proposal.rejected')).toBe(true);
});
