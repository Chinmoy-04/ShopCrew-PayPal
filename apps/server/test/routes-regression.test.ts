import { afterAll, beforeAll, expect, it } from 'vitest';
import Fastify from 'fastify';
import { initDb, closeDb } from '../src/db/client.js';
import { resetDatabase } from '../src/db/seed.js';
import { registerRoutes } from '../src/routes/register.js';
import { listProposalViews } from '../src/db/views.js';
import path from 'node:path';
import os from 'node:os';
const app = Fastify();
beforeAll(async () => {
  process.env.DATABASE_URL = '';
  process.env.PGLITE_DIR = path.join(os.tmpdir(), `shopcrew-routes-${crypto.randomUUID()}`);
  await initDb();
  await resetDatabase();
  await registerRoutes(app);
  await app.ready();
});
afterAll(async () => { await app.close(); await closeDb(); });

it('reject cannot overwrite confirmed historical proposals', async () => {
  const row = (await listProposalViews()).find(row => row.status === 'confirmed')!;
  const response = await app.inject({ method: 'POST', url: `/api/proposals/${row.id}/reject`, payload: {} });
  expect(response.statusCode).toBe(409);
  expect((await listProposalViews()).find(r => r.id === row.id)?.status).toBe('confirmed');
});
it('invalid lead times are rejected before persistence', async () => {
  const products = (await app.inject('/api/products')).json();
  for (const leadTimeDays of [-1, 0, 0.5, 'text', null]) {
    const response = await app.inject({ method: 'PATCH', url: `/api/products/${products[0].sku}`, payload: { leadTimeDays } });
    expect(response.statusCode).toBe(422);
  }
  const after = (await app.inject(`/api/products/${products[0].sku}`)).json();
  expect(after.leadTimeDays).toBe(products[0].leadTimeDays);
});
it('valid lead time persists through the production route', async () => {
  const products = (await app.inject('/api/products')).json();
  const response = await app.inject({ method: 'PATCH', url: `/api/products/${products[0].sku}`, payload: { leadTimeDays: 9 } });
  expect(response.statusCode).toBe(200);
  expect((await app.inject(`/api/products/${products[0].sku}`)).json().leadTimeDays).toBe(9);
});
