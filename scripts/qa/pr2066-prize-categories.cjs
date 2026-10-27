/**
 * Headed alpha evidence. No local Next server and no database mutations.
 * node scripts/qa/pr2066-prize-categories.cjs before|after|focus <tournament-id> [output-dir]
 * PR2066_PLAYWRIGHT_MODULE_PATH: optional installed module path for cross-OS runners.
 * ALPHA_BROWSER_CHANNEL: optional installed headed browser channel, e.g. msedge.
 * ALPHA_STORAGE_STATE_PATH: optional private Playwright login state; never commit it.
 * ALPHA_EXPECTED_COMMIT: optional exact serving SHA verified before capture.
 */
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PR2066_PLAYWRIGHT_MODULE_PATH || 'playwright');
const [phase, id, requestedOutput] = process.argv.slice(2);
if (!['before', 'after', 'focus'].includes(phase) || !/^[a-f0-9-]{36}$/i.test(id || '')) {
  throw new Error('usage: before|after|focus <tournament-id> [output-dir]');
}
const output = requestedOutput || path.join('docs', 'visual-qa', `pr2066-alpha-${phase}`);
const root = 'https://alpha.teameet.co.kr';
const observations = [];
let browser, server, lifecycle;
function options(width) {
  return { viewport: { width, height: 1000 }, ...(process.env.ALPHA_STORAGE_STATE_PATH ? { storageState: process.env.ALPHA_STORAGE_STATE_PATH } : {}) };
}
(async () => {
  fs.mkdirSync(output, { recursive: true });
  try {
    server = await chromium.launchServer({ headless: false, ...(process.env.ALPHA_BROWSER_CHANNEL ? { channel: process.env.ALPHA_BROWSER_CHANNEL } : {}) });
    lifecycle = { browserPid: server.process().pid, parentPid: process.pid, headed: true, phase };
    fs.writeFileSync(path.join(output, 'lifecycle.json'), JSON.stringify(lifecycle, null, 2));
    console.log(JSON.stringify(lifecycle));
    browser = await chromium.connect(server.wsEndpoint());
    const routes = [['detail', `/tournaments/${id}`], ...(phase === 'focus' ? [] : [['awards', `/tournaments/${id}/awards`]])];
    for (const [label, route] of routes) {
      for (const width of [390, 768, 1440]) {
        const context = await browser.newContext(options(width));
        try {
          const page = await context.newPage();
          const pageErrors = [], consoleErrors = [], failures = [];
          page.on('pageerror', error => pageErrors.push(error.message));
          page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
          page.on('response', response => { if (response.status() >= 400) failures.push({ status: response.status(), path: new URL(response.url()).pathname }); });
          const response = await page.goto(root + route, { waitUntil: 'domcontentloaded' });
          await page.locator('h1,h2').first().waitFor({ state: 'visible', timeout: 30000 });
          await page.waitForTimeout(1800);
          if (phase === 'focus') {
            await page.getByRole('region', { name: '상품 및 상금 안내' }).scrollIntoViewIfNeeded();
            await page.waitForTimeout(300);
          }
          const release = response.headers()['x-teameet-commit'];
          const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
          const sections = await page.locator('section[aria-label]').evaluateAll(nodes => nodes.map(node => node.getAttribute('aria-label')));
          // Anonymous /auth/me 401 already exists in the before baseline; retain it as raw evidence.
          const unexpectedFailures = failures.filter(failure => !(failure.status === 401 && failure.path === '/api/v1/auth/me' && !process.env.ALPHA_STORAGE_STATE_PATH));
          const unexpectedConsoleErrors = consoleErrors.filter(message => !(failures.some(failure => failure.path === '/api/v1/auth/me' && failure.status === 401) && /Failed to load resource.*401/.test(message) && !process.env.ALPHA_STORAGE_STATE_PATH));
          const verdict = response.status() === 200 && !overflow && !pageErrors.length && !unexpectedFailures.length && !unexpectedConsoleErrors.length && (!process.env.ALPHA_EXPECTED_COMMIT || release === process.env.ALPHA_EXPECTED_COMMIT) ? 'PASS' : 'FAIL';
          const observation = { route, width, phase, status: response.status(), release, sections, overflow, pageErrors, consoleErrors, failures, unexpectedFailures, unexpectedConsoleErrors, verdict, screenshot: `${label}-${width}.png` };
          await page.screenshot({ path: path.join(output, observation.screenshot), fullPage: true });
          observations.push(observation);
          console.log(JSON.stringify(observation));
        } finally { await context.close(); }
      }
    }
    for (const width of phase === 'focus' ? [] : [390, 768, 1440]) {
      const context = await browser.newContext(options(width));
      try {
        const page = await context.newPage();
        await page.goto(`${root}/admin/tournaments/${id}/info`, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => location.pathname === '/login' || document.querySelector('[aria-label="상금·시상 정보"]'), undefined, { timeout: 30000 });
        const authenticated = await page.getByRole('region', { name: '상금·시상 정보' }).count();
        const regions = authenticated ? await page.locator('section[aria-label$="시상 입력"]').count() : 0;
        const verdict = !authenticated ? 'BLOCKED' : regions === 3 ? 'PASS' : 'FAIL';
        await page.screenshot({ path: path.join(output, `admin-${width}.png`), fullPage: true });
        observations.push({ route: `/admin/tournaments/${id}/info`, width, phase, actualPath: new URL(page.url()).pathname, authenticated: Boolean(authenticated), categoryRegions: regions, verdict, ...(verdict === 'BLOCKED' ? { reason: 'No private alpha login state is available on this host.' } : {}), screenshot: `admin-${width}.png` });
      } finally { await context.close(); }
    }
  } finally {
    if (browser) await browser.close();
    if (server) await server.close();
    if (lifecycle) fs.writeFileSync(path.join(output, 'lifecycle.json'), JSON.stringify({ ...lifecycle, closed: true }, null, 2));
    fs.writeFileSync(path.join(output, 'observations.json'), JSON.stringify(observations, null, 2));
    console.log('Owned browser tree closed');
  }
  const summary = { passed: observations.filter(row => row.verdict === 'PASS').length, failed: observations.filter(row => row.verdict === 'FAIL').length, blocked: observations.filter(row => row.verdict === 'BLOCKED').length };
  console.log(JSON.stringify(summary));
  // An auth wall is not evidence that the editor passed.
  process.exitCode = summary.failed ? 1 : summary.blocked ? 2 : 0;
})().catch(error => { console.error(error.message); process.exitCode = 1; });
