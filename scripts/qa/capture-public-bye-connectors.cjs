/* Read-only alpha evidence; run before/after deployment with the same tournament. */
const { chromium } = require('@playwright/test');
const { mkdir, writeFile } = require('node:fs/promises');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

async function main() {
  const [url, output] = process.argv.slice(2);
  if (!url || new URL(url).origin !== 'https://alpha.teameet.co.kr' || !output) {
    throw new Error('Usage: node scripts/qa/capture-public-bye-connectors.cjs <alpha bracket URL> <output directory>');
  }
  await mkdir(output, { recursive: true });
  const server = await chromium.launchServer({ headless: false });
  const browserPid = server.process().pid;
  console.log(execFileSync('ps', ['-o', 'pid,ppid,args', '-p', String(browserPid)], { encoding: 'utf8' }));
  const evidence = { url, persona: 'anonymous', browserPid, parentPid: process.pid, viewports: [] };
  try {
    const browser = await chromium.connect(server.wsEndpoint());
    const context = await browser.newContext();
    const page = await context.newPage();
    const tournamentId = new URL(url).pathname.split('/')[2];
    const response = await context.request.get(`https://alpha.teameet.co.kr/api/v1/tournaments/${encodeURIComponent(tournamentId)}`);
    if (!response.ok()) throw new Error(`Public detail failed: ${response.status()}`);
    const detail = (await response.json()).data;
    const byes = detail.groups.flatMap(group => group.groupTeams).filter(team => team.isBye && team.byeTarget);
    evidence.savedByeTargets = byes.map(bye => ({ id: bye.id, ...bye.byeTarget }));
    const consoleErrors = [], pageErrors = [], failedResponses = [];
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('response', response => { if (response.status() >= 400) failedResponses.push({ status: response.status(), path: new URL(response.url()).pathname }); });
    for (const width of [1440, 768, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      // The schedule SSR also mounts a hidden bracket until client hydration.
      // Wait for that hidden tree to unmount before clicking, so the mount effect
      // restoring the URL tab cannot overwrite this user action.
      await page.locator('[data-bracket-node]').first().waitFor({ state: 'detached' });
      await page.getByRole('tab', { name: '순위 · 대진표', exact: true }).click();
      await page.getByRole('region', { name: '12강 부전승', exact: true }).first().waitFor();
      const svg = page.getByRole('img', { name: '경기별 진출 연결선', exact: true });
      await svg.waitFor();
      if (byes.length) await page.waitForFunction(count => Array.from(document.querySelectorAll('svg[aria-label="경기별 진출 연결선"] path title')).filter(title => title.textContent?.startsWith('부전승 →')).length === count, byes.length);
      const titles = await svg.locator('path title').allTextContents();
      const endpoints = await page.evaluate(byes => byes.map(bye => {
        const source = document.querySelector(`[data-bracket-node="bye-slot:${bye.id}"]`);
        const target = document.querySelector(`[data-bracket-node="${bye.byeTarget.fixtureId}"]`);
        const row = target?.querySelectorAll('[data-bracket-team-row]')[bye.byeTarget.side === 'HOME' ? 0 : 1];
        const canvas = source?.closest('[data-bracket-round]')?.parentElement;
        if (!source || !row || !canvas) throw new Error('Saved BYE source/target is missing from the picture');
        const bounds = canvas.getBoundingClientRect();
        const from = (source.querySelector('.tm-bk2-card') ?? source).getBoundingClientRect();
        const to = row.getBoundingClientRect();
        const expected = [from.right - bounds.left, from.top + from.height / 2 - bounds.top,
          to.left - bounds.left, to.top + to.height / 2 - bounds.top];
        const matching = Array.from(canvas.querySelectorAll('svg path')).filter(path => path.querySelector('title')?.textContent.startsWith('부전승 →')).find(path => {
          const values = (path.getAttribute('d') ?? '').match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
          return values.length === 5 && [values[0], values[1], values[4], values[3]].every((value, index) => Math.abs(value - expected[index]) < 0.5);
        });
        if (!matching) throw new Error(`BYE line does not reach its saved ${bye.byeTarget.side} row`);
        return { source: bye.id, ...bye.byeTarget, path: matching.getAttribute('d'), verified: true };
      }), byes);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
      // Mobile/tablet scroll inside the app shell; fullPage alone only captures
      // the standings above the bracket. Bring the changed picture into view.
      await page.locator('[data-bracket-node^="bye-slot:"]').first().scrollIntoViewIfNeeded();
      const screenshot = `${width}.png`;
      await page.screenshot({ path: path.join(output, screenshot), fullPage: true });
      evidence.viewports.push({ width, screenshot, overflow, endpoints, byeCards: await page.getByRole('region', { name: '12강 부전승', exact: true }).count(), byeConnections: titles.filter(title => title.startsWith('부전승 →')), connections: titles });
    }
    Object.assign(evidence, { consoleErrors, pageErrors, failedResponses });
    await context.close();
    await browser.close();
  } finally {
    await server.close();
    evidence.browserClosed = true;
    await writeFile(path.join(output, 'evidence.json'), JSON.stringify(evidence, null, 2) + '\n');
  }
  console.log(JSON.stringify(evidence));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
