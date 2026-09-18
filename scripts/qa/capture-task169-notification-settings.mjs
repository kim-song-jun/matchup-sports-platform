/**
 * Task 169 notification settings visual QA.
 *
 * Renders the real Next route and styles with API responses intercepted at the
 * network boundary. The controlled native bridge verifies web rendering only;
 * Gradle tests cover the Android source separately.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const BASE = process.env.V1_WEB_BASE ?? 'http://localhost:3013';
const OUT = path.resolve(
  process.env.TASK169_UIQA_OUTPUT
    ?? path.join('output', 'playwright', 'visual-audit', 'task169-notification-settings'),
);
const NOW = '2026-09-09T07:00:00.000Z';
const SETTINGS = {
  account: {
    email: 'minjun.kim@teameet.test',
    phone: '01012345678',
    accountStatus: 'active',
    providers: ['password'],
    hasPassword: true,
  },
  profile: { displayName: '김민준' },
  theme: 'light',
  notifications: {
    activityEnabled: true,
    matchEnabled: true,
    teamEnabled: true,
    teamMatchEnabled: true,
    chatEnabled: true,
    noticeEnabled: true,
    marketingEnabled: false,
  },
};
const SESSION = {
  user: {
    id: 'qa-user',
    email: 'minjun.kim@teameet.test',
    accountStatus: 'active',
    onboardingStatus: 'completed',
  },
  profile: { displayName: '김민준', nickname: '민준킴', avatarUrl: null, regionSummary: '서울 마포구' },
  termsCompliance: { compliant: true, pendingRequiredDocumentIds: [], nextRoute: null },
  verification: { emailVerified: true, phoneVerified: true },
  socialSignupPrefill: null,
};
const VIEWPORTS = [
  { key: 'mobile', width: 390, height: 844, isMobile: true, hasTouch: true },
  { key: 'tablet', width: 834, height: 1112, isMobile: false, hasTouch: true },
  { key: 'desktop', width: 1440, height: 900, isMobile: false, hasTouch: false },
];
const HIDE_DEVTOOLS =
  'nextjs-portal,[data-nextjs-dev-tools-button],#__next-dev-tools-indicator,[data-nextjs-toast]{display:none!important}';

await fs.mkdir(OUT, { recursive: true });
const results = [];
const browser = await chromium.launch({ headless: false });

function json(data) {
  return {
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ status: 'success', data, timestamp: NOW }),
  };
}

async function configure(context, nativeDenied = false) {
  await context.addInitScript(({ denied }) => {
    localStorage.setItem('teameet.v1.session', 'active');
    localStorage.setItem('teameet.v1.userId', 'qa-user');
    localStorage.setItem('teameet.v1.userEmail', 'minjun.kim@teameet.test');
    if (!denied) return;
    let permission = 'denied';
    let subscribed = false;
    window.TeameetNative = {
      postMessage(raw) {
        const request = JSON.parse(raw);
        if (request.type === 'open-notification-settings') {
          permission = 'granted';
          subscribed = true;
        } else if (request.type === 'revoke-push-device') {
          subscribed = false;
        }
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('teameet:native-push-result', {
            detail: { requestId: request.requestId, permission, subscribed },
          }));
        }, 40);
      },
    };
  }, { denied: nativeDenied });
  await context.route('**/api/v1/**', async (route) => {
    const url = route.request().url();
    if (url.includes('/auth/me')) return route.fulfill(json(SESSION));
    if (url.includes('/me/settings')) return route.fulfill(json(SETTINGS));
    if (url.includes('/popups/active')) return route.fulfill(json({ items: [] }));
    return route.fulfill(json({}));
  });
}

async function inspect(page, key) {
  const runtime = {
    consoleErrors: [],
    knownWarnings: [],
    knownRealtimeProblems: [],
    pageErrors: [],
    requestFailures: [],
    responseProblems: [],
  };
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    if (
      (text.includes('Cannot update a component') && text.includes('AppShellFrame'))
      || (text.includes('Failed to load resource') && message.location().url.includes('/socket.io/'))
    ) {
      runtime.knownWarnings.push(text);
      return;
    }
    runtime.consoleErrors.push(text);
  });
  page.on('pageerror', (error) => runtime.pageErrors.push(error.message));
  page.on('requestfailed', (request) => runtime.requestFailures.push({
    url: request.url(),
    error: request.failure()?.errorText ?? 'failed',
  }));
  page.on('response', (response) => {
    if (response.status() >= 400) {
      if (response.url().includes('/socket.io/')) {
        runtime.knownRealtimeProblems.push({ status: response.status(), url: response.url() });
        return;
      }
      runtime.responseProblems.push({ status: response.status(), url: response.url() });
    }
  });
  await page.goto(`${BASE}/my/settings/notifications`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: '알림 설정', exact: true }).first().waitFor();
  await page.getByText('받을 알림 고르기', { exact: true }).waitFor();
  await page.addStyleTag({ content: HIDE_DEVTOOLS });
  await page.waitForTimeout(350);
  const layout = await page.evaluate(() => ({
    viewportWidth: innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1,
    switchLabels: [...document.querySelectorAll('[role="switch"]')]
      .map((node) => node.getAttribute('aria-label')),
  }));
  results.push({ key, runtime, layout });
  return { runtime, layout };
}

try {
  for (const viewport of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      isMobile: viewport.isMobile,
      hasTouch: viewport.hasTouch,
      permissions: ['notifications'],
    });
    await configure(context);
    const page = await context.newPage();
    await inspect(page, viewport.key);
    await page.screenshot({ path: path.join(OUT, `${viewport.key}__settings.png`), fullPage: true });
    await context.close();
  }

  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  await configure(context, true);
  const page = await context.newPage();
  await inspect(page, 'android-denied');
  const recovery = page.getByRole('button', { name: '휴대폰 알림 켜기' });
  await recovery.waitFor();
  await page.screenshot({ path: path.join(OUT, 'mobile__android-denied.png'), fullPage: true });
  await recovery.click();
  await page.getByRole('switch', { name: '푸시 알림 받기' }).waitFor();
  await page.screenshot({ path: path.join(OUT, 'mobile__android-recovered.png'), fullPage: true });
  await context.close();
} finally {
  await browser.close();
}

const summary = {
  resultCount: results.length,
  horizontalOverflowCount: results.filter((result) => result.layout.horizontalOverflow).length,
  consoleErrorCount: results.reduce((sum, result) => sum + result.runtime.consoleErrors.length, 0),
  pageErrorCount: results.reduce((sum, result) => sum + result.runtime.pageErrors.length, 0),
  requestFailureCount: results.reduce((sum, result) => sum + result.runtime.requestFailures.length, 0),
  responseProblemCount: results.reduce((sum, result) => sum + result.runtime.responseProblems.length, 0),
  knownWarningCount: results.reduce((sum, result) => sum + result.runtime.knownWarnings.length, 0),
  knownRealtimeProblemCount: results.reduce(
    (sum, result) => sum + result.runtime.knownRealtimeProblems.length,
    0,
  ),
};
await fs.writeFile(path.join(OUT, 'results.json'), JSON.stringify({ summary, results }, null, 2));
console.log(`TASK169_UIQA_OUTPUT=${OUT}`);
console.log(JSON.stringify(summary, null, 2));
if (
  summary.horizontalOverflowCount > 0
  || summary.consoleErrorCount > 0
  || summary.pageErrorCount > 0
  || summary.requestFailureCount > 0
  || summary.responseProblemCount > 0
) process.exitCode = 1;
