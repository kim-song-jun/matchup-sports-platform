// Read-only headed alpha verification. No credentials or stored sessions.
const fs = require('node:fs/promises');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { chromium } = require('@playwright/test');
const origin = 'https://alpha.teameet.co.kr';
const id = process.env.QA_TOURNAMENT_ID;
const detail = `/tournaments/${id}?from=${encodeURIComponent('/tournaments?kind=league')}`;
const output = process.env.QA_OUTPUT_DIR;
(async () => {
  if (!output || !id) throw new Error('QA_OUTPUT_DIR and QA_TOURNAMENT_ID are required');
  await fs.mkdir(output, { recursive: true });
  const browser = await chromium.launch({ headless: false });
  console.log('Owned headed browser:', process.pid, execFileSync('ps', ['--ppid', String(process.pid), '-o', 'pid,ppid,comm'], { encoding: 'utf8' }));
  const evidence = { stage: 'after', persona: 'unauthenticated visitor', route: detail, errors: [], consoleErrors: [], apiFailures: [], viewports: [] };
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    page.on('pageerror', e => evidence.errors.push(e.message));
    page.on('console', message => { if (message.type() === 'error') evidence.consoleErrors.push(message.text()); });
    page.on('response', response => { if (response.status() >= 400 && response.url().includes('/api/')) evidence.apiFailures.push({ path: new URL(response.url()).pathname, status: response.status() }); });
    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(`${origin}${detail}`, { waitUntil: 'domcontentloaded' });
      await page.getByRole('heading', { level: 1 }).waitFor();
      const link = page.getByRole('link', { name: '진행 중인 리그 보기', exact: true });
      await link.waitFor({ state: 'visible', timeout: 30000 });
      await page.waitForTimeout(500);
      const href = await link.getAttribute('href');
      const parsed = new URL(href, origin);
      if (parsed.pathname !== `/tournaments/${id}/bracket` || parsed.searchParams.get('from') !== detail) throw new Error('Wrong destination or return context');
      const box = await link.boundingBox();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
      if (!box || box.x < 0 || box.x + box.width > width + 1 || box.height < 44 || overflow) throw new Error(`Layout failed at ${width}`);
      await page.screenshot({ path: path.join(output, `after-${width}.png`) });
      await link.click();
      await page.waitForURL(url => url.pathname === `/tournaments/${id}/bracket`, { timeout: 30000 });
      await page.getByRole('tab', { name: '경기 일정', exact: true }).waitFor();
      await page.getByRole('tab', { name: '리그 순위', exact: true }).click();
      await page.waitForTimeout(400);
      const standingsSelected = await page.getByRole('tab', { name: '리그 순위', exact: true }).getAttribute('aria-selected');
      if (standingsSelected !== 'true') throw new Error('Standings tab did not activate');
      await page.getByRole('tab', { name: '경기 일정', exact: true }).click();
      const fixtureCount = await page.locator(`a[href*="/tournaments/${id}/matches/"], a[href*="/league-matches/${id}/fixtures/"]`).count();
      await page.screenshot({ path: path.join(output, `destination-${width}.png`) });
      await page.getByRole('link', { name: /뒤로/ }).first().click();
      await page.waitForURL(url => url.pathname === `/tournaments/${id}`, { timeout: 30000 });
      const returned = new URL(page.url());
      if (returned.searchParams.get('from') !== '/tournaments?kind=league') throw new Error('List return context was lost');
      evidence.viewports.push({ width, verdict: 'PASS', href, box, overflow, standingsSelected, fixtureCount, returnedTo: returned.pathname + returned.search });
    }
    await fs.writeFile(path.join(output, 'evidence.json'), JSON.stringify(evidence, null, 2));
    console.log(JSON.stringify(evidence));
  } finally { await browser.close(); console.log('Owned browser closed'); }
})().catch(e => { console.error(e.stack); process.exitCode = 1; });
