// Alpha-only, headed. Credentials are supplied on stdin and never persisted.
const { chromium, expect } = require('@playwright/test');
const fs = require('node:fs'), path = require('node:path');
const origin = 'https://alpha.teameet.co.kr';
const originalId = 'ee1675e5-264e-43ec-9a36-bd2f0a3099d9';
const title = '(테스트) sm 구성 입력 보존 QA 20261117';
const before = process.argv.includes('--before');
const expectedCommit = process.argv[process.argv.indexOf('--expected-commit') + 1];
if (!/^[a-f0-9]{40}$/.test(expectedCommit ?? '')) throw Error('Full deployment SHA required');
const destination = path.resolve('tmp/stage-structure-alpha', before ? 'before' : 'after');
const fixturePath = path.resolve('tmp/stage-structure-alpha/fixture.json');
async function json(response) {
  if (!response.headers()['content-type']?.includes('application/json')) throw Error(`Non-JSON Alpha API ${response.status()} ${new URL(response.url()).pathname}`);
  const body = await response.json();
  if (!response.ok()) throw Error(`Alpha API ${response.status()}: ${body.message ?? body.code}; ${JSON.stringify(body.details ?? null)}`);
  return body.data;
}
async function main() {
  const credentials = JSON.parse(fs.readFileSync(0, 'utf8').replace(/^\uFEFF/, ''));
  fs.mkdirSync(destination, { recursive: true });
  const server = await chromium.launchServer({ headless: false, args: ['--disable-dev-shm-usage', '--disable-gpu', '--disable-quic'] });
  const browser = await chromium.connect(server.wsEndpoint());
  const report = { expectedCommit, phase: before ? 'before' : 'after', lifecycle: { nodePid: process.pid, browserPid: server.process().pid, parentPid: process.pid }, setup: 'real admin API; all draft/conflict/reload actions use UI', checks: [], closed: false };
  console.log(JSON.stringify({ browserPid: server.process().pid, headed: true, phase: report.phase }));
  let sessionState;
  try {
    for (const width of [390, 768, 1440]) {
      const context = await browser.newContext({ storageState: sessionState, viewport: { width, height: 900 }, isMobile: width === 390, hasTouch: width < 1024, locale: 'ko-KR' });
      try {
        let page = await context.newPage();
        if (!sessionState) {
        const login = await page.goto(`${origin}/login/email`);
        expect(login.headers()['x-teameet-commit']).toBe(expectedCommit);
        await page.waitForFunction(() => { const form = document.querySelector('#v1-email-login-form'); return form && Object.keys(form).some(key => key.startsWith('__reactProps$')); });
        await page.locator('input[type=email]').fill(credentials.email);
        await page.locator('input[type=password]').fill(credentials.password);
        const loginResponse = page.waitForResponse(r => new URL(r.url()).pathname === '/api/v1/auth/login' && r.request().method() === 'POST');
        await page.getByRole('button', { name: '로그인', exact: true }).click();
        expect((await loginResponse).ok()).toBe(true);
        await page.waitForURL(url => !url.pathname.startsWith('/login'));
        await page.waitForFunction(() => document.querySelector('nav') && !document.body.innerText.includes('로그인 정보를 확인하고 있어요.'));
        sessionState = await context.storageState();
        }
        await page.close(); page = await context.newPage();
        const original = await json(await context.request.get(`${origin}/api/v1/tournaments/${originalId}`));
        let fixture;
        if (fs.existsSync(fixturePath)) fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
        else {
          const pools = Array.from({ length: 5 }, (_, i) => ({ key: `pre-${i}`, name: `${String.fromCharCode(65 + i)}조`, format: 'league', capacity: 4, legs: 1, sources: [] }));
          const stagePlan = { version: 1, autoAdvance: true, stages: [{ key: 'preliminary', name: '예선', pools }, { key: 'main', name: '본선', pools: Array.from({ length: 4 }, (_, i) => ({ key: `main-${i}`, name: `${i + 1}위 리그`, format: 'league', capacity: 5, legs: 1, overallRankStart: i * 5 + 1, sources: pools.map(pool => ({ poolKey: pool.key, rank: i + 1 })) })) }] };
          const source = await json(await context.request.get(`${origin}/api/v1/admin/tournaments/${originalId}`));
          const created = await json(await context.request.post(`${origin}/api/v1/admin/tournaments`, { data: { title, sportId: source.sportId, format: 'league_knockouts', teamCount: 20, minPlayers: 7, maxPlayers: 7, stagePlan } }));
          fixture = { id: created.id ?? created.tournamentId, title };
          if (!fixture.id) throw Error('Creation returned no tournament ID');
          fs.writeFileSync(fixturePath, JSON.stringify(fixture));
        }
        const owned = await json(await context.request.get(`${origin}/api/v1/admin/tournaments/${fixture.id}`));
        expect(owned.title).toBe(title); expect(owned.status).toBe('draft');
        await json(await context.request.patch(`${origin}/api/v1/admin/tournaments/${fixture.id}/visibility`, { data: { isPublic: false } }));
        report.fixture = { ...fixture, isPublic: false, cleanup: 'Private reusable draft retained: no tournament DELETE API exists; no registrations or fixtures created.' };
        const errors = [], network = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
        page.on('response', response => { if (response.status() >= 400 && new URL(response.url()).origin === origin) network.push({ path: new URL(response.url()).pathname, status: response.status() }); });
        const response = await page.goto(`${origin}/admin/tournaments/${fixture.id}/bracket`);
        expect(response.headers()['x-teameet-commit']).toBe(expectedCommit);
        await page.getByRole('button', { name: '단계·진출팀 관리', exact: true }).click();
        const dialog = page.getByRole('dialog', { name: '단계·진출팀 관리', exact: true });
        await expect(dialog.getByRole('combobox', { name: '관리할 편성' })).toBeVisible();
        const apiPath = `${origin}/api/v1/admin/tournaments/${fixture.id}/stages`;
        const initial = await json(await context.request.get(apiPath));
        const initialConfig = JSON.stringify(initial.config);
        const pool = initial.config.stages[0].pools[0];
        await dialog.getByRole('tab', { name: '구성 수정' }).click();
        await dialog.locator('summary').filter({ hasText: /^단계·편성 구성 수정$/ }).click();
        const structure = dialog.locator('details').filter({ has: page.locator('summary', { hasText: /^단계·편성 구성 수정$/ }) }).first();
        await structure.locator('summary').filter({ hasText: `${pool.name} · 4팀 · 풀리그` }).click();
        await structure.getByRole('combobox', { name: /^회전 수/ }).first().selectOption('2');
        await structure.getByLabel('구성 변경 사유', { exact: true }).fill('왕복 리그 변경 작성 중');
        await dialog.getByRole('tab', { name: '참가팀 배정' }).click();
        await dialog.getByRole('textbox', { name: '편성 이름', exact: true }).fill(`${pool.name} · 저장 확인`);
        const saveNames = async () => {
          const saved = page.waitForResponse(r => new URL(r.url()).pathname.endsWith('/stages/names') && r.request().method() === 'PUT');
          await dialog.getByRole('button', { name: '표시 설정 저장', exact: true }).click();
          expect((await saved).ok()).toBe(true);
          await expect(dialog.getByRole('button', { name: '표시 설정 저장', exact: true })).toBeDisabled();
        };
        try {
          await saveNames();
          await dialog.getByRole('tab', { name: '구성 수정' }).click();
          if (before) {
            await expect(structure.getByLabel('구성 변경 사유')).toHaveValue('');
            await structure.locator(':scope > summary').click();
            await structure.locator('summary').filter({ hasText: `${pool.name} · 저장 확인 · 4팀 · 풀리그` }).click();
            await expect(structure.getByRole('combobox', { name: /^회전 수/ }).first()).toHaveValue('1');
            await page.screenshot({ path: path.join(destination, `structure-${width}-lost.png`) });
            report.checks.push({ width, reproducedDraftLoss: true });
          } else {
            await expect(structure.getByLabel('구성 변경 사유')).toHaveValue('왕복 리그 변경 작성 중');
            await expect(structure.getByRole('combobox', { name: /^회전 수/ }).first()).toHaveValue('2');
            await expect(structure.getByRole('button', { name: '구성 변경 저장', exact: true })).toBeDisabled();
            await expect(structure.getByText(/작성 중인 구성과 사유는 보존/)).toBeVisible();
            await structure.getByRole('button', { name: '저장된 구성 다시 불러오기', exact: true }).scrollIntoViewIfNeeded();
            await page.screenshot({ path: path.join(destination, `structure-${width}-conflict.png`) });
            const reload = async () => {
              await structure.getByRole('button', { name: '저장된 구성 다시 불러오기', exact: true }).click();
              return page.getByRole('dialog', { name: '구성 입력을 다시 불러올까요?', exact: true });
            };
            await (await reload()).getByRole('button', { name: '취소', exact: true }).click();
            await expect(structure.getByLabel('구성 변경 사유')).toHaveValue('왕복 리그 변경 작성 중');
            const confirmation = await reload();
            await confirmation.getByRole('button', { name: '다시 불러오기', exact: true }).click();
            await expect(structure.getByLabel('구성 변경 사유')).toHaveValue('');
            await expect(structure.getByRole('combobox', { name: /^회전 수/ }).first()).toHaveValue('1');
            await expect(structure.getByLabel('편성 이름', { exact: true }).first()).toHaveValue(`${pool.name} · 저장 확인`);
            await expect(structure.getByText(/작성 중인 구성과 사유는 보존/)).toHaveCount(0);
            await page.screenshot({ path: path.join(destination, `structure-${width}-reloaded.png`) });
            report.checks.push({ width, draftPreserved: true, staleSaveBlocked: true, cancelPreserved: true, confirmedReload: true });
          }
        } finally {
          await dialog.getByRole('tab', { name: '참가팀 배정' }).click();
          await dialog.getByRole('textbox', { name: '편성 이름', exact: true }).fill(pool.name);
          await saveNames();
          expect(JSON.stringify((await json(await context.request.get(apiPath))).config)).toBe(initialConfig);
        }
        const evidence = JSON.parse(fs.readFileSync('docs/scenarios/evidence/sm-ranked-leagues-20261116.json', 'utf8'));
        expect(original.fixtures).toHaveLength(70);
        for (const game of evidence.games) {
          const current = original.fixtures.find(item => item.id === game.fixtureId);
          expect(current?.result?.homeScore).toBe(game.homeScore); expect(current?.result?.awayScore).toBe(game.awayScore);
        }
        const check = report.checks.at(-1);
        Object.assign(check, { originalConfigRestored: true, preservedOfficialGames: 70, horizontalOverflow: await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), console: errors, network });
        check.passed = check.horizontalOverflow === 0 && errors.length === 0 && network.length === 0;
        if (!check.passed) throw Error('Structure route has console/network/viewport errors');
        console.log(JSON.stringify({ width, passed: check.passed }));
      } finally { await context.close(); }
    }
  } catch (error) { report.failure = error.message; throw error; }
  finally { await browser.close(); await server.close(); report.closed = true; fs.writeFileSync(path.join(destination, 'report.json'), JSON.stringify(report, null, 2)); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
