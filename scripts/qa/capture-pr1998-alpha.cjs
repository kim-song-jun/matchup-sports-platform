const { chromium } = require('../../node_modules/.pnpm/playwright-core@1.58.2/node_modules/playwright-core');
const fs = require('node:fs');
const path = require('node:path');
const phase = process.argv[2];
if (!['before', 'after'].includes(phase)) throw Error('Expected before/after');
const id = 'd5202610-1018-4000-8000-000000000001';
const output = path.resolve('tmp/qa-pr1998', phase);
(async () => {
  if (!process.env.QA_AUTH_EMAIL || !process.env.QA_AUTH_PASSWORD) throw Error('Missing QA login environment');
  fs.mkdirSync(output, { recursive: true });
  const server = await chromium.launchServer({ headless: false, executablePath: path.join(process.env.LOCALAPPDATA, 'ms-playwright/chromium-1208/chrome-win64/chrome.exe') });
  const evidence = { phase, persona: 'participating team owner', browserPid: server.process().pid, parentPid: process.pid, issues: [], viewports: [] };
  console.log(JSON.stringify({ browserPid: evidence.browserPid, parentPid: evidence.parentPid }));
  const browser = await chromium.connect(server.wsEndpoint());
  try {
    const page = await browser.newPage();
    page.on('pageerror', e => evidence.issues.push({ kind: 'pageerror', message: e.message }));
    page.on('console', m => { if (m.type() === 'error') evidence.issues.push({ kind: 'console', message: m.text() }); });
    page.on('response', r => { if (r.status() >= 400) evidence.issues.push({ kind: 'http', status: r.status(), path: new URL(r.url()).pathname }); });
    await page.goto('https://alpha.teameet.co.kr/login', { waitUntil: 'domcontentloaded' });
    const login = await page.request.post('https://alpha.teameet.co.kr/api/v1/auth/login', { data: { email: process.env.QA_AUTH_EMAIL, password: process.env.QA_AUTH_PASSWORD } });
    if (!login.ok()) throw Error(`Login failed ${login.status()}`);
    await page.evaluate(() => localStorage.setItem('teameet.v1.session', 'active'));
    const fixturesResponse = await page.request.get(`https://alpha.teameet.co.kr/api/v1/tournaments/${id}/my-fixtures`);
    if (!fixturesResponse.ok()) throw Error('My fixtures failed');
    const mine = (await fixturesResponse.json()).data.teams.flatMap(t => t.fixtures);
    const mineIds = new Set(mine.map(f => f.fixtureId));
    const groupIds = new Set(mine.filter(f => f.groupName?.endsWith('조')).map(f => f.fixtureId));
    const ownVisible = async () => page.locator(`a[href*="/tournaments/${id}/matches/"]`).evaluateAll(links => links.map(a => new URL(a.href).pathname.split('/').at(-1)));
    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      const response = await page.goto(`https://alpha.teameet.co.kr/tournaments/${id}/bracket`, { waitUntil: 'domcontentloaded' });
      evidence.commit = response.headers()['x-teameet-commit'];
      const toggle = page.getByRole('switch', { name: '내 팀만' });
      await toggle.waitFor();
      await toggle.click();
      const results = [];
      for (const label of ['전체', '조별리그', '결선']) {
        await page.getByRole('tab', { name: label, exact: true }).click();
        await page.waitForTimeout(250);
        if (phase === 'after') {
          const expected = mine.find(f => label === '전체' || (label === '조별리그' ? groupIds.has(f.fixtureId) : !groupIds.has(f.fixtureId)));
          if (!expected) throw Error(`No real own fixture available for ${label}`);
          await page.locator(`a[href*="/matches/${expected.fixtureId}"]`).first().waitFor();
          const expectedIds = mine.filter(f => label === '전체' || (label === '조별리그' ? groupIds.has(f.fixtureId) : !groupIds.has(f.fixtureId))).map(f => f.fixtureId);
          await page.waitForFunction(({ competitionId, expected }) => {
            const ids = new Set([...document.querySelectorAll(`a[href*="/tournaments/${competitionId}/matches/"]`)].map(a => new URL(a.href).pathname.split('/').at(-1)));
            return expected.every(fixtureId => ids.has(fixtureId));
          }, { competitionId: id, expected: expectedIds });
        }
        const enabled = await toggle.getAttribute('aria-checked') === 'true';
        const ids = await ownVisible();
        if (phase === 'after') {
          if (!enabled) throw Error(`Mine switch reset at ${label}`);
          if (!ids.every(f => mineIds.has(f))) throw Error(`Other team game visible at ${label}`);
          if (label === '조별리그' && !ids.every(f => groupIds.has(f))) throw Error('Knockout game in group view');
          if (label === '결선' && ids.some(f => groupIds.has(f))) throw Error('Group game in knockout view');
        }
        results.push({ phase: label, mineEnabled: enabled, count: ids.length });
      }
      await page.screenshot({ path: path.join(output, `mine-knockout-${width}.png`) });
      if (phase === 'after') {
        await page.reload({ waitUntil: 'domcontentloaded' });
        await toggle.waitFor();
        if (await toggle.getAttribute('aria-checked') !== 'true') throw Error('Mine state lost on reload');
        if (await page.getByRole('tab', { name: '결선', exact: true }).getAttribute('aria-selected') !== 'true') throw Error('Phase state lost on reload');
        await toggle.click();
        if (await page.getByRole('tab', { name: '결선', exact: true }).getAttribute('aria-selected') !== 'true') throw Error('Phase reset when switch disabled');
      }
      await page.getByRole('tab', { name: '순위 · 대진표', exact: true }).click();
      const annotation = page.getByText(phase === 'after' ? '우리 팀이 속한 조예요' : '*) 우리팀이 속한 조에요', { exact: true }).first();
      await annotation.waitFor();
      await annotation.scrollIntoViewIfNeeded();
      const color = await annotation.evaluate(e => getComputedStyle(e).color);
      if (phase === 'after' && color !== 'rgb(240, 68, 82)') throw Error(`Wrong annotation color ${color}`);
      await page.waitForTimeout(250);
      await page.screenshot({ path: path.join(output, `my-group-${width}.png`) });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
      if (overflow) throw Error(`Page overflow at ${width}`);
      evidence.viewports.push({ width, results, annotationColor: color, verdict: phase === 'after' ? 'PASS' : 'BASELINE' });
    }
  } finally {
    await browser.close();
    await server.close();
    evidence.cleanup = 'Owned browser closed';
    fs.writeFileSync(path.join(output, 'evidence.json'), JSON.stringify(evidence, null, 2));
  }
  console.log(JSON.stringify(evidence));
})().catch(e => { console.error(e); process.exitCode = 1; });
