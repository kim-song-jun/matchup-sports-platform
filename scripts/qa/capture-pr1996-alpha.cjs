const { chromium } = require('../../node_modules/.pnpm/playwright-core@1.58.2/node_modules/playwright-core');
const fs = require('node:fs');
const path = require('node:path');
const phase = process.argv[2];
if (!['before', 'after'].includes(phase)) throw Error('Expected before/after');
const id = 'd5202610-1018-4000-8000-000000000001';
const output = path.resolve('tmp/qa-pr1996', phase);
(async () => {
  fs.mkdirSync(output, { recursive: true });
  const server = await chromium.launchServer({ headless: false, executablePath: path.join(process.env.LOCALAPPDATA, 'ms-playwright/chromium-1208/chrome-win64/chrome.exe') });
  const evidence = { phase, persona: 'anonymous', browserPid: server.process().pid, parentPid: process.pid, issues: [], viewports: [] };
  console.log(JSON.stringify({ browserPid: evidence.browserPid, parentPid: evidence.parentPid }));
  const browser = await chromium.connect(server.wsEndpoint());
  try {
    const page = await browser.newPage();
    page.on('pageerror', e => evidence.issues.push({ kind: 'pageerror', message: e.message }));
    page.on('console', m => { if (m.type() === 'error') evidence.issues.push({ kind: 'console', message: m.text() }); });
    page.on('response', r => { if (r.status() >= 400) evidence.issues.push({ kind: 'http', status: r.status(), path: new URL(r.url()).pathname }); });
    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      const response = await page.goto(`https://alpha.teameet.co.kr/tournaments/${id}/bracket`, { waitUntil: 'domcontentloaded' });
      evidence.commit = response.headers()['x-teameet-commit'];
      await page.getByRole('tab', { name: '경기 일정', exact: true }).waitFor();
      await page.locator('.tm-schedule-card').first().waitFor();
      if (phase === 'after' && await page.getByRole('heading', { name: '경기 일정', exact: true }).count()) throw Error('Duplicate schedule heading');
      await page.screenshot({ path: path.join(output, `schedule-${width}.png`) });
      await page.getByRole('tab', { name: '순위 · 대진표', exact: true }).click();
      await page.getByRole('table').first().waitFor();
      if (phase === 'after') {
        if (await page.getByRole('heading', { name: '조별 순위', exact: true }).count()) throw Error('Duplicate standings heading');
        const tabs = page.getByRole('tablist', { name: '순위·대진 단계' });
        await tabs.getByRole('tab', { name: '조별리그', exact: true }).waitFor();
        await page.screenshot({ path: path.join(output, `groups-${width}.png`) });
        await tabs.getByRole('tab', { name: '결선', exact: true }).click();
        await page.locator('.tm-bk-wrap').waitFor();
        if (await page.getByRole('table').count()) throw Error('Group standings still visible in knockout phase');
        await page.screenshot({ path: path.join(output, `knockout-${width}.png`) });
        await tabs.getByRole('tab', { name: '조별리그', exact: true }).click();
        await page.getByRole('table').first().waitFor();
      } else await page.screenshot({ path: path.join(output, `standings-${width}.png`) });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
      if (overflow) throw Error(`Page overflow at ${width}`);
      evidence.viewports.push({ width, verdict: 'PASS' });
    }
  } finally {
    await browser.close();
    await server.close();
    evidence.cleanup = 'Owned browser closed';
    fs.writeFileSync(path.join(output, 'evidence.json'), JSON.stringify(evidence, null, 2));
  }
  console.log(JSON.stringify(evidence));
})().catch(e => { console.error(e); process.exitCode = 1; });
