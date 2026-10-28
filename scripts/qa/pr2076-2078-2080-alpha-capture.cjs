const { chromium } = require(process.platform === 'win32'
  ? 'D:/sm/matchup-sports/matchup-sports-platform/node_modules/.pnpm/playwright-core@1.58.2/node_modules/playwright-core'
  : '/mnt/d/sm/matchup-sports/matchup-sports-platform/node_modules/@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

(async () => {
  const phase = process.argv[2] || 'before';
  const out = path.resolve('docs/screenshots/pr2076-2078-2080');
  fs.mkdirSync(out, { recursive: true });
  const observations = [];
  const server = await chromium.launchServer({ headless: false, ...(process.platform === 'win32' ? { channel: 'chrome' } : {}) });
  console.log(JSON.stringify({ browserPid: server.process().pid, parentPid: process.pid }));
  const browser = await chromium.connect(server.wsEndpoint());
  try {
    for (const width of [390, 768, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 1000 } });
      try {
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push({ type: 'pageerror', message: error.message }));
        page.on('console', message => { if (message.type() === 'error') errors.push({ type: 'console', message: message.text() }); });
        page.on('response', response => { if (response.status() >= 400) errors.push({ type: 'network', status: response.status(), url: response.url() }); });
        const response = await page.goto('https://alpha.teameet.co.kr/tournaments/93a11ead-52ca-4262-bede-66802587c3d8/bracket?tab=standings', { waitUntil: 'domcontentloaded' });
        await page.getByRole('list', { name: '대회 진행 단계' }).waitFor({ timeout: 20000 });
        await page.screenshot({ path: path.join(out, `${phase}-groups-${width}.png`), fullPage: true });
        const groupNav = page.getByRole('navigation', { name: '조 선택', exact: true });
        const selectedGroup = await groupNav.count() ? await groupNav.getByRole('button').allTextContents() : [];
        const hasGroupFilter = selectedGroup.length > 1;
        const groupSelections = [];
        if (phase === 'after' && !hasGroupFilter) throw new Error('Expected deployed group selection controls');
        if (hasGroupFilter) {
          for (let index = 1; index < selectedGroup.length; index++) {
            const button = groupNav.getByRole('button').nth(index);
            await button.click();
            const region = page.getByRole('region', { name: `${selectedGroup[index]} 순위`, exact: true });
            await region.waitFor({ state: 'visible' });
            const pressed = await button.getAttribute('aria-pressed');
            if (pressed !== 'true') throw new Error(`Group filter did not select ${selectedGroup[index]}`);
            groupSelections.push({ name: selectedGroup[index], pressed });
            if (index === 1) await page.screenshot({ path: path.join(out, `${phase}-selected-group-${width}.png`), fullPage: true });
          }
          await groupNav.getByRole('button', { name: '전체', exact: true }).click();
          for (const name of selectedGroup.slice(1)) await page.getByRole('region', { name: `${name} 순위`, exact: true }).waitFor({ state: 'visible' });
        }
        const knockoutTab = page.getByRole('tab', { name: '결선', exact: true });
        if (await knockoutTab.count()) await knockoutTab.click();
        const knockoutNav = page.getByRole('navigation', { name: '결선 단계 선택', exact: true });
        const choices = await knockoutNav.count() ? await knockoutNav.getByRole('button').allTextContents() : [];
        if (phase === 'after' && choices.length < 2) throw new Error('Expected deployed knockout stage controls');
        if (phase === 'after') await page.screenshot({ path: path.join(out, `${phase}-knockout-all-${width}.png`), fullPage: true });
        const selected = [];
        for (let i = 1; i < choices.length; i++) {
          const button = knockoutNav.getByRole('button').nth(i);
          await button.click();
          const pressed = await button.getAttribute('aria-pressed');
          if (pressed !== 'true') throw new Error(`Knockout filter did not select ${choices[i]}`);
          selected.push({ name: choices[i], pressed });
        }
        await page.screenshot({ path: path.join(out, `${phase}-knockout-${width}.png`), fullPage: true });
        let restoredAll = null;
        if (choices.length > 1) {
          const allButton = knockoutNav.getByRole('button', { name: '전체', exact: true });
          await allButton.click();
          restoredAll = await allButton.getAttribute('aria-pressed') === 'true';
          if (!restoredAll) throw new Error('Knockout all selection did not restore');
        }
        const roundLabels = await page.locator('.tm-bk2-pill').allTextContents();
        if (phase === 'after' && choices.slice(1).some(name => !roundLabels.includes(name))) throw new Error('A knockout stage is missing after restoring all');
        observations.push({ width, status: response.status(), url: page.url(), selectedGroup, groupSelections, choices, selected, restoredAll, roundLabels, errors, horizontalOverflow: await page.evaluate(() => document.documentElement.scrollWidth > innerWidth) });
      } catch (error) {
        observations.push({ width, failure: error.message });
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
    await server.close();
    fs.writeFileSync(path.join(out, `${phase}-observations.json`), JSON.stringify({ observations, cleanup: 'owned headed browser closed' }, null, 2));
  }
  console.log(JSON.stringify(observations));
  if (observations.some(row => row.failure || row.horizontalOverflow || row.errors?.length)) process.exitCode = 1;
})().catch(error => { console.error(error.message); process.exitCode = 1; });
