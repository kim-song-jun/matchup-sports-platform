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
      const detailResponse = await context.request.get(`${origin}/api/v1/tournaments/${id}`);
      const detail = (await detailResponse.json()).data;
      if (!detail?.title) throw new Error(`Detail API failed: ${detailResponse.status()}`);
      await page.getByRole('heading', { level: 1, name: detail.title, exact: true }).waitFor();
      const standings = page.getByRole('table', { name: '통합 순위표' });
      if (detail.status !== 'completed') await standings.waitFor({ state: 'visible', timeout: 20000 }).catch(() => {});
      const standingsVisible = await standings.isVisible();
      const rosterToggle = page.getByRole('button', { name: /명단 펼치기/ }).first();
      if (detail.status !== 'completed' && await rosterToggle.isVisible()) {
        await rosterToggle.click();
        await page.getByRole('button', { name: /명단 접기/ }).first().waitFor();
      }
      await page.locator('img[alt$="대표 이미지"]').evaluateAll(async (images) => {
        await Promise.all(images.map((image) => image.complete ? Promise.resolve() : new Promise((resolve) => {
          image.addEventListener('load', resolve, { once: true }); image.addEventListener('error', resolve, { once: true });
        })));
      });
      await page.screenshot({ path: path.join(output, `${width}-detail.png`), fullPage: true });
      if (standingsVisible) await standings.screenshot({ path: path.join(output, `${width}-standings.png`) });
      results.push({ width, pathname: new URL(page.url()).pathname, accessible: true, standingsVisible, savedCover: Boolean(detail.coverImageUrl), errors, failed,
        ...(await page.evaluate(() => ({
          overflow: document.documentElement.scrollWidth > window.innerWidth,
          coverVisible: Boolean(document.querySelector('img[alt$="대표 이미지"]')),
          coverLoaded: Boolean(document.querySelector('img[alt$="대표 이미지"]')?.naturalWidth),
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
