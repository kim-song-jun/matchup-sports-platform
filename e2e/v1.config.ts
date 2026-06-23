import { defineConfig, devices } from '@playwright/test';

/**
 * v1 consumer 앱(apps/v1_web, :3013) 전용 E2E 설정.
 * 기존 playwright.config.ts(구 앱 :3003)와 독립 — 페르소나별 user flow 테스트를 담는다.
 *
 * 전제: v1 스택이 이미 가동 중(web:3013 + api:8121 + pg). webServer 미기동(reuseExisting).
 * 인증: v1 dev-auth는 localStorage `teameet.v1.userEmail`(+옵션 userId)을 x-v1-user-* 헤더로
 *       전송 → v1-tests/helpers/auth.ts의 loginAs()가 addInitScript로 주입.
 *
 * 실행: cd e2e && npx playwright test --config v1.config.ts
 */
const webBase = process.env.V1_E2E_WEB_BASE ?? 'http://localhost:3013';

export default defineConfig({
  testDir: './v1-tests',
  timeout: 90_000,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['html', { outputFolder: 'playwright-report-v1' }]] : 'line',
  outputDir: 'test-results-v1',
  use: {
    baseURL: webBase,
    navigationTimeout: 45_000,
    actionTimeout: 15_000,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'mobile', use: { ...devices['Pixel 5'] } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
  ],
});
