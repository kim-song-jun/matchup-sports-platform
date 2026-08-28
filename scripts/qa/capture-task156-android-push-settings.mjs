/**
 * Task 156 notification-settings visual and interaction audit.
 *
 * This runner uses the real v1 Web/API route and an isolated QA database. Native
 * bridge states are deterministic rendering checks only; they do not replace an
 * Android device permission/delivery verdict.
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const WEB_BASE = (process.env.V1_WEB_BASE ?? 'http://localhost:3013').replace(/\/$/, '');
const USER_EMAIL = process.env.V1_QA_USER_EMAIL ?? 'host@teameet.v1';
const USER_ID = process.env.V1_QA_USER_ID ?? null;
const STAMP = new Date().toISOString().replace(/[:.]/g, '-');
const OUTPUT_DIR = path.resolve(
  process.env.TASK156_UIQA_OUTPUT
    ?? path.join('output', 'playwright', 'visual-audit', `task156-notification-settings-${STAMP}`),
);
const ROUTE = '/my/settings/notifications';
const MODE = process.env.TASK156_UIQA_MODE ?? 'full';

const VIEWPORTS = [
  ['mobile-sm', 360, 780, true, true],
  ['mobile-md', 390, 844, true, true],
  ['mobile-lg', 430, 932, true, true],
  ['tablet-sm', 768, 1024, false, true],
  ['tablet-md', 834, 1112, false, true],
  ['tablet-lg', 1024, 1366, false, true],
  ['desktop-sm', 1280, 800, false, false],
  ['desktop-md', 1440, 900, false, false],
  ['desktop-lg', 1920, 1080, false, false],
].map(([key, width, height, isMobile, hasTouch]) => ({ key, width, height, isMobile, hasTouch }));

fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const results = [];

function flushResults() {
  fs.writeFileSync(path.join(OUTPUT_DIR, 'results.partial.json'), JSON.stringify({ results }, null, 2));
}

function installSession(context) {
  return context.addInitScript(({ userEmail, userId }) => {
    localStorage.setItem('teameet.v1.session', 'active');
    localStorage.setItem('teameet.v1.userEmail', userEmail);
    if (userId) localStorage.setItem('teameet.v1.userId', userId);
    else localStorage.removeItem('teameet.v1.userId');
  }, { userEmail: USER_EMAIL, userId: USER_ID });
}

function installNativeBridge(context, initial) {
  return context.addInitScript(({ permission, subscribed, failAction, holdAction }) => {
    window.TeameetNative = {
      postMessage(raw) {
        const request = JSON.parse(raw);
        if (request.type === failAction) throw new Error(`Controlled native bridge failure: ${request.type}`);
        if (request.type === holdAction) return;

        let nextPermission = permission;
        let nextSubscribed = subscribed;
        if (request.type === 'request-notification-permission') {
          nextPermission = 'granted';
          nextSubscribed = true;
        } else if (request.type === 'revoke-push-device') {
          nextSubscribed = false;
        }

        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('teameet:native-push-result', {
            detail: {
              requestId: request.requestId,
              permission: nextPermission,
              subscribed: nextSubscribed,
            },
          }));
        }, 30);
      },
    };
  }, initial);
}

function attachRuntimeEvidence(page) {
  const evidence = { consoleErrors: [], pageErrors: [], requestFailures: [], apiProblems: [] };
  page.on('console', (message) => {
    if (message.type() === 'error') evidence.consoleErrors.push(message.text().slice(0, 700));
  });
  page.on('pageerror', (error) => evidence.pageErrors.push(error.message.slice(0, 700)));
  page.on('requestfailed', (request) => {
    evidence.requestFailures.push({ url: request.url(), error: request.failure()?.errorText ?? 'failed' });
  });
  page.on('response', (response) => {
    if (response.status() >= 400 && response.url().includes('/api/v1/')) {
      evidence.apiProblems.push({ status: response.status(), url: response.url() });
    }
  });
  return evidence;
}

async function settle(page) {
  await page.waitForLoadState('domcontentloaded');
  await page.getByRole('heading', { name: '알림 설정' }).first().waitFor({ state: 'visible', timeout: 5_000 }).catch(() => {});
  await page.waitForTimeout(500);
}

async function inspectLayout(page) {
  return page.evaluate(() => {
    const interactive = [...document.querySelectorAll('button, a[href], input, select, textarea')]
      .filter((node) => node instanceof HTMLElement && node.offsetParent !== null)
      .map((node) => {
        const rect = node.getBoundingClientRect();
        return {
          label: node.getAttribute('aria-label') || node.textContent?.trim().slice(0, 80) || node.tagName,
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        };
      });
    return {
      url: location.href,
      title: document.title,
      scrollWidth: document.documentElement.scrollWidth,
      viewportWidth: innerWidth,
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1,
      documentHeight: document.documentElement.scrollHeight,
      interactive,
      sub44Targets: interactive.filter((item) => item.width < 44 || item.height < 44),
      switchCount: document.querySelectorAll('[role="switch"]').length,
      bodyText: document.body.innerText.slice(0, 4_000),
    };
  });
}

async function captureMatrix(browser) {
  for (const viewport of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      isMobile: viewport.isMobile,
      hasTouch: viewport.hasTouch,
      extraHTTPHeaders: { 'x-v1-user-email': USER_EMAIL },
    });
    await installSession(context);
    const page = await context.newPage();
    page.setDefaultTimeout(8_000);
    const runtime = attachRuntimeEvidence(page);
    let status = 'captured';
    let error = null;
    try {
      await page.goto(`${WEB_BASE}${ROUTE}`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
      await settle(page);
      await page.screenshot({ path: path.join(OUTPUT_DIR, `${viewport.key}__browser-default.png`), fullPage: true });
    } catch (caught) {
      status = 'blocked';
      error = caught instanceof Error ? caught.message : String(caught);
    }
    results.push({ kind: 'viewport', viewport, status, error, runtime, layout: await inspectLayout(page).catch(() => null) });
    flushResults();
    await context.close();
  }
}

async function captureNativeState(browser, key, bridge, action = null) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    extraHTTPHeaders: { 'x-v1-user-email': USER_EMAIL },
  });
  await installSession(context);
  await installNativeBridge(context, bridge);
  const page = await context.newPage();
  page.setDefaultTimeout(8_000);
  const runtime = attachRuntimeEvidence(page);
  let status = 'captured';
  let error = null;
  try {
    await page.goto(`${WEB_BASE}${ROUTE}`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await settle(page);
    if (action === 'toggle') {
      await page.getByRole('switch', { name: '푸시 알림 받기' }).click();
      await page.waitForTimeout(350);
    }
    await page.screenshot({ path: path.join(OUTPUT_DIR, `mobile-md__native-${key}.png`), fullPage: true });
  } catch (caught) {
    status = 'blocked';
    error = caught instanceof Error ? caught.message : String(caught);
  }
  results.push({ kind: 'native-rendering', key, bridge, action, status, error, runtime, layout: await inspectLayout(page).catch(() => null) });
  flushResults();
  await context.close();
}

async function captureNetworkStates(browser) {
  for (const key of ['loading', 'error']) {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      extraHTTPHeaders: { 'x-v1-user-email': USER_EMAIL },
    });
    await installSession(context);
    const page = await context.newPage();
    page.setDefaultTimeout(8_000);
    const runtime = attachRuntimeEvidence(page);
    await page.route('**/api/v1/me/settings', async (route) => {
      if (key === 'loading') {
        await new Promise((resolve) => setTimeout(resolve, 3_500));
        await route.continue();
      } else {
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ status: 'error', code: 'QA_CONTROLLED_FAILURE', message: 'Controlled UI audit failure' }),
        });
      }
    });

    let error = null;
    try {
      const navigation = page.goto(`${WEB_BASE}${ROUTE}`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
      if (key === 'loading') {
        await page.waitForTimeout(900);
        await page.screenshot({ path: path.join(OUTPUT_DIR, 'mobile-md__network-loading.png'), fullPage: true });
        await navigation;
        await settle(page);
      } else {
        await navigation;
        await page.getByText('알림 설정을 불러오지 못했어요.').waitFor({ state: 'visible', timeout: 12_000 }).catch(() => {});
        await page.waitForTimeout(500);
        await page.screenshot({ path: path.join(OUTPUT_DIR, 'mobile-md__network-error.png'), fullPage: true });
      }
    } catch (caught) {
      error = caught instanceof Error ? caught.message : String(caught);
      await page.screenshot({ path: path.join(OUTPUT_DIR, `mobile-md__network-${key}-crash.png`), fullPage: true }).catch(() => {});
    }
    results.push({ kind: 'network-state', key, error, runtime, layout: await inspectLayout(page).catch(() => null) });
    flushResults();
    await context.close();
  }
}

async function captureKeyboardAndPersistence(browser) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    extraHTTPHeaders: { 'x-v1-user-email': USER_EMAIL },
  });
  await installSession(context);
  const page = await context.newPage();
  page.setDefaultTimeout(8_000);
  const runtime = attachRuntimeEvidence(page);
  await page.goto(`${WEB_BASE}${ROUTE}`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await settle(page);

  const focusOrder = [];
  for (let index = 0; index < 12; index += 1) {
    await page.keyboard.press('Tab');
    focusOrder.push(await page.evaluate(() => ({
      tag: document.activeElement?.tagName ?? null,
      label: document.activeElement?.getAttribute('aria-label')
        || document.activeElement?.textContent?.trim().slice(0, 100)
        || null,
    })));
  }
  await page.screenshot({ path: path.join(OUTPUT_DIR, 'desktop-md__keyboard-focus.png'), fullPage: true });

  const marketing = page.getByRole('switch', { name: '마케팅 소식' });
  const before = await marketing.getAttribute('aria-checked');
  await marketing.click();
  await page.waitForTimeout(800);
  const afterClick = await marketing.getAttribute('aria-checked');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await settle(page);
  const afterReload = await page.getByRole('switch', { name: '마케팅 소식' }).getAttribute('aria-checked');
  await page.getByRole('switch', { name: '마케팅 소식' }).click();
  await page.waitForTimeout(800);
  const afterRestore = await page.getByRole('switch', { name: '마케팅 소식' }).getAttribute('aria-checked');

  results.push({
    kind: 'interaction',
    key: 'keyboard-and-persistence',
    focusOrder,
    persistence: { before, afterClick, afterReload, afterRestore },
    runtime,
    layout: await inspectLayout(page),
  });
  flushResults();
  await context.close();
}

const browser = await chromium.launch({ headless: false });
try {
  if (MODE === 'network') {
    await captureNetworkStates(browser);
  } else if (MODE === 'denied') {
    await captureNativeState(browser, 'denied', { permission: 'denied', subscribed: false });
  } else {
    await captureMatrix(browser);
    await captureNativeState(browser, 'off', { permission: 'default', subscribed: false });
    await captureNativeState(browser, 'on', { permission: 'granted', subscribed: true });
    await captureNativeState(browser, 'denied', { permission: 'denied', subscribed: false });
    await captureNativeState(browser, 'pending', { permission: 'default', subscribed: false, holdAction: 'request-notification-permission' }, 'toggle');
    await captureNativeState(browser, 'bridge-failure', { permission: 'default', subscribed: false, failAction: 'request-notification-permission' }, 'toggle');
    await captureNetworkStates(browser);
    await captureKeyboardAndPersistence(browser);
  }
} finally {
  await browser.close();
}

const summary = {
  route: ROUTE,
  webBase: WEB_BASE,
  userEmail: USER_EMAIL,
  capturedAt: new Date().toISOString(),
  nativeStateDisclaimer: 'Controlled bridge rendering only; not an Android OS permission or FCM delivery verdict.',
  resultCount: results.length,
  blockedCount: results.filter((result) => result.status === 'blocked' || result.error).length,
  consoleErrorCount: results.reduce((sum, result) => sum + (result.runtime?.consoleErrors.length ?? 0), 0),
  pageErrorCount: results.reduce((sum, result) => sum + (result.runtime?.pageErrors.length ?? 0), 0),
  apiProblemCount: results.reduce((sum, result) => sum + (result.runtime?.apiProblems.length ?? 0), 0),
};

fs.writeFileSync(path.join(OUTPUT_DIR, 'results.json'), JSON.stringify({ summary, results }, null, 2));
fs.writeFileSync(path.join(OUTPUT_DIR, 'report.md'), [
  '# Task 156 Notification Settings UI/UX Audit',
  '',
  `- Route: \`${ROUTE}\``,
  `- Viewports: ${VIEWPORTS.length}`,
  `- Results: ${summary.resultCount}`,
  `- Blocked/errors: ${summary.blockedCount}`,
  `- Console errors: ${summary.consoleErrorCount}`,
  `- Page errors: ${summary.pageErrorCount}`,
  `- API problems: ${summary.apiProblemCount}`,
  '- Native states are controlled bridge rendering checks, not real-device verdicts.',
  '',
].join('\n'));

console.log(`TASK156_UIQA_OUTPUT=${OUTPUT_DIR}`);
console.log(JSON.stringify(summary, null, 2));
