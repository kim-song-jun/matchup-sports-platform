const { chromium } = require('../../node_modules/.pnpm/playwright-core@1.58.2/node_modules/playwright-core');
const fs = require('node:fs');
const path = require('node:path');
const phase = process.argv[2] ?? 'before';
if (!['before', 'after'].includes(phase)) throw new Error('Expected before or after');
const output = path.resolve('tmp/qa-tournament-progress-round-order');
(async () => {
  fs.mkdirSync(output, { recursive: true });
  const server = await chromium.launchServer({ headless: false, executablePath: process.env.LOCALAPPDATA + '/ms-playwright/chromium-1208/chrome-win64/chrome.exe' });
  const ownership = { browserPid: server.process().pid, parentPid: process.pid };
  console.log(JSON.stringify({ ...ownership, started: true }));
  const browser = await chromium.connect(server.wsEndpoint());
  try {
    const page = await browser.newPage();
    const issues = [];
    page.on('pageerror', error => issues.push({ kind: 'pageerror', message: error.message }));
    page.on('console', message => { if (message.type() === 'error') issues.push({ kind: 'console', message: message.text() }); });
    page.on('response', response => { if (response.status() >= 400) issues.push({ kind: 'http', status: response.status(), path: new URL(response.url()).pathname }); });
    const response = await page.goto('https://alpha.teameet.co.kr/tournaments/ad120000-0000-4000-8000-000000000001/bracket', { waitUntil: 'domcontentloaded' });
    await page.getByRole('tab', { name: '경기 일정', exact: true }).waitFor();
    const viewports = [];
    for (const width of [1440, 768, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      const stages = page.getByRole('list', { name: '대회 진행 단계', exact: true });
      await stages.scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(output, `${phase}-${width}.png`), fullPage: true });
      viewports.push(await stages.evaluate(element => ({ width: innerWidth, documentWidth: document.documentElement.scrollWidth, labels: Array.from(element.querySelectorAll('.tm-hub-stage-label'), label => label.textContent), text: element.innerText })));
      await page.getByRole('tab', { name: '순위 · 대진표', exact: true }).click();
      await page.screenshot({ path: path.join(output, `${phase}-${width}-standings.png`), fullPage: true });
      viewports[viewports.length - 1].standings = await page.locator('table').evaluateAll(tables => tables.map(table => table.getAttribute('aria-label')));
      await page.getByRole('tab', { name: '경기 일정', exact: true }).click();
      viewports[viewports.length - 1].scheduleHeadings = await page.locator('.tm-bracket-schedule-pane').innerText();
    }
    const detail = await page.request.get('https://alpha.teameet.co.kr/api/v1/tournaments/ad120000-0000-4000-8000-000000000001');
    const detailData = (await detail.json()).data;
    const groupOrder = detailData.groups.map(group => ({ name: group.name, phase: group.phase, sortOrder: group.sortOrder }));
    const liveFixtures = detailData.fixtures.filter(fixture => fixture.liveStatus === 'live').map(fixture => ({ id: fixture.id, round: fixture.round, scheduledAt: fixture.scheduledAt }));
    fs.writeFileSync(path.join(output, `${phase}-evidence.json`), JSON.stringify({ ...ownership, commit: response.headers()['x-teameet-commit'], groupOrder, liveFixtures, viewports, issues }, null, 2));
    console.log(JSON.stringify({ groupOrder, liveFixtures, viewports: viewports.map(({scheduleHeadings, ...rest}) => rest), issues }));
  } finally {
    await browser.close();
    await server.close();
    console.log(JSON.stringify({ ...ownership, closed: true }));
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
