// Read-only alpha QA. No fixture injection or league/team mutations.
const { chromium } = require('@playwright/test');
const { mkdir, writeFile } = require('node:fs/promises');
const path = require('node:path');

async function main() {
  const phase = process.argv[2];
  if (!['before', 'after'].includes(phase)) throw new Error('Use before or after');
  const origin = 'https://alpha.teameet.co.kr';
  const id = process.argv[3] || 'aef0d98f-17eb-4590-b27d-a2d8bab765e6';
  const output = path.resolve('docs/screenshots/league-detail-media', phase, id);
  await mkdir(output, { recursive: true });
  const server = await chromium.launchServer({ channel: 'chrome', headless: false });
  console.log(JSON.stringify({ qaPid: process.pid, qaParentPid: process.ppid, browserPid: server.process().pid }));
  const browser = await chromium.connect(server.wsEndpoint());
  const results = [];
  try {
    for (const width of [390, 768, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 1000 } });
      if (process.env.ALPHA_SESSION_TOKEN) {
        await context.addCookies([{ name: 'teameet_v1_session', value: process.env.ALPHA_SESSION_TOKEN,
          domain: 'alpha.teameet.co.kr', path: '/', httpOnly: true, secure: true }]);
      }
      const page = await context.newPage();
      const errors = [];
      const failed = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
      page.on('response', (response) => {
        if (response.status() >= 400) failed.push({ url: new URL(response.url()).pathname, status: response.status() });
      });
      await page.goto(`${origin}/tournaments/${id}?from=%2Ftournaments%3Fkind%3Dleague`, { waitUntil: 'domcontentloaded' });
      await page.getByRole('heading', { level: 1 }).first().waitFor();
      const standings = page.getByRole('table', { name: '통합 순위표' });
      await standings.waitFor({ state: 'visible', timeout: 20000 }).catch(() => {});
      const accessible = await standings.isVisible();
      if (accessible) {
        await page.getByRole('button', { name: /명단 펼치기/ }).first().click();
        await page.locator('li').first().waitFor();
      }
      await page.screenshot({ path: path.join(output, `${width}-detail.png`), fullPage: true });
      if (accessible) await standings.screenshot({ path: path.join(output, `${width}-standings.png`) });
      results.push({ width, pathname: new URL(page.url()).pathname, accessible, errors, failed,
        ...(await page.evaluate(() => ({
          overflow: document.documentElement.scrollWidth > window.innerWidth,
          coverVisible: Boolean(document.querySelector('img[alt$="대표 이미지"]')),
          standingLogoCount: document.querySelectorAll('table[aria-label="통합 순위표"] tbody img').length,
        }))) });
      await context.close();
    }
  } finally { await browser.close(); await server.close(); }
  await writeFile(path.join(output, 'evidence.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results));
  if (results.some((row) => !row.accessible)) process.exitCode = 2;
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
