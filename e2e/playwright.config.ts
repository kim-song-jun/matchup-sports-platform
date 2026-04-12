import { defineConfig, devices, type ReporterDescription } from '@playwright/test';

const defaultWebBase = 'http://localhost:3003';
const webBase = process.env.E2E_WEB_BASE ?? defaultWebBase;
const rawLocalWorkers = Number(process.env.PW_WORKERS ?? '1');
const localWorkers = Number.isFinite(rawLocalWorkers) && rawLocalWorkers > 0 ? rawLocalWorkers : 1;
const localReporter = process.env.PLAYWRIGHT_REPORTER ?? 'line';
const htmlReportDir = process.env.PLAYWRIGHT_HTML_REPORT_DIR ?? 'playwright-report';
const outputDir = process.env.PLAYWRIGHT_OUTPUT_DIR ?? 'test-results';
const skipWebServer = process.env.PW_SKIP_WEBSERVER === '1' || webBase !== defaultWebBase;

function resolveReporter() {
  const htmlReporter: ReporterDescription = ['html', { outputFolder: htmlReportDir }];
  if (process.env.CI || localReporter === 'html') {
    return [htmlReporter];
  }

  return localReporter;
}

export default defineConfig({
  testDir: './tests',
  timeout: 120_000,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : localWorkers,
  reporter: resolveReporter(),
  outputDir,
  globalSetup: './global-setup.ts',
  globalTeardown: './global-teardown.ts',
  use: {
    baseURL: webBase,
    navigationTimeout: 120_000,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'Mobile Chrome', use: { ...devices['Pixel 5'] } },
    { name: 'Desktop Chrome', use: { ...devices['Desktop Chrome'] } },
  ],
  ...(skipWebServer
    ? {}
    : {
        webServer: {
          command: 'pnpm --filter web dev:e2e',
          url: `${webBase}/landing`,
          reuseExistingServer: !process.env.CI,
          timeout: 60000,
        },
      }),
});
