const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '@playwright/test');
(async () => {
  const out = path.resolve('docs/screenshots/pr1951-alpha-navigation');
  await fs.mkdir(out, { recursive: true });
  const server = await chromium.launchServer({ headless: false, executablePath: process.env.QA_CHROME_PATH });
  console.log(JSON.stringify({ nodePid: process.pid, parentPid: process.ppid, browserPid: server.process().pid }));
  const browser = await chromium.connect(server.wsEndpoint());
  const results = [];
  try {
    for (const width of [1440, 768, 390]) {
      const context = await browser.newContext({ viewport: { width, height: 1000 } });
      const page = await context.newPage();
      const errors = [], failures = [], consoleErrors = [];
      page.on('pageerror', e => errors.push(e.message));
      page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
      page.on('response', r => { if (r.status() >= 400) failures.push({ url: r.url(), status: r.status() }); });
      await page.goto('https://alpha.teameet.co.kr/league-matches/d8c05237-314c-4ccd-83ae-069e0f5a7ef7/fixtures/d8cd9327-24d8-4932-8e0f-99452e0b9538?from=%2Fhome', { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('domcontentloaded');
      await page.screenshot({ path: path.join(out, `${width}-fixture.png`), fullPage: true });
      await page.getByRole('link', { name: '전체 순위표·일정 보기', exact: true }).click();
      await page.waitForURL(u => u.pathname === '/tournaments/d8c05237-314c-4ccd-83ae-069e0f5a7ef7/bracket' && u.searchParams.get('tab') === 'standings');
      await page.getByRole('tab', { name: '리그 순위', exact: true }).waitFor();
      await page.getByRole('table').first().waitFor();
      const selected = await page.getByRole('tab', { name: '리그 순위', exact: true }).getAttribute('aria-selected');
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
      await page.waitForLoadState('domcontentloaded');
      await page.screenshot({ path: path.join(out, `${width}-standings.png`), fullPage: true });
      results.push({ width, url: page.url(), selected, overflow, errors, failures, consoleErrors, persona: 'anonymous, live Alpha; no response interception' });
      if (selected !== 'true' || overflow || errors.length || failures.length || consoleErrors.length) throw new Error(`Alpha navigation failed at ${width}px`);
      await context.close();
    }
  } finally {
    await fs.writeFile(path.join(out, 'results.json'), JSON.stringify(results, null, 2));
    await browser.close();
    await server.close();
  }
  console.log(JSON.stringify(results, null, 2));
})().catch(e => { console.error(e); process.exitCode = 1; });