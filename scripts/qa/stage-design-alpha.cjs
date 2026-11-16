// Alpha-only headed evidence. Credentials arrive on stdin; session state is never persisted.
const { chromium, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const origin = 'https://alpha.teameet.co.kr';
const tournamentId = 'ee1675e5-264e-43ec-9a36-bd2f0a3099d9';
const phase = process.argv.includes('--after') ? 'after' : 'before';
const destination = path.resolve('tmp/stage-design-alpha', phase);
const routes = [
  ['admin-create', '/admin/tournaments/new-staged'],
  ['admin-bracket', `/admin/tournaments/${tournamentId}/bracket`],
  ['admin-awards', `/admin/tournaments/${tournamentId}/awards`],
  ['detail', `/tournaments/${tournamentId}`],
  ['bracket', `/tournaments/${tournamentId}/bracket`],
  ['results', `/tournaments/${tournamentId}/results`],
  ['awards', `/tournaments/${tournamentId}/awards`],
];
async function interactionShot(page, report, name, width) {
  const file = `${name}-${width}.png`;
  await page.screenshot({ path: path.join(destination, file) });
  report.interactions.push({ name, width, screenshot: file, passed: true });
}
async function closeStagePanel(page) {
  await page.getByRole('button', { name: '단계 관리 닫기', exact: true }).click();
  const confirmation = page.getByRole('dialog', { name: '단계 관리를 닫을까요?', exact: true });
  await expect.poll(async () => await confirmation.isVisible() || await page.getByRole('dialog').count() === 0).toBe(true);
  if (await confirmation.isVisible()) await confirmation.getByRole('button', { name: '닫기', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}
async function normalizeFixtureNames(page, report) {
  const response = await page.request.get(`${origin}/api/v1/admin/tournaments/${tournamentId}/stages`);
  if (!response.ok()) throw Error('Cannot read the owned QA stage configuration');
  const view = (await response.json()).data;
  const dialog = page.getByRole('dialog', { name: '단계·진출팀 관리', exact: true });
  for (const [stageIndex, stage] of view.config.stages.entries()) for (const [poolIndex, pool] of stage.pools.entries()) {
    const stageName = stageIndex === 0 ? '예선' : '본선';
    const name = stageIndex === 0 ? `${String.fromCharCode(65 + poolIndex)}조` : `${poolIndex + 1}위 리그`;
    const rankStart = stageIndex === 0 ? undefined : poolIndex * 5 + 1;
    if (pool.name === name && stage.name === stageName && (rankStart === undefined || pool.overallRankStart === rankStart)) continue;
    await dialog.getByRole('combobox', { name: '관리할 편성' }).selectOption(pool.key);
    await dialog.getByLabel('단계 이름', { exact: true }).fill(stageName);
    await dialog.getByLabel('편성 이름', { exact: true }).fill(name);
    if (rankStart !== undefined) await dialog.getByRole('spinbutton', { name: /전체 순위 시작 번호/ }).fill(String(rankStart));
    const saved = page.waitForResponse(result => new URL(result.url()).pathname.endsWith('/stages/names') && result.request().method() === 'PUT');
    await dialog.getByRole('button', { name: '표시 설정 저장', exact: true }).click();
    const result = await saved;
    if (!result.ok()) throw Error(`QA fixture rename failed: ${result.status()}`);
    await expect(dialog.getByRole('combobox', { name: '관리할 편성' }).locator('option:checked')).toContainText(name);
    report.interactions.push({ name: 'owned-fixture-name-saved', poolKey: pool.key, stageName, poolName: name, passed: true });
  }
}
async function exercise(page, report, name, width) {
  if (name === 'admin-create') {
    await page.getByRole('button', { name: '20팀 순위별 리그 템플릿' }).click();
    await page.getByRole('button', { name: '구성 바꾸기', exact: true }).click();
    await expect(page.getByText('모집 20팀 · 2단계 · 예상 70경기')).toBeVisible();
    await page.getByText('1위 리그 · 5팀 · 풀리그', { exact: true }).click();
    await expect(page.getByRole('combobox', { name: '1번 자리', exact: true })).toBeVisible();
    await interactionShot(page, report, 'create-20-team-editor', width);
  }
  if (name === 'admin-bracket') {
    await page.getByRole('button', { name: '단계·진출팀 관리', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '단계·진출팀 관리', exact: true });
    await expect(dialog).toBeVisible();
    if (width === 390 && process.argv.includes('--normalize-fixture-names')) await normalizeFixtureNames(page, report);
    await page.keyboard.press('Shift+Tab');
    if (!await page.evaluate(() => document.activeElement?.closest('[role=dialog]') !== null)) throw Error('Stage panel focus escaped');
    await interactionShot(page, report, 'admin-stage-panel', width);
    await dialog.getByRole('tab', { name: '경기 설정' }).click();
    await expect(dialog.getByRole('combobox', { name: '적용 범위' })).toBeVisible();
    await interactionShot(page, report, 'admin-period-scope', width);
    await closeStagePanel(page);
    await expect(page.getByRole('button', { name: '단계·진출팀 관리', exact: true })).toBeFocused();
  }
  if (name === 'bracket') {
    const stages = page.getByRole('navigation', { name: '진행 단계 선택' }).getByRole('button');
    await stages.first().click();
    await page.getByRole('tab', { name: '순위 · 대진표' }).click();
    await expect(page.getByRole('table')).toHaveCount(5);
    await stages.last().click();
    await expect(page.getByRole('table')).toHaveCount(4);
    await page.getByRole('navigation', { name: '편성 선택' }).getByRole('button').nth(1).click();
    await expect(page.getByRole('table')).toHaveCount(1);
    await page.getByRole('combobox', { name: '참가팀', exact: true }).selectOption({ index: 1 });
    await page.getByRole('tab', { name: '경기 일정', exact: true }).click();
    const matches = page.locator(`a[href*="/tournaments/${tournamentId}/matches/"]`);
    await expect(matches).toHaveCount(4);
    await interactionShot(page, report, 'filtered-final-team-matches', width);
    const source = page.url();
    await matches.first().click();
    await page.waitForURL(url => url.pathname.includes('/matches/'), { waitUntil: 'domcontentloaded' });
    await page.goBack({ waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(source);
    await expect(page.locator(`a[href*="/tournaments/${tournamentId}/matches/"]`)).toHaveCount(4);
    report.interactions.push({ name: 'match-detail-back-restores-filters', width, passed: true });
  }
  if (name === 'results') {
    await expect(page.getByRole('navigation', { name: '진행 단계 선택' }).getByRole('button').last()).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('table')).toHaveCount(4);
    await interactionShot(page, report, 'final-league-results', width);
  }
}
async function captureLegacyReference(page, context, report, width) {
  if (!report.referenceId) {
    const response = await context.request.get(`${origin}/api/v1/tournaments?status=completed`);
    if (!response.ok()) throw Error(`Cannot load existing comparison competitions: ${response.status()}`);
    const list = (await response.json()).data;
    for (const item of list.items ?? []) {
      if (item.id === tournamentId || item.kind === 'regular_league' || item.format === 'league_knockouts') continue;
      const detail = await context.request.get(`${origin}/api/v1/tournaments/${item.id}`);
      if (!detail.ok()) continue;
      const value = (await detail.json()).data;
      if (!value.stagePlan && value.fixtures?.length) { report.referenceId = item.id; break; }
    }
    if (!report.referenceId) throw Error('No existing non-stage competition with fixtures was found for comparison');
  }
  report.references ??= [];
  for (const [name, route] of [ ['bracket', `/tournaments/${report.referenceId}/bracket`], ['results', `/tournaments/${report.referenceId}/results`], ['admin-bracket', `/admin/tournaments/${report.referenceId}/bracket`] ]) {
    const response = await page.goto(`${origin}${route}`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
    const screenshot = `existing-${name}-${width}.png`;
    await page.screenshot({ path: path.join(destination, screenshot) });
    report.references.push({ name, route, width, status: response.status(), screenshot });
  }
}
async function main() {
  const credentials = JSON.parse(fs.readFileSync(0, 'utf8').replace(/^\uFEFF/, ''));
  if (!credentials.email || !credentials.password) throw Error('Existing Alpha credentials required on stdin');
  fs.mkdirSync(destination, { recursive: true });
  const server = await chromium.launchServer({ headless: false, args: ['--disable-dev-shm-usage', '--disable-gpu', '--disable-quic'] });
  const browser = await chromium.connect(server.wsEndpoint());
  const report = { phase, origin, tournamentId, lifecycle: { nodePid: process.pid, browserPid: server.process().pid, parentPid: process.pid }, checks: [], interactions: [], closed: false };
  if (process.argv.includes('--resume') && fs.existsSync(path.join(destination, 'report.json'))) report.checks = JSON.parse(fs.readFileSync(path.join(destination, 'report.json'), 'utf8')).checks;
  console.log(JSON.stringify({ phase, browserPid: report.lifecycle.browserPid, headed: true }));
  try {
    for (const width of [390, 768, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, isMobile: width === 390, hasTouch: width < 1024, locale: 'ko-KR' });
      const page = await context.newPage(), consoleErrors = [], networkErrors = [];
      page.on('pageerror', error => consoleErrors.push(error.message));
      page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
      page.on('response', response => { if (response.status() >= 400 && new URL(response.url()).origin === origin) networkErrors.push({ path: new URL(response.url()).pathname, status: response.status(), page: new URL(page.url()).pathname, resourceType: response.request().resourceType(), referrer: response.request().headers().referer ? new URL(response.request().headers().referer).pathname : null }); });
      page.on('requestfailed', request => { if (new URL(request.url()).origin === origin && request.failure()?.errorText !== 'net::ERR_ABORTED') networkErrors.push({ path: new URL(request.url()).pathname, error: request.failure()?.errorText }); });
      try {
        await page.goto(`${origin}/login/email`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
        await page.waitForFunction(() => { const form = document.querySelector('#v1-email-login-form'); return form && Object.keys(form).some(key => key.startsWith('__reactProps$')); }, { timeout: 45_000 });
        await page.locator('input[type=email]').fill(credentials.email);
        await page.locator('input[type=password]').fill(credentials.password);
        const loginResponse = page.waitForResponse(response => new URL(response.url()).pathname === '/api/v1/auth/login' && response.request().method() === 'POST', { timeout: 20_000 }).catch(() => null);
        await page.getByRole('button', { name: '로그인', exact: true }).click();
        const login = await loginResponse; console.log(JSON.stringify({ loginStatus: login?.status() ?? null, width }));
        try { await page.waitForURL(url => !url.pathname.startsWith('/login'), { waitUntil: 'domcontentloaded', timeout: 30_000 }); }
        catch (error) { console.log(JSON.stringify({ loginText: await page.locator('body').innerText(), network: networkErrors })); throw error; }
        await page.waitForFunction(() => document.querySelector('nav') && !document.body.innerText.includes('로그인 정보를 확인하고 있어요.'));
        consoleErrors.length = 0; networkErrors.length = 0;
        for (const [name, route] of routes) {
          if (report.checks.some(check => check.name === name && check.width === width)) continue;
          const consoleStart = consoleErrors.length, networkStart = networkErrors.length;
          const response = await page.goto(`${origin}${route}`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
          const expected = process.argv.indexOf('--expected-commit');
          if (phase === 'after' && (expected < 0 || response.headers()['x-teameet-commit'] !== process.argv[expected + 1])) throw Error(`Alpha release mismatch on ${name}`);
          await page.waitForFunction(() => document.body.innerText.length > 80 && !document.body.innerText.includes('로그인 정보를 확인하고 있어요.'), { timeout: 45_000 });
          await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
          await page.evaluate(() => document.fonts.ready);
          const prefix = `${name}-${width}`;
          await page.screenshot({ path: path.join(destination, `${prefix}-top.png`) });
          const geometry = await page.evaluate(() => ({ width: innerWidth, documentWidth: document.documentElement.scrollWidth, horizontalOverflow: document.documentElement.scrollWidth - innerWidth, headings: [...document.querySelectorAll('h1,h2')].map(heading => heading.textContent.trim()) }));
          report.checks.push({ name, route, width, status: response.status(), release: response.headers()['x-teameet-commit'], url: new URL(page.url()).pathname, ...geometry, console: consoleErrors.slice(consoleStart), network: networkErrors.slice(networkStart), screenshot: `${prefix}-top.png` });
          await page.evaluate(() => { const candidates = [...document.querySelectorAll('*')].filter(element => element.clientHeight > 200 && element.scrollHeight > element.clientHeight + 50 && /auto|scroll/.test(getComputedStyle(element).overflowY)); candidates.sort((a, b) => b.clientHeight - a.clientHeight); if (candidates[0]) candidates[0].scrollTop = candidates[0].scrollHeight; else window.scrollTo(0, document.body.scrollHeight); });
          await page.screenshot({ path: path.join(destination, `${prefix}-bottom.png`) });
          if (phase === 'after') await exercise(page, report, name, width);
          const check = report.checks.at(-1);
          check.console = consoleErrors.slice(consoleStart); check.network = networkErrors.slice(networkStart);
          check.passed = check.status === 200 && check.horizontalOverflow === 0 && check.console.length === 0 && check.network.length === 0;
          console.log(JSON.stringify({ name, width, status: response.status(), overflow: geometry.horizontalOverflow }));
          fs.writeFileSync(path.join(destination, 'report.json'), JSON.stringify(report, null, 2));
        }
        if (phase === 'after') await captureLegacyReference(page, context, report, width);
      } finally { await context.close(); }
    }
    if (phase === 'after' && report.checks.some(check => !check.passed)) throw Error('Alpha route evidence contains an HTTP, console, network, or viewport failure');
  } catch (error) { report.failure = error.message; throw error; }
  finally {
    await browser.close(); await server.close(); report.closed = true;
    fs.writeFileSync(path.join(destination, 'report.json'), JSON.stringify(report, null, 2));
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
