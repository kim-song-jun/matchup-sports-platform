// Alpha-only headed evidence. Credentials arrive on stdin; session state is never persisted.
const { chromium, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const { EVIDENCE_VERSION, hasRequiredInteractions, resumeEvidence, scrollContentToBottom } = require('./stage-design-evidence.cjs');
const origin = 'https://alpha.teameet.co.kr';
const tournamentId = 'ee1675e5-264e-43ec-9a36-bd2f0a3099d9';
const phase = process.argv.includes('--after') ? 'after' : 'before';
const filterCaptures = process.argv.includes('--filter-captures');
const bottomCaptures = process.argv.includes('--admin-bottom-captures');
if (filterCaptures && bottomCaptures) throw Error('Choose one focused capture scope');
const captureScope = filterCaptures ? 'filter' : bottomCaptures ? 'admin-bottom' : 'full';
const destination = path.resolve('tmp/stage-design-alpha', filterCaptures ? 'filter-captures' : bottomCaptures ? 'admin-bottom-captures' : phase);
const routes = [
  ['admin-create', '/admin/tournaments/new?format=staged'],
  ['admin-bracket', `/admin/tournaments/${tournamentId}/bracket`],
  ['admin-awards', `/admin/tournaments/${tournamentId}/awards`],
  ['detail', `/tournaments/${tournamentId}`],
  ['bracket', `/tournaments/${tournamentId}/bracket`],
  ['results', `/tournaments/${tournamentId}/results`],
  ['awards', `/tournaments/${tournamentId}/awards`],
];
async function interactionShot(page, report, name, width) {
  const file = `${name}-${width}.png`;
  await page.screenshot({ animations: 'disabled', path: path.join(destination, file) });
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
async function exerciseDraftPreservation(page, report, dialog, width) {
  const select = dialog.getByRole('combobox', { name: '관리할 편성' });
  const keys = await select.locator('option').evaluateAll(options => options.map(option => option.value));
  if (keys.length < 2) throw Error('The owned multi-pool QA competition is required');
  await select.selectOption(keys[0]);
  const firstName = await dialog.getByLabel('편성 이름', { exact: true }).inputValue();
  await dialog.getByLabel('편성 이름', { exact: true }).fill(`${firstName} · 미저장 확인`);
  await select.selectOption(keys[1]);
  const secondName = await dialog.getByLabel('편성 이름', { exact: true }).inputValue();
  const draftName = `${secondName} · 미저장 확인`;
  await dialog.getByLabel('편성 이름', { exact: true }).fill(draftName);
  await select.selectOption(keys[0]);
  await expect(dialog.getByLabel('편성 이름', { exact: true })).toHaveValue(`${firstName} · 미저장 확인`);
  const saveNames = async () => {
    const response = page.waitForResponse(result => new URL(result.url()).pathname.endsWith('/stages/names') && result.request().method() === 'PUT');
    await dialog.getByRole('button', { name: '표시 설정 저장', exact: true }).click();
    if (!(await response).ok()) throw Error('Owned QA display-name save failed');
    await expect(dialog.getByRole('button', { name: '단계 관리 닫기', exact: true })).toBeEnabled();
  };
  try {
    if (width === 390) {
      await saveNames();
      await expect(select.locator('option:checked')).toHaveText(`${firstName} · 미저장 확인 · 풀리그`);
    }
    await select.selectOption(keys[1]);
    await expect(dialog.getByLabel('편성 이름', { exact: true })).toHaveValue(draftName);
    await dialog.getByRole('button', { name: '최신 구성 불러오기', exact: true }).click();
    const reloadDialog = page.getByRole('dialog', { name: '최신 구성으로 다시 불러올까요?', exact: true });
    await expect(reloadDialog).toBeVisible();
    await reloadDialog.getByRole('button', { name: '취소', exact: true }).click();
    await expect(reloadDialog).toHaveCount(0);
    await expect(dialog.getByLabel('편성 이름', { exact: true })).toHaveValue(draftName);
    await expect(dialog.getByRole('button', { name: '표시 설정 저장', exact: true })).toBeEnabled();
    await interactionShot(page, report, 'admin-draft-preserved', width);
    report.interactions.push({ name: 'drafts-survive-pool-switch', width, displaySaveExercised: width === 390, passed: true });
  } finally {
    await select.selectOption(keys[0]);
    await dialog.getByLabel('편성 이름', { exact: true }).fill(firstName);
    if (width === 390 && await dialog.getByRole('button', { name: '표시 설정 저장', exact: true }).isEnabled()) {
      await saveNames();
      await expect(select.locator('option:checked')).toHaveText(`${firstName} · 풀리그`);
    }
    await select.selectOption(keys[1]);
    await dialog.getByLabel('편성 이름', { exact: true }).fill(secondName);
    await select.selectOption(keys[0]);
    await expect(dialog.getByLabel('편성 이름', { exact: true })).toHaveValue(firstName);
  }
  const response = await page.request.get(`${origin}/api/v1/admin/tournaments/${tournamentId}/stages`);
  if (!response.ok()) throw Error('Cannot verify QA display-name restoration');
  const pools = (await response.json()).data.config.stages.flatMap(stage => stage.pools);
  expect(pools.find(pool => pool.key === keys[0]).name).toBe(firstName);
  expect(pools.find(pool => pool.key === keys[1]).name).toBe(secondName);
  report.interactions.push({ name: 'owned-fixture-labels-restored', width, passed: true });
}
async function exercise(page, report, name, width) {
  if (name === 'admin-create') {
    await expect(page.getByRole('radio', { name: /여러 단계/ })).toBeChecked();
    await interactionShot(page, report, 'create-staged-format-selected', width);
  }
  if (name === 'admin-bracket') {
    await page.getByRole('button', { name: '단계·진출팀 관리', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '단계·진출팀 관리', exact: true });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('combobox', { name: '관리할 편성' })).toBeVisible();
    if (width === 390 && process.argv.includes('--normalize-fixture-names')) await normalizeFixtureNames(page, report);
    await exerciseDraftPreservation(page, report, dialog, width);
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
    await page.getByRole('tab', { name: '경기 일정', exact: true }).click();
    await expect(page.getByRole('tab', { name: '경기 일정', exact: true })).toHaveAttribute('aria-selected', 'true');
    await page.getByRole('combobox', { name: '참가팀', exact: true }).selectOption({ index: 1 });
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
    await page.getByRole('table').first().evaluate(element => element.scrollIntoView({ block: 'center' }));
    await interactionShot(page, report, 'final-league-results', width);
  }
}
async function captureLegacyReference(page, context, report, width) {
  if (!report.referenceIds) {
    const response = await context.request.get(`${origin}/api/v1/tournaments?status=completed`);
    if (!response.ok()) throw Error(`Cannot load existing comparison competitions: ${response.status()}`);
    const list = (await response.json()).data;
    report.referenceIds = {};
    for (const item of list.items ?? []) {
      if (item.id === tournamentId || item.kind === 'regular_league' || !['group_knockout', 'league_knockouts'].includes(item.format) || report.referenceIds[item.format]) continue;
      const detail = await context.request.get(`${origin}/api/v1/tournaments/${item.id}`);
      if (!detail.ok()) continue;
      const value = (await detail.json()).data;
      if (!value.stagePlan && value.fixtures?.length) report.referenceIds[item.format] = item.id;
    }
    if (Object.keys(report.referenceIds).length !== 2) throw Error('Both existing league + tournament formats are required for comparison');
  }
  report.references ??= [];
  for (const [format, referenceId] of Object.entries(report.referenceIds)) for (const [name, route] of [ ['bracket', `/tournaments/${referenceId}/bracket`], ['results', `/tournaments/${referenceId}/results`], ['admin-bracket', `/admin/tournaments/${referenceId}/bracket`] ]) {
    const errors = [], network = [];
    const onConsole = message => { if (message.type() === 'error') errors.push(message.text()); };
    const onError = error => errors.push(error.message);
    const onResponse = response => { if (response.status() >= 400 && new URL(response.url()).origin === origin) network.push({ path: new URL(response.url()).pathname, status: response.status() }); };
    page.on('console', onConsole); page.on('pageerror', onError); page.on('response', onResponse);
    try {
    const response = await page.goto(`${origin}${route}`, { waitUntil: 'domcontentloaded' });
    if (response.headers()['x-teameet-commit'] !== report.expectedCommit) throw Error('Comparison page deployment changed during QA');
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
    const screenshot = `existing-${format}-${name}-${width}.png`;
    await page.screenshot({ path: path.join(destination, screenshot) });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    report.references.push({ name, format, route, width, release: response.headers()['x-teameet-commit'], status: response.status(), screenshot, horizontalOverflow: overflow, console: errors, network, passed: response.ok() && overflow === 0 && !errors.length && !network.length });
    } finally { page.off('console', onConsole); page.off('pageerror', onError); page.off('response', onResponse); }
  }
}
async function main() {
  const credentials = JSON.parse(fs.readFileSync(0, 'utf8').replace(/^\uFEFF/, ''));
  if (!credentials.email || !credentials.password) throw Error('Existing Alpha credentials required on stdin');
  fs.mkdirSync(destination, { recursive: true });
  const expectedIndex = process.argv.indexOf('--expected-commit');
  const expectedCommit = expectedIndex < 0 ? undefined : process.argv[expectedIndex + 1];
  if (phase === 'after' && !/^[a-f0-9]{40}$/.test(expectedCommit ?? '')) throw Error('After evidence requires a full expected deployment SHA');
  const resumed = process.argv.includes('--resume') && fs.existsSync(path.join(destination, 'report.json'))
    ? resumeEvidence(JSON.parse(fs.readFileSync(path.join(destination, 'report.json'), 'utf8')), { phase, origin, tournamentId, expectedCommit, routes, captureScope }) : { checks: [], interactions: [] };
  if (resumed.checks.some(check => !fs.existsSync(path.join(destination, check.screenshot)) || !fs.existsSync(path.join(destination, check.screenshot.replace('-top.png', '-bottom.png')))) || resumed.interactions.some(item => item.screenshot && !fs.existsSync(path.join(destination, item.screenshot)))) throw Error('Resume screenshot files are missing; run without --resume');
  const server = await chromium.launchServer({ headless: false, args: ['--disable-dev-shm-usage', '--disable-gpu', '--disable-quic'] });
  const browser = await chromium.connect(server.wsEndpoint());
  const report = { evidenceVersion: EVIDENCE_VERSION, captureScope, phase, origin, tournamentId, expectedCommit, lifecycle: { nodePid: process.pid, browserPid: server.process().pid, parentPid: process.pid }, checks: resumed.checks, interactions: resumed.interactions, loginDiagnostics: [], closed: false };
  console.log(JSON.stringify({ phase, browserPid: report.lifecycle.browserPid, headed: true }));
  try {
    for (const width of [390, 768, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, isMobile: width === 390, hasTouch: width < 1024, locale: 'ko-KR' });
      let page = await context.newPage();
      const consoleErrors = [], networkErrors = [];
      const observe = page => {
      page.on('pageerror', error => consoleErrors.push(error.message));
      page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
      page.on('response', response => { if (response.status() >= 400 && new URL(response.url()).origin === origin) networkErrors.push({ path: new URL(response.url()).pathname, status: response.status(), page: new URL(page.url()).pathname, resourceType: response.request().resourceType(), referrer: response.request().headers().referer ? new URL(response.request().headers().referer).pathname : null }); });
      page.on('requestfailed', request => { if (new URL(request.url()).origin === origin && request.failure()?.errorText !== 'net::ERR_ABORTED') networkErrors.push({ path: new URL(request.url()).pathname, error: request.failure()?.errorText }); });
      };
      observe(page);
      try {
        const loginPage = await page.goto(`${origin}/login/email`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
        if (phase === 'after' && loginPage.headers()['x-teameet-commit'] !== expectedCommit) throw Error('Alpha deployment does not match the requested QA SHA');
        await page.waitForFunction(() => { const form = document.querySelector('#v1-email-login-form'); return form && Object.keys(form).some(key => key.startsWith('__reactProps$')); }, { timeout: 45_000 });
        await page.locator('input[type=email]').fill(credentials.email);
        await page.locator('input[type=password]').fill(credentials.password);
        const loginResponse = page.waitForResponse(response => new URL(response.url()).pathname === '/api/v1/auth/login' && response.request().method() === 'POST', { timeout: 20_000 }).catch(() => null);
        await page.getByRole('button', { name: '로그인', exact: true }).click();
        const login = await loginResponse; console.log(JSON.stringify({ loginStatus: login?.status() ?? null, width }));
        try { await page.waitForURL(url => !url.pathname.startsWith('/login'), { waitUntil: 'domcontentloaded', timeout: 30_000 }); }
        catch (error) { console.log(JSON.stringify({ loginText: await page.locator('body').innerText(), network: networkErrors })); throw error; }
        await page.waitForFunction(() => document.querySelector('nav') && !document.body.innerText.includes('로그인 정보를 확인하고 있어요.'));
        await page.close();
        report.loginDiagnostics.push({ width, console: [...consoleErrors], network: [...networkErrors] });
        page = await context.newPage(); observe(page);
        consoleErrors.length = 0; networkErrors.length = 0;
        for (const [name, route] of routes) {
          if (filterCaptures && name !== 'bracket') continue;
          if (bottomCaptures && !name.startsWith('admin-')) continue;
          if (report.checks.some(check => check.name === name && check.width === width)) continue;
          const consoleStart = consoleErrors.length, networkStart = networkErrors.length;
          const response = await page.goto(`${origin}${route}`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
          if (phase === 'after' && response.headers()['x-teameet-commit'] !== expectedCommit) throw Error(`Alpha release mismatch on ${name}`);
          await page.waitForFunction(() => document.body.innerText.length > 80 && !document.body.innerText.includes('로그인 정보를 확인하고 있어요.'), { timeout: 45_000 });
          await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
          await page.evaluate(() => document.fonts.ready);
          const prefix = `${name}-${width}`;
          await page.screenshot({ path: path.join(destination, `${prefix}-top.png`) });
          const geometry = await page.evaluate(() => ({ width: innerWidth, documentWidth: document.documentElement.scrollWidth, horizontalOverflow: document.documentElement.scrollWidth - innerWidth, headings: [...document.querySelectorAll('h1,h2')].map(heading => heading.textContent.trim()) }));
          report.checks.push({ name, route, width, status: response.status(), release: response.headers()['x-teameet-commit'], url: new URL(page.url()).pathname, ...geometry, console: consoleErrors.slice(consoleStart), network: networkErrors.slice(networkStart), screenshot: `${prefix}-top.png` });
          report.checks.at(-1).scroll = await scrollContentToBottom(page);
          await page.screenshot({ animations: 'disabled', path: path.join(destination, `${prefix}-bottom.png`) });
          if (phase === 'after' && !bottomCaptures) await exercise(page, report, name, width);
          const check = report.checks.at(-1);
          check.console = consoleErrors.slice(consoleStart); check.network = networkErrors.slice(networkStart);
          check.passed = check.status === 200 && check.url === check.route && check.horizontalOverflow === 0 && check.console.length === 0 && check.network.length === 0;
          console.log(JSON.stringify({ name, width, status: response.status(), overflow: geometry.horizontalOverflow }));
          fs.writeFileSync(path.join(destination, 'report.json'), JSON.stringify(report, null, 2));
        }
        if (phase === 'after') {
          const detail = await context.request.get(`${origin}/api/v1/tournaments/${tournamentId}`);
          if (!detail.ok()) throw Error('Cannot verify completed QA competition preservation');
          const competition = (await detail.json()).data;
          const original = JSON.parse(fs.readFileSync('docs/scenarios/evidence/sm-ranked-leagues-20261116.json', 'utf8'));
          expect(competition.status).toBe('completed'); expect(competition.fixtures).toHaveLength(70);
          for (const expected of original.games) {
            const fixture = competition.fixtures.find(item => item.id === expected.fixtureId);
            expect(fixture?.result?.homeScore).toBe(expected.homeScore); expect(fixture?.result?.awayScore).toBe(expected.awayScore);
          }
          report.preservation = { status: 'completed', originalFixtureIds: 70, officialScoresUnchanged: 70 };
          if (!filterCaptures && !bottomCaptures) await captureLegacyReference(page, context, report, width);
        }
      } finally { await context.close(); }
    }
    if (report.checks.length !== (filterCaptures ? 3 : bottomCaptures ? 9 : routes.length * 3)) throw Error('Route coverage is incomplete');
    if (report.checks.some(check => !hasRequiredInteractions(check, report.interactions, { phase, captureScope }))) throw Error('Required route interactions are incomplete');
    if (phase === 'after' && [...report.checks, ...(report.references ?? [])].some(check => !check.passed)) throw Error('Alpha route evidence contains an HTTP, console, network, or viewport failure');
  } catch (error) { report.failure = error.message; throw error; }
  finally {
    await browser.close(); await server.close(); report.closed = true;
    fs.writeFileSync(path.join(destination, 'report.json'), JSON.stringify(report, null, 2));
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
