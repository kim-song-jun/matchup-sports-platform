import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const WEB = 'http://localhost:3013';
const EMAIL = 'summer.cup.champion@teameet.alpha';
const TEAM = 'ab300000-0000-4000-8000-000000000001';
const USER = 'ab200000-0000-4000-8000-000000000001';
const LEAGUE = 'ad100000-0000-4000-8000-000000000001';
const FIXTURE = 'ad400000-0000-4000-8000-000000000101';
const TOURNAMENT = 'ab100000-0000-4000-8000-000000000001';
const OUTPUT = path.resolve('output/playwright/task-158-local-showcase');
const FULLY_PUBLIC_RESULT_CAPTURES = new Map([
  ['06-team-match-detail', ['4 : 2']],
  ['08-league-fixture-result', ['4 : 2']],
  ['09-team-records-all', ['7경기']],
  ['10-team-records-league', ['1경기', '4 : 2']],
  ['11-team-records-friendly', ['2경기', '2 : 2', '1 : 3']],
  ['16-team-records-tournament', ['4경기']],
]);
const targets = [
  ['01-my-teams', '/my/teams', '서울 나이트 FC'],
  ['02-team-detail', `/teams/${TEAM}`, '서울 나이트 FC'],
  ['03-team-members', `/teams/${TEAM}/members`, '김민준'],
  ['04-team-matches', `/team-matches?teamId=${TEAM}`, '팀매치'],
  ['05-league', `/league-matches/${LEAGUE}`, '서울 나이트 풋살 리그'],
  ['06-team-match-detail', `/team-matches/${FIXTURE}`, '서울 나이트 FC'],
  ['07-team-match-result', `/team-matches/${FIXTURE}/result`, '경기 결과'],
  ['08-league-fixture-result', `/league-matches/${LEAGUE}/fixtures/${FIXTURE}`, '서울 나이트 FC'],
  ['09-team-records-all', `/teams/${TEAM}/records`, '서울 나이트 FC 전적'],
  ['10-team-records-league', `/teams/${TEAM}/records`, '서울 나이트 FC 전적', '리그'],
  ['11-team-records-friendly', `/teams/${TEAM}/records`, '서울 나이트 FC 전적', '친선'],
  ['12-reviews-received', '/my/reviews?tab=received', '받은 리뷰'],
  ['13-user-profile', `/users/${USER}`, '김민준'],
  ['14-user-records', `/users/${USER}/records`, '김민준'],
  ['15-player-card', `/users/${USER}/card`, '김민준'],
  ['16-team-records-tournament', `/teams/${TEAM}/records`, '서울 나이트 FC 전적', '대회'],
  ['17-tournament-results', `/tournaments/${TOURNAMENT}/results`, '최종결과'],
];

await fs.rm(OUTPUT, { recursive: true, force: true });
await fs.mkdir(OUTPUT, { recursive: true });
const server = await chromium.launchServer({ headless: false });
const browserPid = server.process().pid;
const browser = await chromium.connect(server.wsEndpoint());
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, colorScheme: 'light' });
await context.setExtraHTTPHeaders({ 'x-v1-user-email': EMAIL });
await context.addInitScript((email) => {
  localStorage.setItem('teameet.v1.userEmail', email);
  localStorage.removeItem('teameet.v1.userId');
}, EMAIL);
const page = await context.newPage();
const results = [];
console.log(`PLAYWRIGHT_BROWSER_PID=${browserPid} PARENT_PID=${process.pid}`);

try {
  await page.goto(`${WEB}/home`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForTimeout(2_000);
  for (const [name, route, expected, tab] of targets) {
    const consoleErrors = [];
    const pageErrors = [];
    const failedRequests = [];
    const badApiResponses = [];
    const onConsole = (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); };
    const onPageError = (error) => pageErrors.push(error.message);
    const onFailed = (request) => failedRequests.push(`${request.method()} ${request.url()} :: ${request.failure()?.errorText ?? 'unknown'}`);
    const onResponse = (response) => {
      if (response.url().includes('/api/v1/') && response.status() >= 400) badApiResponses.push(`${response.status()} ${response.url()}`);
    };
    page.on('console', onConsole);
    page.on('pageerror', onPageError);
    page.on('requestfailed', onFailed);
    page.on('response', onResponse);
    let status = 'ok';
    let error = null;
    try {
      await page.goto(`${WEB}${route}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
      await page.waitForTimeout(2_500);
      await page.waitForLoadState('domcontentloaded', { timeout: 10_000 }).catch(() => {});
      await page.waitForTimeout(500);
      if (tab) {
        await page.getByRole('tab', { name: tab, exact: true }).click();
        await page.waitForTimeout(1_500);
      }
      await page.addStyleTag({ content: 'nextjs-portal,[data-nextjs-dev-tools-button],#__next-dev-tools-indicator{display:none!important}' }).catch(async () => {
        await page.waitForTimeout(1_000);
        await page.addStyleTag({ content: 'nextjs-portal,[data-nextjs-dev-tools-button],#__next-dev-tools-indicator{display:none!important}' });
      });
      await page.waitForFunction(
        () => !document.body.innerText.includes('로그인 정보를 확인하고 있어요.'),
        undefined,
        { timeout: 10_000 },
      ).catch(() => {});
      await page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: 'instant' }));
      await page.waitForTimeout(150);
      const bodyText = await page.locator('body').innerText();
      if (!bodyText.includes(expected)) throw new Error(`expected text missing: ${expected}; body=${bodyText.slice(0, 300)}`);
      const publicResultExpectations = FULLY_PUBLIC_RESULT_CAPTURES.get(name);
      if (publicResultExpectations) {
        const forbidden = ['결과 비공개', '비공개 선수', '- : -'];
        const leakedPrivacyLabel = forbidden.find((label) => bodyText.includes(label));
        if (leakedPrivacyLabel) throw new Error(`public result still masked: ${leakedPrivacyLabel}`);
        const missingResult = publicResultExpectations.find((text) => !bodyText.includes(text));
        if (missingResult) throw new Error(`public result text missing: ${missingResult}; body=${bodyText.slice(0, 500)}`);
      }
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
      if (overflow) throw new Error('horizontal overflow');
      if (pageErrors.length || badApiResponses.length) throw new Error(JSON.stringify({ pageErrors, badApiResponses }));
    } catch (cause) {
      status = 'error';
      error = cause instanceof Error ? cause.message : String(cause);
    }
    const file = path.join(OUTPUT, `${name}.png`);
    await page.screenshot({ path: file, fullPage: true, scale: 'css' });
    results.push({ name, route, status, error, file: path.relative(process.cwd(), file).replaceAll('\\', '/'), consoleErrors, pageErrors, failedRequests, badApiResponses });
    console.log(`[${results.length}/${targets.length}] ${status.toUpperCase()} ${route}`);
    page.off('console', onConsole);
    page.off('pageerror', onPageError);
    page.off('requestfailed', onFailed);
    page.off('response', onResponse);
  }
} finally {
  await context.close().catch(() => {});
  await browser.close().catch(() => {});
  await server.close().catch(() => {});
}

await fs.writeFile(path.join(OUTPUT, 'manifest.json'), `${JSON.stringify({ capturedAt: new Date().toISOString(), viewport: '390x844', persona: EMAIL, browserPid, parentPid: process.pid, baseline: 'unavailable: first local showcase capture', total: targets.length, passed: results.filter((item) => item.status === 'ok').length, results }, null, 2)}\n`);
if (results.some((item) => item.status !== 'ok')) process.exitCode = 1;
