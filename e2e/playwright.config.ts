import { defineConfig, devices } from '@playwright/test';

const rawLocalWorkers = Number(process.env.PW_WORKERS ?? '1');
const localWorkers = Number.isFinite(rawLocalWorkers) && rawLocalWorkers > 0 ? rawLocalWorkers : 1;
const localReporter = process.env.PLAYWRIGHT_REPORTER ?? 'line';

export default defineConfig({
  testDir: './tests',
  timeout: 120_000,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : localWorkers,
  reporter: process.env.CI ? 'html' : localReporter,
  globalSetup: './global-setup.ts',
  globalTeardown: './global-teardown.ts',
  use: {
    baseURL: 'http://localhost:3003',
    navigationTimeout: 120_000,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'Mobile Chrome', use: { ...devices['Pixel 5'] } },
    { name: 'Desktop Chrome', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'pnpm --filter web dev',
    url: 'http://localhost:3003',
    reuseExistingServer: !process.env.CI,
    timeout: 60000,
  },
});
