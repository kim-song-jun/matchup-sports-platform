/* Headed alpha-only QA. Uses a separate, owned browser/context and never authenticates a real user. */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_CORE_MODULE || 'playwright');

const mode = process.argv[2];
assert(['before', 'after'].includes(mode), 'Pass before or after');
const origin = 'https://alpha.teameet.co.kr';
const demo = '/tournament-ops-demo';
const output = path.resolve('docs/screenshots/tournament-admin-demo-20261105');
const sections = ['overview', 'info', 'registrations', 'bracket', 'announcements', 'sponsors', 'popups', 'campaign', 'reviews', 'awards', 'statistics', 'staff', 'operations'];
const report = { mode, origin, persona: 'anonymous sample operator', pid: null, ppid: process.pid, screenshots: [], apiRequests: [], errors: [], verdicts: [], cleanup: false };
fs.mkdirSync(output, { recursive: true });

async function runFlow(page) {
  await page.getByRole('navigation', { name: '대회 관리 섹션' }).getByRole('link', { name: '대회 정보', exact: true }).click();
  await page.getByRole('button', { name: '대회 정보 수정', exact: true }).click();
  await page.getByRole('dialog').getByLabel(/^대회명/).fill('파트너컵 운영 체험');
  await page.getByRole('dialog').getByRole('button', { name: '저장', exact: true }).click();
  await page.getByRole('heading', { name: '파트너컵 운영 체험', exact: true }).waitFor();
  await page.getByRole('navigation', { name: '대회 관리 섹션' }).getByRole('link', { name: /^신청 관리/ }).click();
  for (const name of ['블루 FC', '오렌지 FS', '그린 FC', '화이트 FS']) {
    const team = page.getByText(name, { exact: true });
    const card = team.locator('xpath=ancestor::li[1]');
    await card.getByRole('button', { name: '확정', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: '확정', exact: true }).click();
    await card.getByRole('button', { name: '확정', exact: true }).waitFor({ state: 'detached' });
  }
  await page.getByRole('navigation', { name: '대회 관리 섹션' }).getByRole('link', { name: /^대진 관리/ }).click();
  await page.getByRole('button', { name: '템플릿으로 시작', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: '다음', exact: true }).click();
  await dialog.getByRole('button', { name: '다음', exact: true }).click();
  await dialog.getByLabel('확정 참가팀을 지금 배정하기').check();
  await dialog.getByRole('button', { name: '참가팀 무작위 배정', exact: true }).click();
  await dialog.getByRole('button', { name: '다음', exact: true }).click();
  await dialog.getByText('총 3경기 · 참가 4팀 · 부전승 0팀', { exact: true }).waitFor();
  await dialog.getByRole('button', { name: '이 설정으로 대진 만들기', exact: true }).click();
  await dialog.waitFor({ state: 'detached' });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('navigation', { name: '대회 관리 섹션' }).getByRole('link', { name: '대진 관리 3' }).waitFor();
  await page.getByRole('button', { name: /1번 경기 열기$/ }).click();
  const panel = page.getByRole('complementary', { name: '칸 상세' });
  const scores = panel.getByLabel(/ 점수$/);
  await scores.nth(0).fill('2'); await scores.nth(1).fill('1');
  await panel.getByRole('button', { name: '점수 확정', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '점수 확정', exact: true }).click();
  await page.getByText('점수를 확정했어요.', { exact: true }).waitFor();
  await page.screenshot({ path: path.join(output, 'after-quick-result-1440.png'), fullPage: true });
  report.screenshots.push('after-quick-result-1440.png');
  await panel.getByRole('button', { name: '패널 닫기' }).click();
  report.verdicts.push({ flow: 'confirm four teams, generate and assign bracket, reload, confirm score through actual editor', verdict: 'PASS' });
}

(async () => {
  const server = await chromium.launchServer({ headless: false, executablePath: process.env.QA_BROWSER_EXECUTABLE });
  report.pid = server.process().pid;
  console.log(JSON.stringify({ ownedBrowserPid: report.pid, parentPid: process.pid }));
  let browser;
  try {
    browser = await chromium.connect(server.wsEndpoint());
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    page.on('pageerror', (e) => report.errors.push({ type: 'pageerror', message: e.message }));
    page.on('console', (e) => { if (e.type() === 'error') report.errors.push({ type: 'console', message: e.text() }); });
    page.on('response', (r) => {
      const url = new URL(r.url());
      if (url.origin === origin && r.status() >= 400) report.errors.push({ type: 'network', status: r.status(), path: url.pathname });
    });
    page.on('request', (r) => {
      const url = new URL(r.url());
      if (url.origin === origin && url.pathname.startsWith('/api/')) report.apiRequests.push({ method: r.method(), path: url.pathname });
    });
    const initial = await page.goto(origin + demo, { waitUntil: 'domcontentloaded' });
    await page.locator('h1').waitFor();
    report.deployedCommit = initial.headers()['x-teameet-commit'] ?? null;
    if (process.env.QA_EXPECTED_COMMIT) assert.equal(report.deployedCommit, process.env.QA_EXPECTED_COMMIT, 'Unexpected deployed commit');
    if (mode === 'after') {
      assert.equal(await page.getByRole('navigation', { name: '대회 관리 섹션' }).getByRole('link').count(), 11);
      await runFlow(page);
    }
    for (const width of [1440, 768, 390]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
      for (const section of mode === 'before' ? ['entry'] : sections) {
        const route = section === 'entry' ? demo : `${demo}/${section}`;
        await page.goto(origin + route, { waitUntil: 'domcontentloaded' });
        await page.locator('h1').first().waitFor();
        if (mode === 'after') await page.getByRole('region', { name: '대회 관리 내용' }).waitFor();
        if (mode === 'after' && section === 'popups') {
          assert.equal(await page.locator('iframe').count(), 0, 'Demo embedded a real service document');
          await page.getByRole('status').filter({ hasText: '실제 서비스로 연결되는 이 화면은 체험에서 열 수 없어요.' }).waitFor();
        }
        await page.evaluate(() => Promise.race([document.fonts.ready, new Promise(resolve => setTimeout(resolve, 5000))]));
        const file = `${mode}-${section}-${width}.png`;
        await page.screenshot({ path: path.join(output, file), fullPage: true });
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
        report.screenshots.push(file);
        report.verdicts.push({ route, width, overflow, verdict: overflow ? 'FAIL' : 'PASS' });
      }
    }
    if (mode === 'after') {
      await page.getByRole('button', { name: '체험 초기화', exact: true }).click();
      await page.getByRole('dialog').getByRole('button', { name: '체험 초기화', exact: true }).click();
      await page.getByRole('heading', { name: 'Teameet 파트너컵 · 샘플', exact: true }).waitFor();
      await page.getByRole('navigation', { name: '대회 관리 섹션' }).getByRole('link', { name: '대진 관리 0', exact: true }).waitFor();
      report.verdicts.push({ flow: 'healthy sample reset restores default title and empty bracket', verdict: 'PASS' });
      await page.evaluate(() => {
        sessionStorage.setItem('qa-pr2168-unrelated', 'preserve');
        sessionStorage.setItem('teameet.tournament-admin-demo.v2', '{broken');
      });
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.getByRole('alert').filter({ hasText: '체험 기록을 읽거나 저장하지 못했어요' }).waitFor();
      assert.equal(await page.getByRole('navigation', { name: '대회 관리 섹션' }).count(), 0);
      await page.getByRole('button', { name: '체험 초기화', exact: true }).click();
      await page.getByRole('dialog').getByRole('button', { name: '체험 초기화', exact: true }).click();
      await page.getByRole('heading', { name: 'Teameet 파트너컵 · 샘플', exact: true }).waitFor();
      assert.equal(await page.evaluate(() => sessionStorage.getItem('qa-pr2168-unrelated')), 'preserve');
      report.verdicts.push({ flow: 'corrupt history blocks management and reset preserves unrelated storage', verdict: 'PASS' });
      await page.evaluate(() => {
        Object.defineProperty(navigator.clipboard, 'writeText', { configurable: true, value: async () => { throw new Error('QA clipboard denied'); } });
      });
      await page.getByRole('button', { name: '공유 링크 복사', exact: true }).click();
      await page.getByRole('alert').filter({ hasText: '직접 선택해 복사' }).waitFor();
      await page.getByText('체험 안내와 공유 주소', { exact: true }).click();
      assert.equal(await page.getByLabel('공유할 체험 주소').inputValue(), origin + demo);
      report.verdicts.push({ flow: 'clipboard failure exposes a directly copyable share URL', verdict: 'PASS' });
      await page.evaluate(() => sessionStorage.removeItem('qa-pr2168-unrelated'));
    }
    assert(!report.apiRequests.some((r) => /sample-partner-cup|sample-registration|sample-fixture|sample-game/.test(r.path)), 'Sample reached a live API');
    if (mode === 'after') assert(report.apiRequests.every((r) => r.method === 'GET' && r.path === '/api/v1/health'), 'Demo reached an account or entity API');
    assert(!report.errors.some((e) => e.type === 'pageerror'), 'Runtime page error');
    assert.equal(report.errors.length, 0, 'Console or network errors');
    assert(report.verdicts.every((v) => v.verdict === 'PASS'), 'Viewport overflow');
    await context.close();
  } catch (e) {
    report.failure = e.message;
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
    await server.close();
    report.cleanup = true;
    fs.writeFileSync(path.join(output, `${mode}-report.json`), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ mode, screenshots: report.screenshots.length, failure: report.failure ?? null, cleanup: true }));
  }
})();
