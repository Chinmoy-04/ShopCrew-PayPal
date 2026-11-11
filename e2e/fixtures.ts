import { test as base, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { isolatedEnv, cleanupIsolatedEnv } from '../scripts/test-env.mjs';
import { isWebKitNavigationCancellation } from './browser-errors.mjs';

export const test = base.extend<{ browserEvidence: void }, { qaStack: string }>({
  qaStack: [async ({}, use, workerInfo) => {
    // Reserve an available loopback port; every worker owns its database and
    // process. This never reuses the running sandbox instance.
    const reservation = net.createServer();
    await new Promise<void>((resolve, reject) => { reservation.once('error', reject); reservation.listen(0, '127.0.0.1', resolve); });
    const port = (reservation.address() as net.AddressInfo).port;
    await new Promise<void>(resolve => reservation.close(() => resolve()));
    const url = `http://127.0.0.1:${port}`;
    const environment = isolatedEnv();
    const child = spawn(process.execPath, ['apps/server/dist/index.js'], {
      env: { ...environment, PORT: String(port), PUBLIC_BASE_URL: url }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    const ended = new Promise<void>(resolve => child.once('close', () => resolve()));
    let startupError: Error | undefined;
    child.on('error', error => { startupError = error; });
    let logs = '';
    child.stdout.on('data', chunk => { logs = (logs + chunk).slice(-8000); });
    child.stderr.on('data', chunk => { logs = (logs + chunk).slice(-8000); });
    try {
      const deadline = Date.now() + 90000;
      while (true) {
        let response: Response | undefined;
        try {
          response = await fetch(`${url}/healthz`, { signal: AbortSignal.timeout(2000) });
        } catch { /* still starting */ }
        if (response?.ok) { expect((await response.json()).dryRun).toBe(true); break; }
        if (startupError || child.exitCode !== null || Date.now() > deadline) throw new Error(`Isolated DRY server failed to start (${environment.PGLITE_DIR}): ${startupError?.message ?? ''}\n${logs}`);
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      await use(url);
    } finally {
      if (child.exitCode === null && child.signalCode === null) child.kill();
      await ended;
      const logDirectory = path.join(workerInfo.project.outputDir, 'qa-servers');
      fs.mkdirSync(logDirectory, { recursive: true });
      fs.writeFileSync(path.join(logDirectory, `${workerInfo.project.name}-${workerInfo.workerIndex}.log`), logs);
      cleanupIsolatedEnv(environment);
    }
  }, { scope: 'worker', timeout: 100000 }],
  baseURL: async ({ qaStack }, use) => { await use(qaStack); },
  browserEvidence: [async ({ page, browserName, baseURL }, use, info) => {
    const errors: string[] = [];
    const runtimeErrors: string[] = [];
    const log: { kind: string; text: string }[] = [];
    let navigationPending = false;
    await page.exposeBinding('__qaBrowserException', (_source, message: string) => { runtimeErrors.push(message); });
    await page.addInitScript(() => {
      const report = (message: string) => {
        void (window as any).__qaBrowserException(message).catch(() => undefined);
      };
      window.addEventListener('error', event => report(event.error?.stack || event.message));
      window.addEventListener('unhandledrejection', event => report(event.reason instanceof Error ? event.reason.stack || event.reason.message : String(event.reason)));
    });
    page.on('request', request => {
      if (request.isNavigationRequest() && request.frame() === page.mainFrame()) navigationPending = true;
    });
    page.on('framenavigated', frame => { if (frame === page.mainFrame()) navigationPending = false; });
    const redact = (value: string) => value
      .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
      .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]');
    page.on('console', message => {
      if (['error', 'warning'].includes(message.type())) log.push({ kind: message.type(), text: redact(message.text()) });
    });
    page.on('pageerror', error => {
      if (isWebKitNavigationCancellation(error, { browserName, navigationPending, origin: new URL(baseURL!).origin })) {
        log.push({ kind: 'webkit-navigation-cancellation', text: redact(`${error.name}: ${error.message}`) });
      } else errors.push(error.message);
    });
    page.on('requestfailed', request => {
      // URLs only: never retain credentials, headers or payment bodies here.
      const url = new URL(request.url());
      log.push({ kind: 'requestfailed', text: `${url.origin}${url.pathname}: ${request.failure()?.errorText}` });
      if (request.isNavigationRequest() && request.frame() === page.mainFrame()) navigationPending = false;
    });
    await use();
    if (log.length || errors.length || runtimeErrors.length) await info.attach('browser-diagnostics', {
      body: JSON.stringify({ errors: errors.map(redact), runtimeErrors: runtimeErrors.map(redact), log }, null, 2), contentType: 'application/json',
    });
    expect(errors, 'Unexpected browser exceptions').toEqual([]);
    expect(runtimeErrors, 'Uncaught window errors or unhandled promise rejections').toEqual([]);
  }, { auto: true }],
});
export { expect };
export type { Page, Locator } from '@playwright/test';
