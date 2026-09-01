import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright';

const baseUrl = process.env.TASK156_BASE_URL ?? 'http://127.0.0.1:3013';
const outputDir = path.resolve(
  process.env.TASK156_OUTPUT_DIR ?? 'output/playwright/task156-account-deletion',
);
const viewports = [
  { name: 'mobile-390x844', width: 390, height: 844 },
  { name: 'tablet-768x1024', width: 768, height: 1024 },
  { name: 'desktop-1280x900', width: 1280, height: 900 },
];

await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: false });
const results = [];

try {
  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    const consoleErrors = [];
    const pageErrors = [];
    const failedResponses = [];

    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('response', (response) => {
      if (response.status() >= 400) {
        failedResponses.push({ status: response.status(), url: response.url() });
      }
    });

    const response = await page.goto(`${baseUrl}/account-deletion`, {
      waitUntil: 'networkidle',
      timeout: 30_000,
    });
    await page.getByRole('heading', {
      level: 1,
      name: 'Teameet 계정 삭제를 요청할 수 있어요',
    }).waitFor();

    const requestHref = await page
      .getByRole('link', { name: '이메일로 삭제 요청하기' })
      .getAttribute('href');
    const inAppHref = await page
      .getByRole('link', { name: '앱에서 탈퇴 요청하기' })
      .getAttribute('href');
    const dimensions = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      scrollHeight: document.documentElement.scrollHeight,
      clientHeight: document.documentElement.clientHeight,
    }));
    const screenshot = path.join(outputDir, `${viewport.name}.png`);
    await page.screenshot({ path: screenshot, fullPage: true });

    const blockers = [
      ...(response?.ok() ? [] : [`document status ${response?.status() ?? 'missing'}`]),
      ...(requestHref?.startsWith('mailto:teameetsports@naver.com?') ? [] : ['invalid public request link']),
      ...(inAppHref === '/my/settings/withdrawal' ? [] : ['invalid in-app request link']),
      ...(dimensions.scrollWidth <= dimensions.clientWidth ? [] : ['horizontal overflow']),
      ...pageErrors.map((error) => `page error: ${error}`),
    ];

    results.push({
      viewport,
      route: new URL(page.url()).pathname,
      requestHref,
      inAppHref,
      dimensions,
      consoleErrors,
      pageErrors,
      failedResponses,
      screenshot,
      blockers,
    });
    await context.close();
  }
} finally {
  await browser.close();
}

const manifest = {
  capturedAt: new Date().toISOString(),
  baseUrl,
  expectedCount: viewports.length,
  processedCount: results.length,
  results,
};
await writeFile(path.join(outputDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

const blockerCount = results.reduce((sum, result) => sum + result.blockers.length, 0);
process.stdout.write(
  `${JSON.stringify({ outputDir, processed: `${results.length}/${viewports.length}`, blockerCount })}\n`,
);
if (results.length !== viewports.length || blockerCount > 0) process.exitCode = 1;
