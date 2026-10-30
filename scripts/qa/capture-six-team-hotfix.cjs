const { createRequire } = require('node:module');
const fs = require('node:fs');
const path = require('node:path');
const requireQa = createRequire(path.join(process.env.TEAMEET_QA_MODULE_ROOT || process.cwd(), 'package.json'));
const { chromium } = requireQa('playwright');
const phase = process.argv[2];
if (!['before', 'after'].includes(phase)) throw new Error('Expected before or after');
const id = process.env.TOURNAMENT_ID;
if (!id) throw new Error('TOURNAMENT_ID required');
const output = path.resolve(process.env.QA_OUTPUT || `tmp/qa-six-team-hotfix/${phase}`);
const origin = 'https://alpha.teameet.co.kr';
const evidence = { phase, persona: 'anonymous public visitor', viewports: [], issues: [], assertions: [], cleanup: null };
(async () => {
  fs.mkdirSync(output, { recursive: true });
  const server = await chromium.launchServer({ headless: false });
  evidence.browserPid = server.process().pid;
  evidence.parentPid = process.pid;
  console.log(JSON.stringify({ browserPid: evidence.browserPid, parentPid: evidence.parentPid }));
  let browser;
  try {
    browser = await chromium.connect(server.wsEndpoint());
    const page = await browser.newPage();
    page.on('pageerror', error => evidence.issues.push({ kind: 'pageerror', message: error.message }));
    page.on('console', message => { if (message.type() === 'error') evidence.issues.push({ kind: 'console', message: message.text() }); });
    page.on('response', response => { if (response.status() >= 400) evidence.issues.push({ kind: 'http', status: response.status(), path: new URL(response.url()).pathname }); });
    const check = (name, pass, detail) => { evidence.assertions.push({ name, pass, detail }); if (phase === 'after' && !pass) throw new Error(name + ': ' + JSON.stringify(detail)); };
    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      const response = await page.goto(`${origin}/tournaments/${id}/bracket?tab=standings`, { waitUntil: 'domcontentloaded' });
      evidence.servedCommit = response.headers()['x-teameet-commit'];
      const region = page.getByRole('region', { name: '6강부터 결승까지 대진', exact: true });
      await region.waitFor({ timeout: 30000 });
      await page.waitForTimeout(700);
      const detailLinks = await region.getByRole('link', { name: '경기 상세', exact: true }).count();
      const knockoutTabs = await page.getByRole('tab', { name: '결선', exact: true }).count();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
      check(`bracket-${width}-no-detail-link`, detailLinks === 0, detailLinks);
      check(`bracket-${width}-no-phase-tab`, knockoutTabs === 0, knockoutTabs);
      check(`bracket-${width}-no-page-overflow`, !overflow, overflow);
      const logo = await region.getByRole('group').filter({ hasText: '부전승' }).evaluateAll(nodes => nodes.map(node => ({ text: node.textContent, background: getComputedStyle(node).backgroundColor, nameColor: node.querySelector('span.tm-text-caption-strong') ? getComputedStyle(node.querySelector('span.tm-text-caption-strong')).color : null, images: [...node.querySelectorAll('img')].map(img => ({ loaded: img.complete && img.naturalWidth > 0 })) })));
      const connectors = await region.evaluate(node => {
        const target = node.querySelector('[data-six-node="final"]');
        const rows = [...(target?.querySelectorAll('[data-bracket-team-row], [data-side]') ?? [])];
        return [...node.querySelectorAll('path[data-connection]')].map((edge, index) => {
          const rect = edge.ownerSVGElement.getBoundingClientRect();
          const point = edge.getPointAtLength(edge.getTotalLength());
          const row = rows[index]?.getBoundingClientRect();
          return { key: edge.dataset.connection, errorY: row ? Math.abs(rect.top + point.y - (row.top + row.height / 2)) : null };
        });
      });
      const selectionAlignment = await page.getByRole('region', { name: '결승 직행 선정', exact: true }).evaluate(node => {
        const title = node.querySelector('.tm-section-title .tm-text-body-lg');
        const description = node.querySelector('p.tm-text-label');
        return title && description ? Math.abs(title.getBoundingClientRect().left - description.getBoundingClientRect().left) : null;
      });
      if (phase === 'after') {
        check(`bracket-${width}-selected-bye-name-color`, logo.some(card => card.nameColor === 'rgb(27, 100, 218)'), logo.map(card => card.nameColor));
        check(`bracket-${width}-selection-left-alignment`, selectionAlignment !== null && selectionAlignment <= 1, selectionAlignment);
        check(`bracket-${width}-two-final-connectors`, connectors.length === 2, connectors);
        check(`bracket-${width}-aligned-final-connectors`, connectors.every(edge => edge.errorY !== null && edge.errorY <= 1), connectors);
        check(`bracket-${width}-selected-bye-background`, logo.some(card => card.background === 'rgb(232, 243, 255)'), logo.map(card => card.background));
      }
      await page.screenshot({ path: path.join(output, `bracket-${width}.png`), fullPage: true });
      await region.evaluate(node => { node.scrollLeft = node.scrollWidth; });
      await page.screenshot({ path: path.join(output, `bracket-final-${width}.png`), fullPage: true });
      await page.getByRole('tab', { name: '경기 일정', exact: true }).click();
      await page.waitForTimeout(700);
      const phaseTabs = await page.getByRole('tab', { name: '결선', exact: true }).count();
      check(`schedule-${width}-no-phase-tab`, phaseTabs === 0, phaseTabs);
      const nav = page.getByRole('navigation', { name: '일정 결선 단계 선택', exact: true });
      const filters = await nav.count() ? await nav.getByRole('button').allTextContents() : [];
      check(`schedule-${width}-round-filters`, JSON.stringify(filters) === JSON.stringify(['전체', '6강', '준결승', '결승']), filters);
      const filterCounts = [];
      if (phase === 'after') {
        const publicDataResponse = await page.request.get(`${origin}/api/v1/tournaments/${id}`);
        if (!publicDataResponse.ok()) throw new Error('Public tournament data unavailable');
        const rounds = (await publicDataResponse.json()).data?.sixTeamBracket?.rounds;
        if (!Array.isArray(rounds) || rounds.length !== 5) throw new Error('Expected five real six-team fixtures');
        const fixtureIds = ['전체', '6강', '준결승', '결승'].map((label, index) => ({ label, ids: index === 0 ? rounds : index === 1 ? rounds.slice(0, 3) : [rounds[index + 1]] }));
        for (const { label, ids } of fixtureIds) {
          await nav.getByRole('button', { name: label, exact: true }).click();
          await page.waitForFunction(({ id, expectedIds }) => {
            const visibleIds = new Set([...document.querySelectorAll('a[href]')].filter(anchor => anchor.getClientRects().length > 0 && new URL(anchor.href).pathname.startsWith(`/tournaments/${id}/matches/`)).map(anchor => new URL(anchor.href).pathname.split('/').at(-1)));
            return JSON.stringify([...visibleIds].sort()) === JSON.stringify([...expectedIds].sort());
          }, { id, expectedIds: ids }, { timeout: 10000 });
          const actualIds = await page.locator('a[href]').evaluateAll((anchors, id) => [...new Set(anchors.filter(anchor => anchor.getClientRects().length > 0 && new URL(anchor.href).pathname.startsWith(`/tournaments/${id}/matches/`)).map(anchor => new URL(anchor.href).pathname.split('/').at(-1)))], id);
          check(`schedule-${width}-${label}-fixtures`, JSON.stringify([...actualIds].sort()) === JSON.stringify([...ids].sort()), actualIds);
          filterCounts.push({ label, count: actualIds.length, fixtureIds: actualIds });
        }
        await nav.getByRole('button', { name: '전체', exact: true }).click();
        await page.waitForFunction(({ id }) => new Set([...document.querySelectorAll('a[href]')].filter(anchor => anchor.getClientRects().length > 0 && new URL(anchor.href).pathname.startsWith(`/tournaments/${id}/matches/`)).map(anchor => new URL(anchor.href).pathname)).size === 5, { id });
      }
      const scheduleOverflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
      check(`schedule-${width}-no-page-overflow`, !scheduleOverflow, scheduleOverflow);
      await page.screenshot({ path: path.join(output, `schedule-${width}.png`), fullPage: true });
      evidence.viewports.push({ width, bracket: { detailLinks, knockoutTabs, overflow, logo, connectors, selectionAlignment }, schedule: { phaseTabs, filters, filterCounts, overflow: scheduleOverflow }, verdict: phase === 'after' ? 'PASS' : 'BASELINE' });
    }
    if (phase === 'after') check('no-console-network-page-errors', evidence.issues.length === 0, evidence.issues);
  } finally {
    if (browser) await browser.close();
    await server.close();
    evidence.cleanup = 'Owned browser and context closed';
    fs.writeFileSync(path.join(output, 'evidence.json'), JSON.stringify(evidence, null, 2));
  }
  console.log(JSON.stringify({ phase, servedCommit: evidence.servedCommit, viewports: evidence.viewports.map(v => ({ width: v.width, verdict: v.verdict })), assertions: evidence.assertions.length, issues: evidence.issues.length, cleanup: evidence.cleanup }));
})().catch(error => { console.error(error.message); process.exitCode = 1; });
