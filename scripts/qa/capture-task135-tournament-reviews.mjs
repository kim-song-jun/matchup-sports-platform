import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const WEB = 'http://localhost:3013';
const API = 'http://localhost:8121/api/v1';
const TOURNAMENT_ID = '13500000-0000-4000-8000-000000000001';
const ROUTE = `/tournaments/${TOURNAMENT_ID}`;
const OUTPUT = path.resolve('docs/visual-qa/task-135-tournament-reviews');
const HIDE_DEV_UI = 'nextjs-portal,[data-nextjs-dev-tools-button],#__next-dev-tools-indicator,[data-nextjs-toast]{display:none!important}';

const personas = [
  {
    key: 'member-light',
    userId: '1da78a20-8746-4943-a682-18f9e392607b',
    email: '12@1.1',
    theme: 'light',
    remaining: 1,
  },
  {
    key: 'owner-dark',
    userId: '00000000-0000-4000-8000-00000000a001',
    email: 'host@teameet.v1',
    theme: 'dark',
    remaining: 2,
  },
];

const viewports = [
  { key: 'mobile-390', width: 390, height: 844 },
  { key: 'tablet-768', width: 768, height: 1024 },
  { key: 'desktop-1440', width: 1440, height: 900 },
];

async function apiRequest(persona, pathname, init = {}) {
  const response = await fetch(`${API}${pathname}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      'x-v1-user-id': persona.userId,
      'x-v1-user-email': persona.email,
      ...init.headers,
    },
  });
  if (!response.ok) throw new Error(`${init.method ?? 'GET'} ${pathname} failed: ${response.status} ${await response.text()}`);
  return response.json();
}

async function readTheme(persona) {
  const result = await apiRequest(persona, '/me/settings');
  return result.data.theme;
}

async function writeTheme(persona, theme) {
  await apiRequest(persona, '/me/settings', { method: 'PATCH', body: JSON.stringify({ theme }) });
}

await fs.mkdir(OUTPUT, { recursive: true });
const originalThemes = new Map();
const results = [];
const browserServer = await chromium.launchServer({ headless: false });
const browserPid = browserServer.process().pid;
const browser = await chromium.connect(browserServer.wsEndpoint());
console.log(`PLAYWRIGHT_BROWSER_PID=${browserPid} PARENT_PID=${process.pid}`);

try {
  for (const persona of personas) {
    const originalTheme = await readTheme(persona);
    originalThemes.set(persona.userId, originalTheme);
    await writeTheme(persona, persona.theme);

    for (const viewport of viewports) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: 1,
        colorScheme: persona.theme,
      });
      await context.addInitScript(
        ([userId, email, theme]) => {
          localStorage.setItem('teameet.v1.userId', userId);
          localStorage.setItem('teameet.v1.userEmail', email);
          localStorage.setItem('tm-theme', theme);
        },
        [persona.userId, persona.email, persona.theme],
      );

      const page = await context.newPage();
      const consoleErrors = [];
      const pageErrors = [];
      const requestFailures = [];
      const apiResponses = [];
      page.on('console', (message) => {
        if (message.type() === 'error') consoleErrors.push(message.text());
      });
      page.on('pageerror', (error) => pageErrors.push(error.message));
      page.on('requestfailed', (request) => requestFailures.push(`${request.method()} ${request.url()} :: ${request.failure()?.errorText ?? 'unknown'}`));
      page.on('response', (response) => {
        if (response.url().includes('/api/v1/reviews') || response.url().includes(`/api/v1/tournaments/${TOURNAMENT_ID}`)) {
          apiResponses.push({ url: response.url(), status: response.status() });
        }
      });

      await page.goto(`${WEB}${ROUTE}`, { waitUntil: 'networkidle', timeout: 60_000 });
      await page.addStyleTag({ content: HIDE_DEV_UI });
      const section = page.locator('section[aria-labelledby="fixture-review-heading"]');
      await section.waitFor({ state: 'visible', timeout: 30_000 });
      const sectionText = await section.innerText();
      if (!sectionText.includes('PK 5 : 4')) throw new Error(`${persona.key}/${viewport.key}: PK score missing`);
      if (!sectionText.includes(`남은 리뷰 ${persona.remaining}개`)) {
        throw new Error(`${persona.key}/${viewport.key}: expected remaining=${persona.remaining}, text=${sectionText}`);
      }
      const reviewResponse = apiResponses.find((entry) => entry.url.includes('/api/v1/reviews'));
      if (!reviewResponse || reviewResponse.status !== 200) {
        throw new Error(`${persona.key}/${viewport.key}: review API response is not 200`);
      }
      if (consoleErrors.length || pageErrors.length || requestFailures.length) {
        throw new Error(`${persona.key}/${viewport.key}: browser errors detected`);
      }

      await section.scrollIntoViewIfNeeded();
      await page.evaluate(() => window.scrollBy(0, -96));
      await page.waitForTimeout(500);
      const outputDir = path.join(OUTPUT, viewport.key);
      await fs.mkdir(outputDir, { recursive: true });
      const screenshot = path.join(outputDir, `${persona.key}.png`);
      await page.screenshot({ path: screenshot, fullPage: false, scale: 'css' });
      results.push({
        persona: persona.key,
        viewport: `${viewport.width}x${viewport.height}`,
        screenshot: path.relative(process.cwd(), screenshot).replaceAll('\\', '/'),
        sectionText,
        apiResponses,
        consoleErrors,
        pageErrors,
        requestFailures,
        documentTheme: await page.evaluate(() => document.documentElement.classList.contains('dark') ? 'dark' : 'light'),
      });
      console.log(`PASS ${persona.key} ${viewport.key} -> ${screenshot}`);
      await context.close();
    }
  }
} finally {
  for (const persona of personas) {
    const originalTheme = originalThemes.get(persona.userId);
    if (originalTheme) await writeTheme(persona, originalTheme).catch(() => {});
  }
  await browser.close().catch(() => {});
  await browserServer.close().catch(() => {});
}

await fs.writeFile(path.join(OUTPUT, 'manifest.json'), `${JSON.stringify({ browserPid, parentPid: process.pid, route: ROUTE, results }, null, 2)}\n`);
