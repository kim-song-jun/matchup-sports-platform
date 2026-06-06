import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  DEFAULT_ROUTES,
  REQUIRED_V1_BASE_URL,
  VIEWPORTS,
  detectLayoutIssues,
  manifestText,
  slugRoute,
  validateV1BaseUrl,
} from './v1-responsive-matrix-lib.mjs';

const args = new Set(process.argv.slice(2));
const baseUrl = process.env.V1_WEB_BASE_URL ?? REQUIRED_V1_BASE_URL;
const runId = process.env.RUN_ID ?? `v1-responsive-${new Date().toISOString().replace(/[:.]/g, '-')}`;
const outDir = path.join('output', 'playwright', 'visual-audit', runId);

if (args.has('--list')) {
  console.log(manifestText());
  process.exit(0);
}

if (args.has('--assert-v1-base')) {
  const result = validateV1BaseUrl(baseUrl);
  console.log(result.message);
  process.exit(result.ok ? 0 : 1);
}

const baseCheck = validateV1BaseUrl(baseUrl);
if (!baseCheck.ok) {
  console.error(baseCheck.message);
  process.exit(1);
}

async function collectMetrics(page) {
  return page.evaluate(() => {
    const fixed = [...document.querySelectorAll('.tm-bottom-nav, .tm-fixed-cta, .tm-chat-inputbar, .tm-notification-toast, .tm-filter-sheet')];
    const primaryCta = document.querySelector('.tm-btn-primary, [data-primary-cta="true"]');
    const fixedRects = fixed
      .filter((element) => element instanceof HTMLElement)
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return { className: element.className.toString(), top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right };
      });
    const fixedOverlaps = [];
    for (let i = 0; i < fixedRects.length; i += 1) {
      for (let j = i + 1; j < fixedRects.length; j += 1) {
        const a = fixedRects[i];
        const b = fixedRects[j];
        const overlaps = a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
        if (overlaps) fixedOverlaps.push({ a: a.className, b: b.className });
      }
    }
    const clippedText = [...document.querySelectorAll('button, a, .tm-badge, .tm-chip')]
      .filter((element) => element instanceof HTMLElement)
      .filter((element) => element.clientWidth > 0 && element.scrollWidth > element.clientWidth + 2)
      .slice(0, 8)
      .map((element) => ({ text: (element.textContent || '').trim().slice(0, 80), className: element.className.toString() }));
    const ctaRect = primaryCta instanceof HTMLElement ? primaryCta.getBoundingClientRect() : null;
    return {
      horizontalOverflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) > window.innerWidth + 1,
      fixedOverlaps,
      clippedText,
      hiddenPrimaryCta: ctaRect ? ctaRect.bottom <= 0 || ctaRect.top >= window.innerHeight || ctaRect.width === 0 || ctaRect.height === 0 : false,
    };
  });
}

async function main() {
  const { chromium } = await import('playwright');
  await mkdir(outDir, { recursive: true });
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || process.env.CHROME_EXECUTABLE });
  const results = [];

  try {
    for (const viewport of VIEWPORTS) {
      const page = await browser.newPage({ viewport, deviceScaleFactor: 1, isMobile: viewport.width < 768, hasTouch: viewport.width < 768 });
      for (const route of DEFAULT_ROUTES) {
        const url = new URL(route, baseUrl).toString();
        const response = await page.goto(url, { waitUntil: 'networkidle', timeout: 120_000 });
        await page.waitForTimeout(100);
        const metrics = await collectMetrics(page);
        const issues = detectLayoutIssues(metrics);
        const screenshot = `${viewport.name}__${slugRoute(route)}.png`;
        await page.screenshot({ path: path.join(outDir, screenshot), fullPage: false });
        results.push({ route, viewport, status: response?.status() ?? 0, screenshot, issues, metrics });
        console.log(`${viewport.name} ${route} ${issues.length ? 'FAIL' : 'OK'}`);
      }
      await page.close();
    }
  } finally {
    await browser.close();
  }

  const issueCount = results.reduce((sum, result) => sum + result.issues.length, 0);
  await writeFile(path.join(outDir, 'results.json'), JSON.stringify({ baseUrl, runId, viewports: VIEWPORTS, routes: DEFAULT_ROUTES, results }, null, 2));
  await writeFile(path.join(outDir, 'report.md'), `# V1 Responsive Matrix\n\n- Base URL: ${baseUrl}\n- Run ID: ${runId}\n- Issues: ${issueCount}\n`);
  console.log(`report=${path.join(outDir, 'report.md')}`);
  if (issueCount > 0) process.exitCode = 1;
}

await main();
