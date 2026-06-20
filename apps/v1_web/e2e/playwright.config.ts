import { defineConfig, devices } from '@playwright/test';

/**
 * v1 e2e Playwright config
 * Targets the already-running dev server at :3013 (do NOT start/stop it).
 * Auth uses dev-auth via localStorage injection — no OAuth needed.
 */
export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'line',
  use: {
    baseURL: process.env.V1_WEB_BASE ?? 'http://localhost:3013',
    navigationTimeout: 20_000,
    actionTimeout: 10_000,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // Server is already running externally — no webServer block.
});
