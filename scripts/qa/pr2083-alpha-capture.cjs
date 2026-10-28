const { chromium } = require('D:/sm/matchup-sports/matchup-sports-platform/node_modules/.pnpm/playwright-core@1.58.2/node_modules/playwright-core');
const fs = require('node:fs');
const path = require('node:path');
const id = '93a11ead-52ca-4262-bede-66802587c3d8';
const route = `/tournaments/${id}/bracket`;
const origin = 'https://alpha.teameet.co.kr';
const phase = process.argv[2] || 'before';
const out = path.resolve('docs/screenshots/pr2083');
fs.mkdirSync(out, { recursive: true });
(async () => {
  const observations = [];
  const server = await chromium.launchServer({ headless: false, channel: 'chrome' });
  console.log(JSON.stringify({ browserPid: server.process().pid, parentPid: process.pid }));
  const browser = await chromium.connect(server.wsEndpoint());
  try {
    const api = await browser.newContext();
    const response = await api.request.get(`${origin}/api/v1/tournaments/${id}/schedule`);
    const payload = await response.json();
    const schedule = payload.data;
    if (!response.ok() || !schedule?.items) throw new Error('Schedule API unavailable');
    const entries = [...schedule.items, ...schedule.unscheduled];
    const expectedGroupIds = [...new Set(entries.filter(e => e.round.startsWith('조별') || e.round === 'group' || e.round.startsWith('league_r')).map(e => e.groupId))];
    await api.close();
    for (const width of [390, 768, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 1000 } });
      try {
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
        page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
        await page.goto(`${origin}${route}`, { waitUntil: 'domcontentloaded' });
        const tabs = page.getByRole('tablist', { name: '경기 일정 보기' });
        await tabs.waitFor({ timeout: 30000 });
        const ids = () => page.locator(`a[href^="/tournaments/${id}/matches/"]`).evaluateAll(links => links.map(a => new URL(a.href).pathname.split('/').at(-1)).sort());
        const allIds = await ids();
        const selections = [];
        for (const [key, label, navLabel] of [['group_stage', '조별리그', '일정 조 선택'], ['knockout', '결선', '일정 결선 단계 선택']]) {
          await tabs.getByRole('tab', { name: label, exact: true }).click();
          const nav = page.getByRole('navigation', { name: navLabel, exact: true });
          const choices = await nav.count() ? await nav.getByRole('button').allTextContents() : [];
          await page.screenshot({ path: path.join(out, `${phase}-${key}-${width}.png`), fullPage: true });
          if (phase === 'after') {
            if (choices.length < 2) throw new Error(`Missing ${navLabel}`);
            if (key === 'group_stage' && choices.length !== expectedGroupIds.length + 1) throw new Error('Group filter options incomplete');
            const phaseIds = await ids();
            const union = new Set();
            for (let i = 1; i < choices.length; i++) {
              const button = nav.getByRole('button').nth(i);
              await button.click();
              const selectedIds = await ids();
              if (await button.getAttribute('aria-pressed') !== 'true' || selectedIds.length === 0) throw new Error(`Filter failed ${choices[i]}`);
              if (selectedIds.length >= phaseIds.length && choices.length > 2) throw new Error(`Filter did not narrow ${choices[i]}`);
              selectedIds.forEach(id => union.add(id));
              selections.push({ phase: key, name: choices[i], fixtureIds: selectedIds });
              if (i === 1) await page.screenshot({ path: path.join(out, `${phase}-${key}-selected-${width}.png`), fullPage: true });
              const link = new URL(await page.locator(`a[href^="/tournaments/${id}/matches/"]`).first().getAttribute('href'), origin);
              const from = new URL(link.searchParams.get('from'), origin);
              if (!from.searchParams.get('scheduleGroup')) throw new Error('Missing subgroup in match return URL');
            }
            if (JSON.stringify([...union].sort()) !== JSON.stringify(phaseIds)) throw new Error('Subfilters do not cover every match');
            // Reload the last selection to prove URL hydration, then restore all.
            const selectedBefore = await ids();
            await page.reload({ waitUntil: 'domcontentloaded' });
            await page.getByRole('navigation', { name: navLabel }).waitFor();
            if (JSON.stringify(await ids()) !== JSON.stringify(selectedBefore)) throw new Error('Selection lost after reload');
            await page.getByRole('navigation', { name: navLabel }).getByRole('button', { name: '전체', exact: true }).click();
            if (JSON.stringify(await ids()) !== JSON.stringify(phaseIds)) throw new Error('Phase all did not restore');
          }
        }
        await tabs.getByRole('tab', { name: '전체', exact: true }).click();
        if (JSON.stringify(await ids()) !== JSON.stringify(allIds)) throw new Error('All schedule did not restore');
        const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
        observations.push({ width, allIds, selections, errors, horizontalOverflow, verdict: errors.length || horizontalOverflow ? 'FAIL' : 'PASS' });
      } catch (error) { observations.push({ width, failure: error.message, verdict: 'FAIL' }); }
      finally { await context.close(); }
    }
  } finally {
    await browser.close();
    await server.close();
    fs.writeFileSync(path.join(out, `${phase}-observations.json`), JSON.stringify({ observations, cleanup: 'owned headed browser closed' }, null, 2));
  }
  console.log(JSON.stringify(observations));
  if (observations.some(row => row.verdict !== 'PASS')) process.exitCode = 1;
})().catch(error => { console.error(error.message); process.exitCode = 1; });
