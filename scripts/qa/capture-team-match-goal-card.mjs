import fs from 'node:fs';
import path from 'node:path';
import playwright from 'playwright';

const { chromium } = playwright;
const baseUrl = process.env.QA_BASE_URL ?? 'http://127.0.0.1:3113';
const outputDir = path.join(process.cwd(), 'output/playwright/visual-audit/team-match-goal-card');
fs.mkdirSync(outputDir, { recursive: true });

const response = (data) => ({ status: 'success', data, timestamp: new Date().toISOString() });
const fixture = {
  teamMatchId: 'goal-card-qa',
  title: '한강 런너스 풀백 축구클럽 vs 마포 유나이티드',
  startsAt: '2026-09-29T10:00:00.000Z',
  phase: 'live',
  version: 4,
  serverTime: '2026-09-29T10:30:00.000Z',
  canEdit: true,
  participant: true,
  ownSideId: 'home',
  lineupReady: true,
  missingSides: [],
  sides: [
    { id: 'home', key: 'HOME', name: '한강 런너스 풀백 축구클럽', score: 2 },
    { id: 'away', key: 'AWAY', name: '마포 유나이티드', score: 1 },
  ],
  subMatches: [],
  participants: [
    { id: 'home-1', sideId: 'home', name: '김민수', jerseyNumber: 7, profileImageUrl: null },
    { id: 'home-2', sideId: 'home', name: '한글이름이긴선수', jerseyNumber: 10, profileImageUrl: null },
    { id: 'away-1', sideId: 'away', name: '박지훈', jerseyNumber: 9, profileImageUrl: null },
  ],
  goals: [
    { id: 'goal-1', sideId: 'home', participantId: 'home-1', ownGoal: false, minute: 12, subMatchId: null },
    { id: 'goal-2', sideId: 'home', participantId: 'home-2', ownGoal: false, minute: null, subMatchId: null },
    { id: 'goal-3', sideId: 'away', participantId: 'away-1', ownGoal: true, minute: 28, subMatchId: null },
  ],
  history: [],
  confirmations: [],
  officialAt: null,
};

const browser = await chromium.launch({ headless: false, channel: 'chrome' });
console.log(JSON.stringify({ runnerPid: process.pid, headed: true, browser: 'chrome', baseUrl }));

const results = [];
try {
  for (const width of [390, 768, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 }, locale: 'ko-KR' });
    const page = await context.newPage();
    const consoleErrors = [];
    const pageErrors = [];
    const failedRequests = [];
    const failedResponses = [];
    page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('requestfailed', (request) => failedRequests.push(`${request.method()} ${request.url()}`));
    page.on('response', (res) => { if (res.url().includes('/api/v1/') && res.status() >= 400) failedResponses.push(`${res.status()} ${res.url()}`); });
    await page.route('**/api/v1/**', async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith('/team-matches/goal-card-qa/record')) {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(response(fixture)) });
        return;
      }
      if (url.pathname.endsWith('/logs/client-error')) {
        await route.fulfill({ status: 204 });
        return;
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(response(url.pathname.endsWith('/auth/me') ? null : [])) });
    });

    await page.goto(`${baseUrl}/team-matches/goal-card-qa/record`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('group', { name: '김민수 득점 기록' }).waitFor({ state: 'visible' });
    await page.waitForTimeout(300);
    const metrics = await page.evaluate(() => {
      const rows = [...document.querySelectorAll('[aria-label$="득점 기록"]')];
      return {
        viewportWidth: document.documentElement.clientWidth,
        documentScrollWidth: document.documentElement.scrollWidth,
        bodyScrollWidth: document.body.scrollWidth,
        rowCount: rows.length,
        rows: rows.map((row) => {
          const player = row.firstElementChild?.getBoundingClientRect();
          const actions = row.querySelector('[aria-label$="득점 관리"]')?.getBoundingClientRect();
          return {
            rowWidth: Math.round(row.getBoundingClientRect().width),
            playerBottom: player ? Math.round(player.bottom) : null,
            actionsTop: actions ? Math.round(actions.top) : null,
            actionsRight: actions ? Math.round(actions.right) : null,
          };
        }),
      };
    });
    const screenshotPath = path.join(outputDir, `after-${width}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true, animations: 'disabled' });
    results.push({ width, screenshotPath, consoleErrors, pageErrors, failedRequests, failedResponses, ...metrics });
    await context.close();
  }
} finally {
  await browser.close();
}

const reportPath = path.join(outputDir, 'after-report.json');
fs.writeFileSync(reportPath, `${JSON.stringify(results, null, 2)}\n`);
console.log(JSON.stringify({ reportPath, results }, null, 2));

const failures = results.filter((result) =>
  result.rowCount !== 3
  || result.documentScrollWidth > result.viewportWidth
  || result.bodyScrollWidth > result.viewportWidth
  || result.consoleErrors.length > 0
  || result.pageErrors.length > 0
  || result.failedRequests.length > 0
  || result.failedResponses.length > 0
  || result.rows.some((row) => row.actionsRight !== null && row.actionsRight > result.viewportWidth)
);
if (failures.length > 0) process.exitCode = 1;
