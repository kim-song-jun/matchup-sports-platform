// Read-only, headed alpha check. No credentials, seed changes or mocked responses.
const fs = require('node:fs/promises');
const { execFileSync } = require('node:child_process');
const { chromium } = require('playwright');
const origin = 'https://alpha.teameet.co.kr';
const stage = process.argv[2];
if (!['before', 'after'].includes(stage)) throw new Error('Expected before or after');
const output = 'docs/screenshots/league-live-matchday-2026-10-19';
const today = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);

(async () => {
  await fs.mkdir(output, { recursive: true });
  const list = await fetch(`${origin}/api/v1/tournaments?kind=league&limit=50`).then(r => r.json());
  let target;
  for (const item of list.data.items.filter(item => item.status === 'in_progress')) {
    const response = await fetch(`${origin}/api/v1/tournaments/${encodeURIComponent(item.id)}`);
    if (!response.ok) continue;
    const detail = (await response.json()).data;
    if (detail.kind !== 'regular_league') continue;
    const isToday = detail.leagueFixtures.some(f => f.status !== 'cancelled' && f.gameState !== 'CANCELLED'
      && Number.isFinite(Date.parse(f.startAt))
      && new Date(Date.parse(f.startAt) + 9 * 60 * 60 * 1000).toISOString().slice(0, 10) === today);
    if (!isToday) { target = detail; break; }
  }
  if (!target) throw new Error('No public active league without a match today');
  const report = { stage, persona: 'public visitor', dateKst: today, nodePid: process.pid, widths: [], consoleErrors: [], pageErrors: [], httpErrors: [] };
  const browser = await chromium.launch({ headless: false });
  try {
    const command = `Get-CimInstance Win32_Process | Where-Object ParentProcessId -eq ${process.pid} | Select-Object ProcessId,ParentProcessId,Name | ConvertTo-Json -Compress`;
    report.ownedBrowserProcesses = JSON.parse(execFileSync('powershell.exe', ['-NoProfile', '-Command', command], { encoding: 'utf8' }) || '[]');
    const context = await browser.newContext({ timezoneId: 'Asia/Seoul' });
    const page = await context.newPage();
    page.on('pageerror', e => report.pageErrors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') report.consoleErrors.push(m.text()); });
    page.on('response', r => { if (r.status() >= 400 && r.url().startsWith(origin)) report.httpErrors.push({ path: new URL(r.url()).pathname, status: r.status() }); });
    async function settleVisibleImages() {
      await page.evaluate(() => document.fonts.ready);
      await page.waitForFunction(() => [...document.images].filter(img => {
        const rect = img.getBoundingClientRect();
        return rect.top < innerHeight && rect.bottom > 0;
      }).every(img => img.complete), undefined, { timeout: 10000 });
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    }
    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(`${origin}/tournaments/${encodeURIComponent(target.id)}`, { waitUntil: 'domcontentloaded' });
      const row = { width };
      try {
        await page.getByRole('heading', { name: target.title, exact: true }).waitFor({ timeout: 20000 });
        await page.locator('.tm-tournament-detail-article').waitFor({ timeout: 10000 });
        await settleVisibleImages();
        row.seasonLabel = await page.getByText('시즌 진행 중', { exact: true }).count();
        row.liveLabel = await page.getByText('LIVE', { exact: true }).count();
        row.scheduleLinks = await page.getByRole('link', { name: '일정 보기', exact: true }).count();
        row.horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
        row.verdict = stage === 'before' ? 'baseline' : row.seasonLabel > 0 && row.liveLabel === 0 && row.scheduleLinks > 0 && !row.horizontalOverflow ? 'PASS' : 'FAIL';
      } catch (e) {
        row.verdict = 'BLOCKED';
        row.reason = 'Public detail was unavailable or redirected before the real page rendered';
        row.path = new URL(page.url()).pathname;
      }
      await page.screenshot({ path: `${output}/${stage}-${width}.png`, fullPage: true });
      await page.goto(`${origin}/tournaments?kind=league&status=in_progress`, { waitUntil: 'domcontentloaded' });
      try {
        await page.getByRole('listitem').first().waitFor({ timeout: 20000 });
        await settleVisibleImages();
        row.listSeasonLabels = await page.getByText('시즌 진행 중', { exact: true }).count();
        row.listHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
        if (stage === 'after' && (row.listSeasonLabels === 0 || row.listHorizontalOverflow)) row.verdict = 'FAIL';
      } catch {
        row.listVerdict = 'BLOCKED';
        if (stage === 'after') row.verdict = 'BLOCKED';
      }
      await page.screenshot({ path: `${output}/${stage}-list-${width}.png`, fullPage: true });
      report.widths.push(row);
    }
  } finally {
    await browser.close();
    report.browserClosed = true;
    await fs.writeFile(`${output}/${stage}-evidence.json`, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report));
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
