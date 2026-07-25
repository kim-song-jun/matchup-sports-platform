// 어드민 에러 로그 뷰어 3폭 캡처 (목록 + 상세 모달).
// 헤더 dev 인증: localStorage 의 teameet.v1.userEmail 을 api-client 가 x-v1-user-email 로 실어보낸다.
// admin 은 email 로 resolve 되므로 userId 는 넣지 않는다.
// Run: node scripts/capture_admin_error_logs.js
const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const BASE = process.env.WEB_BASE || 'http://localhost:3013';
const OUT = path.resolve(__dirname, '../docs/visual-qa/admin-error-logs');
const HIDE = 'nextjs-portal,[data-nextjs-dev-tools-button],#__next-dev-tools-indicator,[data-nextjs-toast]{display:none!important}';

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
    await ctx.addInitScript(() => {
      window.localStorage.setItem('teameet.v1.userEmail', 'admin@teameet.v1');
      window.localStorage.removeItem('teameet.v1.userId');
      window.localStorage.setItem('teameet.v1.session', 'active');
    });
    const page = await ctx.newPage();

    await page.goto(`${BASE}/admin/ops/errors`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForLoadState('load', { timeout: 30000 }).catch(() => {});
    // 목록 행이 실제로 그려질 때까지 기다린다 — 로딩 스켈레톤만 찍히면 검증이 안 된다.
    await page.waitForFunction(
      () => /Cannot GET|TypeError|약관/.test(document.body.innerText),
      { timeout: 30000 },
    ).catch(() => {});
    await page.addStyleTag({ content: HIDE }).catch(() => {});
    await page.waitForTimeout(600);

    const listPath = path.join(OUT, `errors-list-${name}-${width}.png`);
    await page.screenshot({ path: listPath, fullPage: true, scale: 'css' });

    // 상세 모달 — 목록의 첫 행을 클릭한다.
    let modalPath = null;
    const row = page.locator('tbody tr, [data-testid="error-log-row"], button:has-text("Cannot GET")').first();
    if (await row.count()) {
      await row.click({ timeout: 10000 }).catch(() => {});
      await page.waitForTimeout(1200);
      const hasDialog = await page.locator('[role="dialog"]').count();
      if (hasDialog) {
        modalPath = path.join(OUT, `errors-detail-${name}-${width}.png`);
        await page.screenshot({ path: modalPath, fullPage: true, scale: 'css' });
      }
    }

    const probe = await page.evaluate(() => ({
      rows: document.querySelectorAll('tbody tr').length,
      dialog: document.querySelectorAll('[role="dialog"]').length,
      hasRedacted: document.body.innerText.includes('[REDACTED]'),
      hasTraceback: /at MyPageClient|Traceback|스택/.test(document.body.innerText),
      text: document.body.innerText.replace(/\s+/g, ' ').slice(0, 260),
    }));
    results.push({ name, width, listPath, modalPath, ...probe });
    console.log(`${name}(${width}) rows=${probe.rows} dialog=${probe.dialog} redacted=${probe.hasRedacted} traceback=${probe.hasTraceback}`);

    await page.close();
    await ctx.close();
  }

  await browser.close();
  fs.writeFileSync(path.join(OUT, 'probe.json'), JSON.stringify(results, null, 2));
  console.log(`\nsaved → ${OUT}`);
})();
