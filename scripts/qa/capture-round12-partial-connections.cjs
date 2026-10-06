const { chromium } = require('../../node_modules/.pnpm/playwright-core@1.58.2/node_modules/playwright-core');
const fs = require('node:fs');
const path = require('node:path');
const origin = 'https://alpha.teameet.co.kr';
const id = 'ad120000-0000-4000-8000-000000000001';
const phase = process.argv[2] ?? 'before';
if (!['before', 'after'].includes(phase)) throw new Error('Expected before or after');
const output = path.resolve('tmp/qa-round12-partial-connections');
(async () => {
  fs.mkdirSync(output, { recursive: true });
  const server = await chromium.launchServer({ headless: false, executablePath: process.env.LOCALAPPDATA + '/ms-playwright/chromium-1208/chrome-win64/chrome.exe' });
  const ownership = { browserPid: server.process().pid, parentPid: process.pid };
  console.log(JSON.stringify({ ...ownership, started: true }));
  const browser = await chromium.connect(server.wsEndpoint());
  const issues = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.on('pageerror', error => issues.push({ kind: 'pageerror', message: error.message }));
    page.on('console', message => { if (message.type() === 'error') issues.push({ kind: 'console', message: message.text() }); });
    page.on('response', response => { if (response.status() >= 400) issues.push({ kind: 'http', status: response.status(), path: new URL(response.url()).pathname }); });
    const response = await page.goto(`${origin}/tournaments/${id}/bracket`, { waitUntil: 'domcontentloaded' });
    const headers = response.headers();
    await page.getByRole('tab', { name: '순위 · 대진표', exact: true }).click();
    await page.locator('[data-bracket-round="quarter"]').waitFor();
    const viewports = [];
    for (const width of [1440, 768, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(output, `${phase}-${width}.png`), fullPage: true });
      viewports.push(await page.evaluate(() => {
        const bounds = element => { const rect = element.getBoundingClientRect(); return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }; };
        return { width: innerWidth, documentWidth: document.documentElement.scrollWidth, rounds: Array.from(document.querySelectorAll('[data-bracket-round]')).map(round => ({ phase: round.dataset.bracketRound, bounds: bounds(round), nodes: Array.from(round.querySelectorAll('[data-bracket-node]')).map(node => ({ id: node.dataset.bracketNode, bounds: bounds(node), text: node.innerText })) })), lines: Array.from(document.querySelectorAll('svg[aria-label="경기별 진출 연결선"] path')).map(line => ({ path: line.getAttribute('d'), title: line.textContent })) };
      }));
    }
    fs.writeFileSync(path.join(output, `${phase}-evidence.json`), JSON.stringify({ ...ownership, url: page.url(), commit: headers['x-teameet-commit'], viewports, issues }, null, 2));
    console.log(JSON.stringify({ captured: true, viewports: viewports.map(viewport => ({ width: viewport.width, documentWidth: viewport.documentWidth, lines: viewport.lines.length })), issues }));
  } finally {
    await browser.close();
    await server.close();
    console.log(JSON.stringify({ ...ownership, closed: true }));
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
