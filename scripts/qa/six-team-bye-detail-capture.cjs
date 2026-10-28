const { chromium } = require('D:/sm/matchup-sports/matchup-sports-platform/node_modules/.pnpm/playwright-core@1.58.2/node_modules/playwright-core');
const fs = require('node:fs');
const path = require('node:path');
const phase = process.argv[2] || 'before';
const out = path.resolve('docs/screenshots/six-team-bye-detail');
fs.mkdirSync(out, { recursive: true });
(async () => {
  const server = await chromium.launchServer({ headless: false, channel: 'chrome' });
  console.log(JSON.stringify({ browserPid: server.process().pid, parentPid: process.pid }));
  const browser = await chromium.connect(server.wsEndpoint());
  const observations = [];
  try {
    for (const width of [390, 768, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 1000 } });
      try {
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
        page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
        await page.goto('https://alpha.teameet.co.kr/tournaments/a90df6d5-47e9-40f9-93ef-f679ce8da858?from=%2Ftournaments', { waitUntil: 'domcontentloaded' });
        const bracket = page.locator('.tm-tournament-detail-bracket');
        await bracket.waitFor({ timeout: 30000 });
        await bracket.scrollIntoViewIfNeeded();
        const text = await bracket.innerText();
        if (phase === 'after' && !text.includes('준결승 부전승 1팀')) throw new Error('Missing semifinal bye summary');
        await bracket.screenshot({ path: path.join(out, `${phase}-${width}.png`) });
        observations.push({ width, text, errors, horizontalOverflow: await page.evaluate(() => document.documentElement.scrollWidth > innerWidth) });
      } catch (error) { observations.push({ width, failure: error.message }); }
      finally { await context.close(); }
    }
  } finally {
    await browser.close();
    await server.close();
    fs.writeFileSync(path.join(out, `${phase}-observations.json`), JSON.stringify({ observations, cleanup: 'owned headed browser closed' }, null, 2));
  }
  console.log(JSON.stringify(observations));
  if (observations.some(row => row.failure || row.errors.length || row.horizontalOverflow)) process.exitCode = 1;
})().catch(error => { console.error(error.message); process.exitCode = 1; });
