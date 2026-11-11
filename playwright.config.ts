import { defineConfig } from '@playwright/test';
export default defineConfig({
 testDir: './e2e', timeout: 60_000, expect: { timeout: 15_000 },
 fullyParallel: false, workers: 3, retries: 0,
 outputDir: process.env.QA_OUTPUT_DIR || 'test-results',
 reporter: [['list'], ['html', { open: 'never' }], ['json', { outputFile: process.env.QA_RESULT_FILE || '.data/qa-browser-results.json' }]],
 use: { trace: 'retain-on-failure', screenshot: 'only-on-failure', video: 'retain-on-failure', acceptDownloads: true },
 projects: (['chromium', 'firefox', 'webkit'] as const).flatMap(browserName => [false, true].map(mobile => ({
 name: `${browserName}-${mobile ? 'mobile' : 'desktop'}`,
 use: { browserName, viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 }, hasTouch: mobile && browserName !== 'firefox' }
 }))),
});
