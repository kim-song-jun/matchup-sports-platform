const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');

const phase = process.argv[2] || 'before';
if (!['before', 'after'].includes(phase)) throw new Error('Use before or after');
const out = path.resolve('docs/screenshots/six-team-connected');
const tournamentId = process.env.QA_SIX_TEAM_TOURNAMENT_ID || 'a90df6d5-47e9-40f9-93ef-f679ce8da858';
if (!/^[a-f0-9-]{36}$/.test(tournamentId)) throw new Error('Invalid tournament id');

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const server = await chromium.launchServer({ headless: false, channel: 'chrome' });
  const lifecycle = { browserPid: server.process().pid, parentPid: process.pid };
  console.log(JSON.stringify(lifecycle));
  const browser = await chromium.connect(server.wsEndpoint());
  const observations = [];
  try {
    for (const width of [390, 768, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 1000 } });
      try {
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push({ type: 'pageerror', message: error.message }));
        page.on('console', message => { if (message.type() === 'error') errors.push({ type: 'console', message: message.text() }); });
        page.on('response', response => { if (response.status() >= 400) errors.push({ type: 'network', status: response.status(), url: response.url() }); });
        const response = await page.goto(`https://alpha.teameet.co.kr/tournaments/${tournamentId}`, { waitUntil: 'domcontentloaded' });
        const bracket = page.locator('.tm-tournament-detail-bracket');
        await bracket.waitFor({ timeout: 30000 });
        await bracket.scrollIntoViewIfNeeded();
        if (phase === 'after') await page.getByRole('region', { name: '6강부터 결승까지 대진' }).waitFor({ timeout: 15000 });
        await bracket.screenshot({ path: path.join(out, `${phase}-${width}.png`) });
        const canvas = page.getByRole('region', { name: '6강부터 결승까지 대진' });
        const paths = await canvas.locator('[data-connection]').count();
        observations.push({ width, commit: response.headers()['x-teameet-commit'], status: response.status(), text: await bracket.innerText(), paths, errors, horizontalOverflow: await page.evaluate(() => document.documentElement.scrollWidth > innerWidth) });
        if (phase === 'after' && paths !== 2) throw new Error(`Expected two final paths, received ${paths}`);
      } catch (error) { observations.push({ width, failure: error.message }); }
      finally { await context.close(); }
    }
  } finally {
    await browser.close();
    await server.close();
    fs.writeFileSync(path.join(out, `${phase}-observations.json`), JSON.stringify({ ...lifecycle, observations, cleanup: 'owned headed browser closed' }, null, 2));
  }
  console.log(JSON.stringify(observations));
  if (observations.some(row => row.failure || row.horizontalOverflow || row.errors?.length)) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
