// 토스 리서치 델타 적용 후 최신 UI 캡처 — Pretendard·a11y·숫자단위·component토큰 검증 + 갤러리용.
// 출력: docs/visual-qa/toss-latest/{mobile,desktop}/<name>.png
const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const BASE = 'http://localhost:3013';
const ROOT = path.resolve(__dirname, '../docs/visual-qa/toss-latest');
const HOST = 'host@teameet.v1';
const HIDE = `nextjs-portal,[data-nextjs-dev-tools-button],#__next-dev-tools-indicator,[data-nextjs-toast]{display:none!important}`;

const BP = [
  { key: 'mobile', width: 390, height: 844, pages: [
    ['login', '/login', false],
    ['home', '/home', true],
    ['matches', '/matches', true],
    ['teams', '/teams', true],
    ['tournaments', '/tournaments', true],
    ['my', '/my', true],
    ['chat', '/chat', true],
  ]},
  { key: 'desktop', width: 1440, height: 900, pages: [
    ['home', '/home', true],
    ['matches', '/matches', true],
    ['my', '/my', true],
  ]},
];

async function shot(p, dir, name) {
  await p.addStyleTag({ content: HIDE }).catch(() => {});
  await p.evaluate(() => window.scrollTo(0, 0)).catch(() => {});
  await p.evaluate(() => document.fonts.ready).catch(() => {});
  await p.waitForTimeout(600);
  await p.screenshot({ path: path.join(dir, name + '.png'), fullPage: false });
}

(async () => {
  const browser = await chromium.launch();
  for (const bp of BP) {
    const dir = path.join(ROOT, bp.key); fs.mkdirSync(dir, { recursive: true });
    console.log(`\n== ${bp.key} ==`);
    const ctx = await browser.newContext({ viewport: { width: bp.width, height: bp.height }, deviceScaleFactor: 1 });
    await ctx.addInitScript((e) => { localStorage.removeItem('teameet.v1.userId'); localStorage.setItem('teameet.v1.userEmail', e); }, HOST);
    const p = await ctx.newPage();
    for (const [name, route, auth] of bp.pages) {
      try {
        await p.goto(BASE + route, { waitUntil: 'networkidle', timeout: 30000 });
        await shot(p, dir, name);
        // Pretendard 로드 확인
        const font = await p.evaluate(() => getComputedStyle(document.body).fontFamily);
        console.log('  OK', name, '| font:', font.slice(0, 40));
      } catch (e) { console.log('  FAIL', name, (e.message || String(e)).slice(0, 50)); }
    }
    await p.close(); await ctx.close();
  }
  await browser.close();
  console.log('\n=== DONE ===');
})();
