import fs from 'node:fs';
import path from 'node:path';
import playwright from 'playwright';

const { chromium } = playwright;
const baseUrl = process.env.QA_BASE_URL ?? 'http://127.0.0.1:3113';
const outputDir = path.join(process.cwd(), 'output/playwright/visual-audit/task178-team-match-history');
fs.mkdirSync(outputDir, { recursive: true });

const now = Date.now();
const response = (data) => ({ status: 'success', data, timestamp: new Date().toISOString() });
const items = [
  {
    teamMatchId: 'task178-open',
    id: 'task178-open',
    title: '주말 오전 풋살 상대팀을 구해요',
    imageUrl: null,
    sport: { sportId: 'sport-futsal', name: '풋살' },
    region: { regionId: 'region-seoul', name: '서울 마포' },
    place: { name: '상암 풋살장', addressText: '서울 마포구' },
    startsAt: new Date(now + 2 * 24 * 60 * 60 * 1000).toISOString(),
    endsAt: new Date(now + 2 * 24 * 60 * 60 * 1000 + 2 * 60 * 60 * 1000).toISOString(),
    deadlineAt: new Date(now + 24 * 60 * 60 * 1000).toISOString(),
    status: 'recruiting',
    displayState: 'recruiting',
    platformManaged: false,
    hostTeam: { teamId: 'team-open', name: '마포 유나이티드', logoUrl: null, trustState: 'verified', mannerScore: 4.8, wins: 12 },
    approvedOpponentTeam: null,
    costNote: '총 100,000원 · 상대팀 50,000원',
    levelLabel: '중급',
    matchFormat: '5:5',
    matchStyle: ['친선'],
    uniformColor: '파랑',
    genderRule: '성별 무관',
    viewerState: 'none',
  },
  {
    teamMatchId: 'task178-completed',
    id: 'task178-completed',
    title: '지난 주 성수 친선 팀매치',
    imageUrl: null,
    sport: { sportId: 'sport-football', name: '축구' },
    region: { regionId: 'region-seoul', name: '서울 성동' },
    place: { name: '성수 체육공원', addressText: '서울 성동구' },
    startsAt: new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString(),
    endsAt: new Date(now - 2 * 24 * 60 * 60 * 1000 + 2 * 60 * 60 * 1000).toISOString(),
    deadlineAt: new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString(),
    status: 'completed',
    displayState: 'completed',
    platformManaged: false,
    hostTeam: { teamId: 'team-home', name: '성수 FC', logoUrl: null, trustState: 'verified', mannerScore: 4.9, wins: 21 },
    approvedOpponentTeam: { teamId: 'team-away', name: '한강 로버스' },
    costNote: '총 180,000원 · 상대팀 90,000원',
    levelLabel: '중급~고급',
    matchFormat: '11:11',
    matchStyle: ['친선'],
    uniformColor: '검정',
    genderRule: '남',
    viewerState: 'none',
  },
];

const browser = await chromium.launch({ headless: false, channel: 'chrome' });
console.log(JSON.stringify({ runnerPid: process.pid, browser: 'chrome', headed: true, baseUrl }));

const results = [];
const context = await browser.newContext({ viewport: { width: 390, height: 900 } });
const page = await context.newPage();
try {
  for (const width of [390, 768, 1440]) {
    const consoleErrors = [];
    const failedRequests = [];

    const onConsole = (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    };
    const onRequestFailed = (request) => failedRequests.push(`${request.method()} ${request.url()}`);
    page.on('console', onConsole);
    page.on('requestfailed', onRequestFailed);
    await page.route('**/api/v1/team-matches**', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(response({ items, pageInfo: { nextCursor: null, hasNext: false } })),
    }));
    await page.route('**/api/v1/master/sports**', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(response([])),
    }));
    await page.route('**/api/v1/search/recent**', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(response([])),
    }));
    await page.route('**/api/v1/popups/active**', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(response([])),
    }));
    await page.route('**/api/v1/health**', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'ok' }),
    }));
    await page.route('**/api/v1/logs/client-error**', (route) => route.fulfill({
      status: 204,
    }));

    await page.setViewportSize({ width, height: width === 768 ? 1024 : 900 });
    await page.goto(`${baseUrl}/team-matches`, { waitUntil: 'domcontentloaded' });
    const completedCard = page.locator('a[href="/team-matches/task178-completed"]');
    await completedCard.waitFor({ state: 'visible' });
    await page.locator('a[href="/team-matches/task178-open"]').waitFor({ state: 'visible' });
    await page.waitForTimeout(750);

    const completedText = await completedCard.innerText();
    const metrics = await page.evaluate(() => ({
      viewportWidth: document.documentElement.clientWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
    }));
    const screenshotPath = path.join(outputDir, `after-${width}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    results.push({
      width,
      screenshotPath,
      completedVisible: completedText.includes('지난 주 성수 친선 팀매치'),
      completedBadge: completedText.includes('경기 종료'),
      mislabeledAsApplicationClosed: completedText.includes('신청 마감'),
      consoleErrors,
      failedRequests,
      ...metrics,
    });
    page.off('console', onConsole);
    page.off('requestfailed', onRequestFailed);
  }
} finally {
  await context.close();
  await browser.close();
}

const reportPath = path.join(outputDir, 'after-report.json');
fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
console.log(JSON.stringify({ reportPath, results }, null, 2));

const failures = results.filter((result) =>
  !result.completedVisible
  || !result.completedBadge
  || result.mislabeledAsApplicationClosed
  || result.documentScrollWidth > result.viewportWidth
  || result.bodyScrollWidth > result.viewportWidth
  || result.consoleErrors.length > 0
  || result.failedRequests.length > 0
);
if (failures.length > 0) process.exitCode = 1;
