const { chromium } = require('playwright');
const { mkdirSync, writeFileSync } = require('node:fs');
const { execFileSync } = require('node:child_process');
const assert = require('node:assert/strict');
const path = require('node:path');

const phase = process.argv[2];
assert(['before', 'after'].includes(phase));
const expectedReleaseSha = process.argv[3];
if (phase === 'after') assert.match(expectedReleaseSha ?? '', /^[0-9a-f]{40}$/);
const leagueId = 'aef0d98f-17eb-4590-b27d-a2d8bab765e6';
const listPath = '/tournaments?kind=league';
const expectedPath = `${phase === 'before' ? '/league-matches' : '/tournaments'}/${leagueId}`;
const output = path.resolve('docs/screenshots/task20261080-league-detail-entry');
mkdirSync(output, { recursive: true });

async function settleVisibleContent(page) {
  await page.locator('.tm-route-progress').waitFor({ state: 'hidden' });
  await page.evaluate(async () => { await document.fonts.ready; });
  await page.waitForFunction(() => [...document.images].every(image => {
    const rect = image.getBoundingClientRect();
    const visible = rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < innerHeight;
    return !visible || image.complete;
  }));
}

(async () => {
  const browser = await chromium.launch({ headless: false });
  const results = [];
  try {
    const rows = execFileSync('ps', ['-eo', 'pid,ppid,comm'], { encoding: 'utf8' }).split('\n');
    const owned = new Set([process.pid]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const row of rows) {
        const m = row.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/);
        if (m && owned.has(Number(m[2])) && !owned.has(Number(m[1]))) {
          owned.add(Number(m[1]));
          changed = true;
        }
      }
    }
    const processEvidence = rows.filter(row => owned.has(Number(row.trim().split(/\s+/)[0])));
    writeFileSync(path.join(output, `${phase}-processes.txt`), processEvidence.join('\n'));
    console.log('Owned Node/browser PID/PPID:', processEvidence.join('; '));
    for (const width of [390, 768, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      const page = await context.newPage();
      const consoleErrors = [];
      const pageErrors = [];
      const failedRequests = [];
      const expectedGuestAuthProbes = [];
      const networkChecks = [];
      page.on('console', message => {
        if (message.type() === 'error') consoleErrors.push({ text: message.text(), url: message.location().url });
      });
      page.on('pageerror', error => pageErrors.push(error.message));
      page.on('response', response => {
        if (response.url().includes('/api/v1/') && response.status() >= 400) {
          networkChecks.push((async () => {
            const failure = { url: response.url().split('?')[0], status: response.status() };
            // api-client.ts의 isExpectedGuestAuthProbe와 같은 정확한 비로그인 계약만 따로 기록한다.
            if (response.request().method() === 'GET' && new URL(response.url()).pathname === '/api/v1/auth/me' && response.status() === 401) {
              const body = await response.json();
              if (body.code === 'UNAUTHENTICATED') {
                expectedGuestAuthProbes.push({ ...failure, code: body.code });
                return;
              }
            }
            failedRequests.push(failure);
          })());
        }
      });
      try {
        const response = await page.goto(`https://alpha.teameet.co.kr${listPath}`, { waitUntil: 'domcontentloaded' });
        assert.equal(response.status(), 200);
        const headers = await response.allHeaders();
        if (expectedReleaseSha) assert.equal(headers['x-teameet-commit'], expectedReleaseSha);
        const card = page.locator(`a[href*="${leagueId}"]`).first();
        await card.waitFor();
        const href = await card.getAttribute('href');
        const destination = new URL(href, page.url());
        assert.equal(destination.pathname, expectedPath);
        assert.equal(destination.searchParams.get('from'), listPath);
        await card.scrollIntoViewIfNeeded();
        await settleVisibleContent(page);
        await page.screenshot({ path: path.join(output, `${phase}-list-${width}.png`) });
        await card.click();
        await page.waitForURL(url => url.pathname === expectedPath);
        await page.getByRole('heading', { name: '(테스트) 9.16', exact: true }).first().waitFor();
        const detailUrl = page.url();
        assert.equal(new URL(detailUrl).searchParams.get('from'), listPath);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
        await settleVisibleContent(page);
        await page.screenshot({ path: path.join(output, `${phase}-detail-${width}.png`) });
        const back = page.getByRole('link', { name: '뒤로가기', exact: true }).first();
        await back.waitFor();
        const backUrl = new URL(await back.getAttribute('href'), page.url());
        assert.equal(`${backUrl.pathname}${backUrl.search}`, listPath);
        await back.click();
        await page.waitForURL(url => url.pathname === '/tournaments' && url.searchParams.get('kind') === 'league');
        await page.locator(`a[href*="${leagueId}"]`).first().waitFor();
        await Promise.all(networkChecks);
        const unexpectedConsoleErrors = consoleErrors.filter(error => !(
          expectedGuestAuthProbes.some(probe => probe.url === error.url)
          && /^Failed to load resource:.*\b401\b/.test(error.text)
        ));
        results.push({ width, href, detailUrl, returnedUrl: page.url(), releaseSha: headers['x-teameet-commit'] ?? null, overflow, consoleErrors, unexpectedConsoleErrors, pageErrors, failedRequests, expectedGuestAuthProbes });
        assert.equal(overflow, false);
        assert.deepEqual(pageErrors, []);
        assert.deepEqual(failedRequests, []);
        assert.deepEqual(unexpectedConsoleErrors, []);
        console.log(JSON.stringify(results.at(-1)));
      } finally { await context.close(); }
    }
  } finally {
    await browser.close();
    writeFileSync(path.join(output, `${phase}-results.json`), JSON.stringify(results, null, 2));
    console.log('Owned headed browser closed.');
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
