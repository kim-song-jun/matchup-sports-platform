// alpha(프로덕션 모드) 어드민 에러 로그 화면 3폭 캡처.
// 헤더 dev 인증은 프로덕션 게이트로 막혀 있어 세션 쿠키를 주입한다.
// Run: ALPHA_SESSION_TOKEN=... node scripts/capture_alpha_error_logs.js
const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const BASE = 'https://alpha.teameet.co.kr';
const TOKEN = (process.env.ALPHA_SESSION_TOKEN || '').trim();
const OUT = path.resolve(__dirname, '../docs/visual-qa/alpha-error-logs');
const HIDE = 'nextjs-portal,[data-nextjs-dev-tools-button],#__next-dev-tools-indicator,[data-nextjs-toast]{display:none!important}';

if (!TOKEN) {
  console.error('ALPHA_SESSION_TOKEN 이 필요합니다.');
  process.exit(1);
}

const WIDTHS = [
  ['mobile', 390],
  ['tablet', 768],
  ['desktop', 1440],
];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const results = [];

  for (const [name, width] of WIDTHS) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
    await ctx.addCookies([
      { name: 'teameet_v1_session', value: TOKEN, domain: 'alpha.teameet.co.kr', path: '/', httpOnly: true, secure: true, sameSite: 'Lax' },
    ]);
    const page = await ctx.newPage();

    // alpha 는 실시간 소켓이 계속 붙어 있어 networkidle 에 도달하지 않는다.
    await page.goto(`${BASE}/admin/ops/errors`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForLoadState('load', { timeout: 30000 }).catch(() => {});
    await page.waitForFunction(
      () => document.querySelectorAll('tbody tr').length > 0
        || /없어요|없습니다/.test(document.querySelector('main')?.innerText ?? ''),
      { timeout: 30000 },
    ).catch(() => {});
    await page.addStyleTag({ content: HIDE }).catch(() => {});
    await page.waitForTimeout(800);

    await page.screenshot({ path: path.join(OUT, `alpha-errors-list-${name}-${width}.png`), fullPage: true, scale: 'css' });

    let detail = null;
    const row = page.locator('tbody tr button, tbody tr').first();
    if (await row.count()) {
      await row.click({ timeout: 10000 }).catch(() => {});
      await page.waitForTimeout(1500);
      if (await page.locator('[role="dialog"]').count()) {
        detail = `alpha-errors-detail-${name}-${width}.png`;
        // 모달은 position:fixed 라 fullPage 캡처에서 화면 밖으로 밀린다 — 뷰포트로 찍는다.
        await page.screenshot({ path: path.join(OUT, detail), fullPage: false, scale: 'css' });
      }
    }

    const probe = await page.evaluate(() => ({
      rows: document.querySelectorAll('tbody tr').length,
      dialog: document.querySelectorAll('[role="dialog"]').length,
      hasV1Route: /\/api\/v1\//.test(document.body.innerText),
      hasVnRoute: /\/api\/v:n\//.test(document.body.innerText),
    }));
    results.push({ name, width, list: `alpha-errors-list-${name}-${width}.png`, detail, ...probe });
    console.log(`${name}(${width}) rows=${probe.rows} dialog=${probe.dialog} v1route=${probe.hasV1Route} v:n=${probe.hasVnRoute}`);

    await page.close();
    await ctx.close();
  }

  await browser.close();
  fs.writeFileSync(path.join(OUT, 'probe.json'), JSON.stringify(results, null, 2));
  console.log(`\nsaved → ${OUT}`);
})();
