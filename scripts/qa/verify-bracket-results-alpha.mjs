// Headed, read-only alpha QA. Supply ALPHA_BRACKET_ID, ALPHA_RESULTS_ID and ALPHA_EXPECTED_COMMIT.
// PLAYWRIGHT_MODULE may point to an existing installation; no local web server is started.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '@playwright/test');
const root = fileURLToPath(new URL('../../', import.meta.url));
const expected = process.env.ALPHA_EXPECTED_COMMIT;
assert.match(expected ?? '', /^[a-f0-9]{40}$/);
const bracketId = process.env.ALPHA_BRACKET_ID, resultsId = process.env.ALPHA_RESULTS_ID;
assert.match(bracketId ?? '', /^[a-f0-9-]{36}$/);
assert.match(resultsId ?? '', /^[a-f0-9-]{36}$/);
const output = resolve(root, process.env.ALPHA_QA_OUTPUT || 'docs/screenshots/bracket-results-followup-20261106');
await mkdir(output, { recursive: true });
const evidence = { expected, persona: 'public anonymous', viewports: [], cleanup: false, adminVerified: false };
let server, browser;
try {
  server = await chromium.launchServer({ headless: false, args: ['--no-sandbox'] });
  evidence.process = { browserPid: server.process().pid, parentPid: process.pid };
  browser = await chromium.connect(server.wsEndpoint());
  for (const width of [390, 768, 1440]) {
    for (const [kind, path] of [
      ['results', `/tournaments/${resultsId}/results`],
      ['bracket', `/tournaments/${bracketId}/bracket?schedulePhase=knockout`],
    ]) {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      const page = await context.newPage();
      const errors = [], failedResponses = [], abortedRequests = [];
      let closing = false;
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', message => { if (message.type() === 'error') errors.push({ message: message.text(), location: message.location() }); });
      page.on('response', response => {
        if (response.status() >= 400) failedResponses.push({ path: new URL(response.url()).pathname, status: response.status() });
      });
      page.on('requestfailed', request => {
        if (closing) return;
        const failure = `${new URL(request.url()).pathname}: ${request.failure()?.errorText}`;
        if (request.failure()?.errorText === 'net::ERR_ABORTED') abortedRequests.push(failure);
        else errors.push(failure);
      });
      const response = await page.goto(`https://alpha.teameet.co.kr${path}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      assert.equal(response.status(), 200);
      const serving = response.headers()['x-teameet-commit'];
      assert.match(serving ?? '', /^[a-f0-9]{40}$/);
      if (serving !== expected) execFileSync('git', ['merge-base', '--is-ancestor', expected, serving], { cwd: root });
      const result = { kind, width, serving, screenshots: [], errors, failedResponses, abortedRequests };
      if (kind === 'results') {
        const first = page.getByRole('region', { name: '프리미어 결과', exact: true });
        await first.waitFor({ state: 'visible', timeout: 20000 });
        await page.getByRole('region', { name: '챌린지 결과', exact: true }).waitFor({ state: 'visible' });
        result.columns = await first.evaluate(element => getComputedStyle(element.parentElement).gridTemplateColumns.split(/\s+/).length);
        assert.equal(result.columns, width >= 1024 ? 2 : 1);
        assert.ok(await page.locator('.tm-resd-hero').count() >= 2);
        assert.ok(await page.getByText('12강', { exact: true }).count() > 0);
        for (const track of ['프리미어', '챌린지']) {
          const ranking = page.getByRole('region', { name: `${track} 순위`, exact: true });
          await ranking.waitFor({ state: 'visible' });
          assert.ok((await ranking.innerText()).includes('득점') || (await ranking.innerText()).includes('GF'));
          assert.ok(await page.getByRole('region', { name: `${track} 경기`, exact: true }).getByRole('link').count() > 0);
        }
      } else {
        const stages = page.getByRole('navigation', { name: '일정 결선 단계 선택', exact: true });
        await stages.waitFor({ state: 'visible', timeout: 20000 });
        assert.equal(await page.getByText('일정 토너먼트 선택', { exact: true }).count(), 0);
        assert.equal(await page.getByText('일정 결선 단계 선택', { exact: true }).count(), 0);
        assert.ok(await stages.getByRole('button', { name: '12강', exact: true }).count() > 0);
        assert.equal(await stages.getByRole('button', { name: '16강', exact: true }).count(), 0);
      }
      // Allow existing champion entrance animations to finish before capturing pixels.
      if (kind === 'results') await page.waitForTimeout(2200);
      const screenshot = `after-${kind}-${width}.png`;
      await page.screenshot({ path: resolve(output, screenshot), fullPage: true, animations: 'disabled' });
      result.screenshots.push(screenshot);
      if (kind === 'bracket') {
        await page.getByRole('tab', { name: '순위 · 대진표', exact: true }).click();
        const phase = page.getByRole('tab', { name: '조별리그', exact: true });
        await phase.waitFor({ state: 'visible' });
        await phase.click();
        await page.getByRole('table').first().waitFor({ state: 'visible' });
        const toggles = page.locator('table button[aria-expanded]');
        const tones = {};
        for (let i = 0; i < Math.min(await toggles.count(), 12); i++) {
          await toggles.nth(i).click();
          const rows = await page.locator('li span.tab-num').evaluateAll(elements => elements.filter(e => /^[승무패]\s/.test(e.textContent.trim())).map(e => ({
            outcome: e.textContent.trim()[0], color: getComputedStyle(e).color, background: getComputedStyle(e.closest('li')).backgroundColor,
            colorToken: e.style.color, backgroundToken: e.closest('li').style.background,
          })));
          for (const row of rows) {
            const expectedTokens = row.outcome === '승' ? ['var(--blue700)', 'var(--blue50)'] : row.outcome === '패' ? ['var(--red700)', 'var(--red50)'] : ['var(--text-body)', 'var(--surface-soft)'];
            assert.equal(row.colorToken, expectedTokens[0]);
            assert.equal(row.backgroundToken, expectedTokens[1]);
            tones[row.outcome] = row;
          }
          if (Object.keys(tones).length === 3) break;
        }
        result.tones = tones;
        result.toneCoverage = `${Object.keys(tones).length}/3`;
        assert.ok(Object.keys(tones).length > 0);
        const expanded = `after-standings-${width}.png`;
        await page.screenshot({ path: resolve(output, expanded), fullPage: true, animations: 'disabled' });
        result.screenshots.push(expanded);
      }
      result.overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
      evidence.viewports.push(result);
      assert.equal(result.overflow, false);
      result.resourceVerdict = errors.length || failedResponses.length ? 'errors recorded; inspect evidence' : 'PASS';
      assert.equal(errors.filter(error => typeof error === 'string' || !error.location?.url?.includes('/_next/image?')).length, 0);
      assert.equal(failedResponses.filter(response => response.path !== '/_next/image').length, 0);
      closing = true;
      await context.close();
    }
  }
} catch (error) {
  evidence.blocker = error.message;
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  if (server) await server.close();
  evidence.cleanup = true;
  evidence.resourceVerdict = evidence.viewports.some(viewport => viewport.errors.length || viewport.failedResponses.length) ? 'FAIL: resource errors recorded' : 'PASS';
  if (evidence.resourceVerdict !== 'PASS') process.exitCode = 1;
  await writeFile(resolve(output, 'after-evidence.json'), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence));
}
