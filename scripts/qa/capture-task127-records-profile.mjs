import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const WEB = 'http://localhost:3013';
const PROD_WEB = 'https://teameet.co.kr';
const PROD_API = 'https://teameet.co.kr/api/v1';
const TEAM_ID = 'b2f113fb-5457-45c4-9a77-0833698be7e9';
const USER_ID = '9014c458-e16b-4a63-9663-e5157b1e8517';
const PENALTY_DECIDED_GAME_ID = 'e4ae62f8-90fc-4ffc-96b9-477c52860709';
const OUTPUT = path.resolve('docs/screenshots/task-127-records-profile');
const HIDE_DEV_UI =
  'nextjs-portal,[data-nextjs-dev-tools-button],#__next-dev-tools-indicator,[data-nextjs-toast]{display:none!important}';

const viewports = [
  { key: 'mobile-390', width: 390, height: 844 },
  { key: 'tablet-768', width: 768, height: 1024 },
  { key: 'desktop-1440', width: 1440, height: 900 },
];

async function getJson(pathname) {
  const response = await fetch(PROD_API + pathname);
  if (!response.ok) {
    throw new Error('GET ' + pathname + ' failed: ' + response.status + ' ' + (await response.text()));
  }
  return response.json();
}

const teamRecords = await getJson('/teams/' + TEAM_ID + '/records');
const profile = await getJson('/users/' + USER_ID + '/public-profile');
// 승부차기로 결판난 결승 한 건만 수리된 값으로 덮어 이 PR이 고치는 두 가지(승패 판정,
// 정규시간과 분리된 승부차기 표기)를 화면에서 확인한다. 나머지 행은 승부차기가 없던
// 경기이므로 penalties=null 그대로 둔다.
const repairedItems = teamRecords.data.items.map((item) =>
  item.gameId === PENALTY_DECIDED_GAME_ID
    ? { ...item, result: 'WON', penalties: { for: 3, against: 2 } }
    : { ...item, penalties: null },
);
const repairedTeamRecords = {
  ...teamRecords,
  data: {
    ...teamRecords.data,
    summary: { ...teamRecords.data.summary, won: 5, drawn: 0, lost: 0 },
    items: repairedItems,
  },
};
const repairedProfile = {
  ...profile,
  data: {
    ...profile.data,
    activitySummary: {
      totals: { matchCount: 5, tournamentCount: 1, teamCount: 1, reviewCount: 0 },
      monthly: { matchCount: 5, tournamentCount: 1, teamJoinCount: 0, reviewCount: 0 },
    },
  },
};

await fs.mkdir(OUTPUT, { recursive: true });
const results = [];
const browserServer = await chromium.launchServer({ headless: false });
const browserPid = browserServer.process().pid;
const browser = await chromium.connect(browserServer.wsEndpoint());
console.log('PLAYWRIGHT_BROWSER_PID=' + browserPid + ' PARENT_PID=' + process.pid);

try {
  for (const viewport of viewports) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: 1,
      colorScheme: 'light',
    });
    const baselinePage = await context.newPage();
    await baselinePage.goto(PROD_WEB + '/teams/' + TEAM_ID + '/records', {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    await baselinePage.waitForTimeout(1500);
    const baselineRecordsScreenshot = path.join(OUTPUT, viewport.key + '-baseline-team-records.png');
    await baselinePage.screenshot({ path: baselineRecordsScreenshot, fullPage: true, scale: 'css' });
    await baselinePage.goto(PROD_WEB + '/users/' + USER_ID, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    await baselinePage.waitForTimeout(1500);
    const baselineProfileScreenshot = path.join(OUTPUT, viewport.key + '-baseline-public-profile.png');
    await baselinePage.screenshot({ path: baselineProfileScreenshot, fullPage: true, scale: 'css' });
    await baselinePage.close();

    const page = await context.newPage();
    const consoleErrors = [];
    const pageErrors = [];
    const requestFailures = [];
    const apiResponses = [];

    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('requestfailed', (request) => {
      const failure = request.failure()?.errorText ?? 'unknown';
      if (request.url().endsWith('/api/v1/health') && failure === 'net::ERR_ABORTED') return;
      if (
        failure === 'net::ERR_ABORTED' &&
        (request.resourceType() === 'font' || request.resourceType() === 'image')
      ) {
        return;
      }
      requestFailures.push(request.method() + ' ' + request.url() + ' :: ' + failure);
    });
    page.on('response', (response) => {
      if (response.url().includes('/api/v1/')) {
        apiResponses.push({ url: response.url(), status: response.status() });
      }
    });
    await page.route('**/api/v1/teams/' + TEAM_ID + '/records**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(repairedTeamRecords) }),
    );
    await page.route('**/api/v1/users/' + USER_ID + '/public-profile**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(repairedProfile) }),
    );

    await page.goto(WEB + '/teams/' + TEAM_ID + '/records', {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    await page.addStyleTag({ content: HIDE_DEV_UI });
    // 정규시간 스코어를 승부차기 숫자로 덮지 않고 보조 표기로만 붙인다(`formatTeamRecordPenaltyScoreline`).
    await page.getByText('승부차기 3-2').waitFor({ state: 'visible' });
    const recordsText = await page.locator('body').innerText();
    if (!recordsText.includes('5·0·0')) throw new Error(viewport.key + ': repaired W-D-L summary missing');
    if (recordsText.includes('정정됨')) throw new Error(viewport.key + ': corrected badge still visible');
    const recordOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    if (recordOverflow) throw new Error(viewport.key + ': team records has horizontal overflow');
    const recordsScreenshot = path.join(OUTPUT, viewport.key + '-team-records.png');
    await page.screenshot({ path: recordsScreenshot, fullPage: true, scale: 'css' });

    await page.goto(WEB + '/users/' + USER_ID, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.addStyleTag({ content: HIDE_DEV_UI });
    await page.getByText('활동 요약').waitFor({ state: 'visible' });
    const profileText = await page.locator('body').innerText();
    if (!profileText.includes('대회')) throw new Error(viewport.key + ': tournament activity stat missing');
    const profileOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    if (profileOverflow) throw new Error(viewport.key + ': public profile has horizontal overflow');
    const profileScreenshot = path.join(OUTPUT, viewport.key + '-public-profile.png');
    await page.screenshot({ path: profileScreenshot, fullPage: true, scale: 'css' });

    if (consoleErrors.length || pageErrors.length || requestFailures.length) {
      throw new Error(
        viewport.key +
          ': browser errors detected ' +
          JSON.stringify({ consoleErrors, pageErrors, requestFailures }),
      );
    }
    results.push({
      viewport: viewport.width + 'x' + viewport.height,
      baselineRecordsScreenshot: path
        .relative(process.cwd(), baselineRecordsScreenshot)
        .replaceAll('\\', '/'),
      baselineProfileScreenshot: path
        .relative(process.cwd(), baselineProfileScreenshot)
        .replaceAll('\\', '/'),
      recordsScreenshot: path.relative(process.cwd(), recordsScreenshot).replaceAll('\\', '/'),
      profileScreenshot: path.relative(process.cwd(), profileScreenshot).replaceAll('\\', '/'),
      apiResponses,
      consoleErrors,
      pageErrors,
      requestFailures,
    });
    console.log('PASS ' + viewport.key);
    await context.close();
  }
} finally {
  await browser.close().catch(() => {});
  await browserServer.close().catch(() => {});
}

await fs.writeFile(
  path.join(OUTPUT, 'manifest.json'),
  JSON.stringify(
    {
      browserPid,
      parentPid: process.pid,
      routes: ['/teams/' + TEAM_ID + '/records', '/users/' + USER_ID],
      fixtureSource: 'production public API response patched with the post-migration projection contract',
      results,
    },
    null,
    2,
  ) + '\n',
);
