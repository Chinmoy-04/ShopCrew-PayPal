import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import dotenv from 'dotenv';
import { isolatedEnv } from './test-env.mjs';

// Separate from automated DRY tests; never writes .env or the development ledger.
const local = dotenv.parse(fs.readFileSync('.env'));
if (local.PAYPAL_ENV !== 'sandbox' || !local.PAYPAL_CLIENT_ID || !local.PAYPAL_CLIENT_SECRET) {
  throw new Error('Configured sandbox credentials are required.');
}
const [buyer, supplier, resumeFlag, resumePath] = process.argv.slice(2);
if (!buyer || !supplier) throw new Error('Usage: node scripts/sandbox-session.mjs BUYER_EMAIL SUPPLIER_EMAIL');
const sessionRoot = path.resolve('.data', 'sandbox-qa');
const stateDir = resumeFlag === '--resume' && resumePath
  ? path.resolve(resumePath) : path.join(sessionRoot, crypto.randomUUID());
if (!stateDir.startsWith(sessionRoot + path.sep)) throw new Error('Session must be inside .data/sandbox-qa');
if (resumeFlag && (resumeFlag !== '--resume' || !resumePath)) throw new Error('Expected --resume SESSION_DIRECTORY');
const resume = resumeFlag === '--resume';
if (resume && !fs.existsSync(path.join(stateDir, 'session.json'))) throw new Error('Existing session metadata required');
fs.mkdirSync(stateDir, { recursive: true });
const env = { ...isolatedEnv(), NODE_ENV: 'production', PORT: '8799',
  PAYPAL_CLIENT_ID: local.PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET: local.PAYPAL_CLIENT_SECRET,
  PGLITE_DIR: path.join(stateDir, 'db'), CAPTURE_POOL_PATH: path.join(stateDir, 'captures.json'),
  ADMIN_TOKEN: resume ? fs.readFileSync(path.join(stateDir, 'admin-token'), 'utf8') : crypto.randomBytes(32).toString('hex'), DEMO_BUYER_EMAIL: buyer,
  DEMO_BUYER_HINT: 'Use the dedicated sandbox buyer account', SUPPLIER_EMAILS: supplier,
  UNCLAIMED_SUPPLIER_EMAIL: `qa-unclaimed-${crypto.randomUUID()}@shopcrew.example`,
};
fs.writeFileSync(path.join(stateDir, 'admin-token'), env.ADMIN_TOKEN);
let tunnel, server, webhookId, accessToken;
const api = 'https://api-m.sandbox.paypal.com';
async function paypal(method, url, body) {
  const response = await fetch(`${api}${url}`, {
    method, headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Sandbox API ${method} ${url}: HTTP ${response.status}`);
  return response.status === 204 ? null : response.json();
}
// The tunnel exposes only webhook delivery. Admin and payment actions stay local.
const proxy = http.createServer((req, res) => {
  if (req.method !== 'POST' || req.url !== '/api/paypal/webhooks') {
    res.writeHead(404).end(); return;
  }
  const upstream = http.request({ hostname: '127.0.0.1', port: 8799,
    path: req.url, method: 'POST', headers: req.headers }, response => {
    res.writeHead(response.statusCode ?? 502, response.headers); response.pipe(res);
  });
  upstream.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end(); });
  req.pipe(upstream);
});
let stopping = false;
async function stop() {
  if (stopping) return; stopping = true;
  if (webhookId) {
    try { await paypal('DELETE', `/v1/notifications/webhooks/${webhookId}`); }
    catch { console.error(`Temporary webhook cleanup needed: ${webhookId}`); }
  }
  server?.kill(); tunnel?.kill(); proxy.close();
  process.exit(0);
}
process.on('SIGINT', stop); process.on('SIGTERM', stop);
try {
  const tokenResponse = await fetch(`${api}/v1/oauth2/token`, {
    method: 'POST', headers: {
      Authorization: `Basic ${Buffer.from(`${local.PAYPAL_CLIENT_ID}:${local.PAYPAL_CLIENT_SECRET}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    }, body: 'grant_type=client_credentials', signal: AbortSignal.timeout(30_000),
  });
  if (!tokenResponse.ok) throw new Error(`Sandbox authentication: HTTP ${tokenResponse.status}`);
  accessToken = (await tokenResponse.json()).access_token;
  const existing = await paypal('GET', '/v1/notifications/webhooks');
  await new Promise((resolve, reject) => { proxy.once('error', reject); proxy.listen(8800, '127.0.0.1', resolve); });
  tunnel = spawn(process.env.CLOUDFLARED_PATH || 'C:/Program Files (x86)/cloudflared/cloudflared.exe',
    ['tunnel', '--no-autoupdate', '--protocol', 'http2', '--url', 'http://127.0.0.1:8800'],
    { windowsHide: true });
  const tunnelLog = fs.createWriteStream(path.join(stateDir, 'tunnel.log'));
  const url = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Tunnel URL timed out')), 60_000);
    tunnel.once('error', reject);
    tunnel.once('exit', () => reject(new Error('Tunnel exited before readiness')));
    tunnel.stderr.on('data', chunk => {
      tunnelLog.write(chunk);
      const match = String(chunk).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
      if (match) { clearTimeout(timeout); resolve(match[0]); }
    });
  });
  const created = await paypal('POST', '/v1/notifications/webhooks', {
    url: `${url}/api/paypal/webhooks`, event_types: [{ name: '*' }],
  });
  webhookId = created.id;
  if (!webhookId) throw new Error('Sandbox did not return a webhook ID');
  env.PAYPAL_WEBHOOK_ID = webhookId;
  env.PUBLIC_BASE_URL = url;
  const after = await paypal('GET', '/v1/notifications/webhooks');
  if (!(existing.webhooks ?? []).every(old => (after.webhooks ?? []).some(next => next.id === old.id && next.url === old.url))) {
    throw new Error('Existing webhook verification failed');
  }
  fs.writeFileSync(path.join(stateDir, 'session.json'), JSON.stringify({
    webhookId, url, port: 8799, pgliteDir: env.PGLITE_DIR, capturePoolPath: env.CAPTURE_POOL_PATH,
    existingWebhooksPreserved: true, createdAt: new Date().toISOString(),
  }, null, 2));
  server = spawn(process.execPath, ['apps/server/dist/index.js'], { env, stdio: 'inherit', windowsHide: true });
  server.once('exit', () => { if (!stopping) void stop(); });
  console.log(JSON.stringify({ localUrl: 'http://127.0.0.1:8799', webhookUrl: `${url}/api/paypal/webhooks`, webhookId, stateDir, existingWebhooksPreserved: true }));
} catch (error) {
  console.error(error.message); await stop();
}
