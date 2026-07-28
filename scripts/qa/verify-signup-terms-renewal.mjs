import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const baseUrl = process.env.TERMS_QA_WEB_URL ?? 'http://localhost:3014';
const userId = process.env.TERMS_QA_USER_ID;
if (!userId) throw new Error('TERMS_QA_USER_ID is required');

const outputDir = path.resolve('output/playwright/visual-audit/task124-terms-renewal');
fs.mkdirSync(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const viewports = [
  { name: 'desktop-1440', width: 1440, height: 900 },
  { name: 'tablet-768', width: 768, height: 900 },
  { name: 'mobile-390', width: 390, height: 844 },
];
const results = [];

async function createContext(viewport) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    extraHTTPHeaders: { 'x-v1-user-id': userId },
  });
  await context.addInitScript((currentUserId) => {
    localStorage.setItem('teameet.v1.session', 'active');
    localStorage.setItem('teameet.v1.userId', currentUserId);
  }, userId);
  return context;
}

try {
  for (const viewport of viewports) {
    const context = await createContext(viewport);
    const page = await context.newPage();
    const consoleErrors = [];
    const failedRequests = [];
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('requestfailed', (request) => {
      failedRequests.push(`${request.url()} :: ${request.failure()?.errorText ?? 'failed'}`);
    });

    const response = await page.goto(`${baseUrl}/my`, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });
    await page.waitForURL(/\/terms\?mode=renewal/, { timeout: 30_000 });
    await page.getByRole('heading', { name: '새 필수 약관을 확인해 주세요' }).waitFor();
    await page.getByText('동의 완료', { exact: false }).waitFor();
    await page.getByText('새 동의 필요', { exact: false }).waitFor();
    await page.screenshot({
      path: path.join(outputDir, `${viewport.name}.png`),
      fullPage: true,
    });

    results.push({
      viewport: viewport.name,
      initialStatus: response?.status() ?? null,
      redirectedToRenewal: page.url().includes('/terms?mode=renewal'),
      acceptedCount: await page.getByText('동의 완료', { exact: false }).count(),
      pendingCount: await page.getByText('새 동의 필요', { exact: false }).count(),
      horizontalOverflow: await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      ),
      consoleErrors,
      failedRequests,
    });
    await context.close();
  }

  const actionContext = await createContext(viewports[0]);
  const actionPage = await actionContext.newPage();
  await actionPage.goto(`${baseUrl}/my`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await actionPage.waitForURL(/\/terms\?mode=renewal/, { timeout: 30_000 });
  const pendingCard = actionPage.getByText('새 동의 필요', { exact: false })
    .locator('xpath=ancestor::div[contains(@class, "tm-auth-agreement-card")]');
  await pendingCard.getByRole('button').nth(1).click();
  await actionPage.getByRole('button', { name: '동의하고 계속하기' }).click();
  await actionPage.waitForURL(`${baseUrl}/my`, { timeout: 30_000 });
  results.push({
    action: 'accept-only-new-required-document',
    redirectedBackToMy: actionPage.url() === `${baseUrl}/my`,
  });
  await actionContext.close();
} finally {
  await browser.close();
}

const failures = results.filter((result) => (
  'viewport' in result
    ? !result.redirectedToRenewal
      || result.acceptedCount !== 1
      || result.pendingCount !== 1
      || result.horizontalOverflow
      || result.consoleErrors.length > 0
      || result.failedRequests.length > 0
    : !result.redirectedBackToMy
));
process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
if (failures.length > 0) process.exitCode = 1;
