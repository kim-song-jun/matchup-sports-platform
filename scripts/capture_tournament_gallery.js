// 대회 전 페이지 갤러리 캡처 (mobile 390 / tablet 768 / desktop 1440).
// PR #21 갤러리 코멘트용. web 3013(→8121) + seed 대회 전제.
// Output: docs/visual-qa/tournament-gallery/{mobile,tablet,desktop}/<name>.png
// Run: node scripts/capture_tournament_gallery.js
const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const BASE = 'http://localhost:3013';
const ROOT = path.resolve(__dirname, '../docs/visual-qa/tournament-gallery');
const HOST = ['0cf89db6-3e53-406c-b896-89ade09add9a', 'host@teameet.v1'];
const MGR = ['39adc75a-0702-45bd-b5fd-4cf2d295f7fd', 'owner@teameet.v1'];
const ADMIN = ['dba4a3c4-f628-4d22-9084-2b11f967120b', 'admin@teameet.v1'];
const TID = 'ebe29be8-dba6-41c8-8ccf-b1747410b4e7';
const REG = '080050c6-8807-44b7-bf86-1c05152fb097';
const HIDE = `nextjs-portal,[data-nextjs-dev-tools-button],#__next-dev-tools-indicator,[data-nextjs-toast]{display:none!important}`;
const BPS = [{ k: 'mobile', w: 390 }, { k: 'tablet', w: 768 }, { k: 'desktop', w: 1440 }];

// [name, route, auth, tabText?]
const PAGES = [
  ['01-home', '/home', HOST],
  ['02-consumer-list', '/tournaments', HOST],
  ['03-consumer-detail', `/tournaments/${TID}`, HOST],
  ['04-consumer-apply', `/tournaments/${TID}/apply`, MGR],
  ['05-consumer-roster', `/tournaments/${TID}/registrations/${REG}/roster`, MGR],
  ['06-consumer-my', `/tournaments/${TID}/my?reg=${REG}`, MGR],
  ['07-admin-list', '/admin/tournaments', ADMIN],
  ['08-admin-create', '/admin/tournaments/new', ADMIN],
  ['09-admin-detail-registrations', `/admin/tournaments/${TID}`, ADMIN],
  ['10-admin-detail-bracket', `/admin/tournaments/${TID}`, ADMIN, '대진'],
  ['11-admin-detail-announcements', `/admin/tournaments/${TID}`, ADMIN, '공지'],
];

const results = { ok: [], fail: [] };

(async () => {
  const browser = await chromium.launch();
  for (const bp of BPS) {
    const dir = path.join(ROOT, bp.k);
    fs.mkdirSync(dir, { recursive: true });
    for (const [name, route, auth, tabText] of PAGES) {
      const ctx = await browser.newContext({ viewport: { width: bp.w, height: 900 }, deviceScaleFactor: 2 });
      await ctx.addInitScript(([i, e]) => { localStorage.setItem('teameet.v1.userId', i); localStorage.setItem('teameet.v1.userEmail', e); }, auth);
      const page = await ctx.newPage();
      try {
        await page.goto(BASE + route, { waitUntil: 'networkidle', timeout: 45000 });
        await page.waitForTimeout(1100);
        if (tabText) {
          // 어드민 상세 탭 전환: 버튼 텍스트에 tabText 포함된 것 클릭
          const clicked = await page.evaluate((t) => {
            const btn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent && b.textContent.includes(t) && b.textContent.length < 12);
            if (btn) { btn.click(); return true; }
            return false;
          }, tabText);
          if (clicked) await page.waitForTimeout(900);
        }
        await page.addStyleTag({ content: HIDE }).catch(() => {});
        await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {});
        await page.evaluate(() => document.fonts.ready).catch(() => {});
        await page.screenshot({ path: path.join(dir, name + '.png'), fullPage: true, scale: 'css' });
        results.ok.push(`${name}-${bp.k}`);
        process.stdout.write('.');
      } catch (e) {
        results.fail.push(`${name}-${bp.k}: ${(e.message || e).slice(0, 80)}`);
        process.stdout.write('x');
      }
      await page.close(); await ctx.close();
    }
  }
  await browser.close();
  console.log(`\n=== OK ${results.ok.length} / FAIL ${results.fail.length} ===`);
  if (results.fail.length) console.log(results.fail.join('\n'));
})();
