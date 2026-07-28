import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const baseUrl = process.env.TERMS_QA_WEB_URL ?? 'http://localhost:3014';
const adminUserId = process.env.TERMS_QA_ADMIN_USER_ID;
if (!adminUserId) throw new Error('TERMS_QA_ADMIN_USER_ID is required');

const outputDir = path.resolve('output/playwright/visual-audit/task124-admin-terms');
fs.mkdirSync(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const viewports = [
  { name: 'desktop-1440', width: 1440, height: 900 },
  { name: 'tablet-768', width: 768, height: 900 },
  { name: 'mobile-390', width: 390, height: 844 },
];
const results = [];

try {
  for (const viewport of viewports) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      extraHTTPHeaders: { 'x-v1-user-id': adminUserId },
    });
    await context.addInitScript((userId) => {
      localStorage.setItem('teameet.v1.session', 'active');
      localStorage.setItem('teameet.v1.userId', userId);
    }, adminUserId);
    const page = await context.newPage();
    const consoleErrors = [];
    const failedRequests = [];
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('requestfailed', (request) => {
      failedRequests.push(`${request.url()} :: ${request.failure()?.errorText ?? 'failed'}`);
    });

    const response = await page.goto(`${baseUrl}/admin/terms`, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });
    await page.getByRole('heading', { name: '약관 관리' }).waitFor({ timeout: 30_000 });
    const policyCards = page.locator(
      'section[aria-label="약관 정책 목록"] > div.space-y-2 > button',
    );
    await policyCards.first().waitFor({ timeout: 30_000 });
    await policyCards.first().click();
    await page.getByText('실제 본문 미리보기').waitFor();
    await page.screenshot({
      path: path.join(outputDir, `${viewport.name}.png`),
      fullPage: true,
    });

    const policyButtons = await policyCards.count();
    const horizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    results.push({
      viewport: viewport.name,
      status: response?.status() ?? null,
      url: page.url(),
      policyButtons,
      heading: await page.getByRole('heading', { name: '약관 관리' }).isVisible(),
      preview: await page.getByText('실제 본문 미리보기').isVisible(),
      horizontalOverflow,
      consoleErrors,
      failedRequests,
    });
    await context.close();
  }
} finally {
  await browser.close();
}

const failures = results.filter(
  (result) =>
    result.status !== 200 ||
    result.policyButtons !== 12 ||
    !result.heading ||
    !result.preview ||
    result.horizontalOverflow ||
    result.consoleErrors.length > 0 ||
    result.failedRequests.length > 0,
);
process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
if (failures.length > 0) process.exitCode = 1;
