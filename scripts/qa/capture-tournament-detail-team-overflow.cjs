const { chromium } = require('../../node_modules/.pnpm/playwright-core@1.58.2/node_modules/playwright-core');
const fs = require('node:fs');
const path = require('node:path');
const phase = process.argv[2] || 'before';
const output = path.resolve('tmp/qa-tournament-detail-team-overflow');
(async () => {
  fs.mkdirSync(output, { recursive: true });
  const server = await chromium.launchServer({ headless: false, executablePath: process.env.LOCALAPPDATA + '/ms-playwright/chromium-1208/chrome-win64/chrome.exe' });
  const ownership = { browserPid: server.process().pid, parentPid: process.pid };
  console.log(JSON.stringify({ ...ownership, started: true }));
  const browser = await chromium.connect(server.wsEndpoint());
  try {
    const page = await browser.newPage();
    const issues = [];
    page.on('pageerror', e => issues.push({ kind: 'pageerror', message: e.message }));
    page.on('response', r => { if (r.status() >= 400) issues.push({ kind: 'http', status: r.status(), path: new URL(r.url()).pathname }); });
    page.on('console', m => { if (m.type() === 'error') issues.push({ kind: 'console', message: m.text() }); });
    await page.setViewportSize({ width: 390, height: 900 });
    const response = await page.goto('https://alpha.teameet.co.kr/tournaments/ad120000-0000-4000-8000-000000000001', { waitUntil: 'domcontentloaded' });
    await page.getByRole('group', { name: / 대 / }).first().waitFor();
    if (phase === 'probe') {
      const source = fs.readFileSync(path.resolve('tmp/worktrees/tournament-detail-overflow/apps/v1_web/src/components/tournaments/competition-fixture-card.tsx'), 'utf8');
      const columns = source.match(/gridTemplateColumns: '([^']+)'/)[1];
      await page.getByRole('group', { name: / 대 / }).evaluateAll((elements, columns) => {
        for (const element of elements) if (getComputedStyle(element).display === 'grid') element.style.gridTemplateColumns = columns;
      }, columns);
    }
    const views = [];
    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.getByRole('group', { name: / 대 / }).first().scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(output, `${phase}-${width}.png`), fullPage: true });
      views.push(await page.evaluate(() => ({
        width: innerWidth, documentWidth: document.documentElement.scrollWidth,
        matchups: Array.from(document.querySelectorAll('[role="group"]')).filter(e=>e.getAttribute('aria-label')?.includes(' 대 ')).map(e=>({
          label: e.getAttribute('aria-label'), columns: getComputedStyle(e).gridTemplateColumns,
          width: e.clientWidth, scrollWidth: e.scrollWidth,
          teams: Array.from(e.querySelectorAll('.tm-text-body-lg')).map(t=>({text:t.textContent,width:t.clientWidth,scrollWidth:t.scrollWidth,right:t.getBoundingClientRect().right})),
        })),
      })));
    }
    fs.writeFileSync(path.join(output, `${phase}-evidence.json`), JSON.stringify({ ...ownership, commit: response.headers()['x-teameet-commit'], views, issues }, null, 2));
    console.log(JSON.stringify({ views: views.map(v=>({width:v.width,documentWidth:v.documentWidth,cards:v.matchups.filter(m=>m.teams.length).length,overflowingCards:v.matchups.filter(m=>m.teams.length && m.scrollWidth>m.width).length})), issues }));
    if (phase !== 'before' && views.some(v=>v.matchups.some(m=>m.teams.length && m.scrollWidth>m.width))) throw new Error('Fixture cards overflow');
  } finally {
    await browser.close(); await server.close(); console.log(JSON.stringify({ ...ownership, closed: true }));
  }
})().catch(e=>{console.error(e.message);process.exitCode=1;});
