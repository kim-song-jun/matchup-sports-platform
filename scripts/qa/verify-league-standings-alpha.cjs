const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

async function main() {
  const url = new URL(process.argv[2]);
  assert.equal(url.hostname, 'alpha.teameet.co.kr', '이 검증은 alpha에서만 실행해요.');
  const tournamentId = url.pathname.match(/^\/tournaments\/([^/]+)\/bracket$/)?.[1];
  assert.ok(tournamentId, '대진 페이지 URL을 전달해 주세요.');
  const output = path.resolve(__dirname, '../../docs/screenshots/league-standings-inline-records-2026-10-14');
  fs.mkdirSync(output, { recursive: true });
  const report = { url: url.href, persona: '비로그인', viewports: [], consoleErrors: [], pageErrors: [], networkFailures: [], knownGuestAuthResponses: [], browserClosed: false };
  const server = await chromium.launchServer({ channel: 'chrome', headless: false });
  report.browserPid = server.process().pid;
  report.parentPid = process.pid;
  console.log(JSON.stringify({ browserPid: report.browserPid, parentPid: report.parentPid }));
  let browser;
  try {
    browser = await chromium.connect(server.wsEndpoint());
    const context = await browser.newContext();
    const page = await context.newPage();
    page.on('console', (message) => { if (message.type() === 'error') report.consoleErrors.push(message.text()); });
    page.on('pageerror', (error) => report.pageErrors.push(error.message));
    page.on('response', (response) => {
      if (response.status() < 400) return;
      const responseUrl = new URL(response.url());
      const failure = { status: response.status(), origin: responseUrl.origin, path: responseUrl.pathname };
      // 배포 전 상세에서도 확인한 비로그인 신원 probe의 정상 401만 구분해 기록한다.
      // 다른 경로/상태는 그대로 실패로 처리한다.
      if (failure.status === 401 && failure.origin === url.origin && failure.path === '/api/v1/auth/me') report.knownGuestAuthResponses.push(failure);
      else report.networkFailures.push(failure);
    });
    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(url.href, { waitUntil: 'domcontentloaded' });
      await page.getByRole('tab', { name: '리그 순위', exact: true }).click();
      const table = page.getByRole('table').first();
      const progressResponse = await context.request.get(`${url.origin}/api/v1/tournaments/${tournamentId}/standings/overall`);
      assert.equal(progressResponse.status(), 200);
      const { data: overall } = await progressResponse.json();
      const progress = page.getByRole('progressbar', { name: `전체 일정 진행률 ${overall.progress.played} / ${overall.progress.total}경기, ${overall.progress.percent}%` });
      await progress.waitFor({ state: 'visible' });
      assert.equal(Number(await progress.getAttribute('aria-valuenow')), overall.progress.percent);
      const scheduleResponse = await context.request.get(`${url.origin}/api/v1/tournaments/${tournamentId}/schedule`);
      assert.equal(scheduleResponse.status(), 200);
      const { data: schedule } = await scheduleResponse.json();
      const teams = schedule.standings.filter((team) => team.teamId && team.teamName);
      assert.ok(teams.length > 0, '실제 참가팀이 있어야 펼침을 검증할 수 있어요.');
      await table.getByRole('button', { name: `${teams[0].teamName} 경기 전적 펼치기`, exact: true }).waitFor({ state: 'visible' });
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: path.join(output, `after-${width}.png`), fullPage: true });
      const verdict = { width, progress: overall.progress, teams: [], pageOverflow: await page.evaluate(() => document.documentElement.scrollWidth > innerWidth) };
      assert.equal(verdict.pageOverflow, false);
      for (const [index, team] of teams.entries()) {
        const toggle = table.getByRole('button', { name: `${team.teamName} 경기 전적 펼치기`, exact: true });
        await toggle.click();
        const detail = page.locator('.tm-standings-detail-row');
        await detail.waitFor({ state: 'visible' });
        const rows = await detail.locator('li').count();
        const entries = [...new Map([...schedule.items, ...schedule.unscheduled].map((entry) => [entry.fixtureId, entry])).values()];
        const expected = entries.filter((entry) => entry.home?.teamId === team.teamId || entry.away?.teamId === team.teamId);
        if (schedule.nextCursor === null) assert.equal(rows, expected.length, `${team.teamName} 전적 행 수가 실제 일정과 달라요.`);
        verdict.teams.push({ name: team.teamName, rows });
        if (index === 0) {
          await table.scrollIntoViewIfNeeded();
          await page.screenshot({ path: path.join(output, `after-expanded-${width}.png`), fullPage: true });
        }
        const collapse = table.getByRole('button', { name: `${team.teamName} 경기 전적 접기`, exact: true });
        await collapse.focus();
        await collapse.press('Enter');
        assert.equal(await page.locator('.tm-standings-detail-row').count(), 0);
      }
      report.viewports.push(verdict);
      console.log(JSON.stringify(verdict));
      const detailUrl = new URL(`/tournaments/${tournamentId}`, url.origin);
      detailUrl.searchParams.set('from', '/tournaments?kind=league');
      await page.goto(detailUrl.href, { waitUntil: 'domcontentloaded' });
      const detailProgress = page.getByRole('progressbar', { name: `전체 일정 진행률 ${overall.progress.played} / ${overall.progress.total}경기, ${overall.progress.percent}%` });
      await detailProgress.waitFor({ state: 'visible' });
      assert.equal(Number(await detailProgress.getAttribute('aria-valuenow')), overall.progress.percent);
      await detailProgress.scrollIntoViewIfNeeded();
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: path.join(output, `after-detail-${width}.png`), fullPage: true });
      verdict.detailPageOverflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
      assert.equal(verdict.detailPageOverflow, false);
    }
    const guestConsoleErrors = report.consoleErrors.filter((message) => /Failed to load resource: the server responded with a status of 401/.test(message));
    assert.ok(guestConsoleErrors.length <= report.knownGuestAuthResponses.length);
    assert.deepEqual(report.consoleErrors.filter((message) => !guestConsoleErrors.includes(message)), []);
    assert.deepEqual(report.pageErrors, []);
    assert.deepEqual(report.networkFailures, []);
    report.success = true;
  } finally {
    try { await browser?.close(); } finally { await server.close(); }
    report.browserClosed = true;
    fs.writeFileSync(path.join(output, 'after-report.json'), `${JSON.stringify(report, null, 2)}\n`);
    console.log('owned browser/server closed');
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
