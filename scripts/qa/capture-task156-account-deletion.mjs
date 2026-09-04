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
    const scrollRegion = page.locator('.tm-auth-scroll');
    const scrollRegionDimensions = await scrollRegion.evaluate((element) => ({
      scrollHeight: element.scrollHeight,
      clientHeight: element.clientHeight,
      scrollTop: element.scrollTop,
    }));
    const screenshot = path.join(outputDir, `${viewport.name}.png`);
    await page.screenshot({ path: screenshot, fullPage: true });
    let bottomScreenshot = null;
    let bottomLayout = null;
    let reachedScrollBottom = true;
    if (scrollRegionDimensions.scrollHeight > scrollRegionDimensions.clientHeight + 1) {
      reachedScrollBottom = await scrollRegion.evaluate((element) => {
        element.scrollTop = element.scrollHeight;
        return Math.abs(element.scrollHeight - element.clientHeight - element.scrollTop) <= 1;
      });
      bottomScreenshot = path.join(outputDir, `${viewport.name}-bottom.png`);
      await page.screenshot({ path: bottomScreenshot });
      bottomLayout = await page.evaluate(() => {
        const bounds = (selector) => {
          const rect = document.querySelector(selector)?.getBoundingClientRect();
          return rect ? { top: rect.top, bottom: rect.bottom } : null;
        };
        return {
          viewportHeight: window.innerHeight,
          header: bounds('.tm-auth-topbar'),
          scrollRegion: bounds('.tm-auth-scroll'),
          privacyLink: bounds('a[href="/terms?document=privacy"]'),
        };
      });
    }

    const blockers = [
      ...(response?.ok() ? [] : [`document status ${response?.status() ?? 'missing'}`]),
      ...(requestHref?.startsWith('mailto:teameetsports@naver.com?') ? [] : ['invalid public request link']),
      ...(inAppHref === '/my/settings/withdrawal' ? [] : ['invalid in-app request link']),
      ...(dimensions.scrollWidth <= dimensions.clientWidth ? [] : ['horizontal overflow']),
      ...(reachedScrollBottom ? [] : ['auth scroll region cannot reach bottom']),
      ...(bottomLayout?.header && bottomLayout.header.top < -1 ? ['top bar is clipped after scrolling'] : []),
      ...(bottomLayout?.privacyLink && bottomLayout.privacyLink.bottom <= bottomLayout.viewportHeight + 1
        ? []
        : bottomLayout ? ['privacy link is not visible at scroll bottom'] : []),
      ...consoleErrors.map((error) => `console error: ${error}`),
      ...pageErrors.map((error) => `page error: ${error}`),
      ...failedResponses.map(({ status, url }) => `failed response ${status}: ${url}`),
    ];

    results.push({
      viewport,
      route: new URL(page.url()).pathname,
      requestHref,
      inAppHref,
      dimensions,
      scrollRegionDimensions,
      reachedScrollBottom,
      bottomLayout,
      consoleErrors,
      pageErrors,
      failedResponses,
      screenshot,
      bottomScreenshot,
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
