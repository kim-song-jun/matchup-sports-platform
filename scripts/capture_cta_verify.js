// Thread B 회귀 검증: matches.css 의 .tm-create-fixed-cta 스코프 수정 후
// /matches/new(베이스라인) + /team-matches/new(회귀 타깃)의 데스크톱 fixed CTA 유지 확인.
// 출력: docs/visual-qa/regression-cta/<name>.png
const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const BASE = 'http://localhost:3013';
const ROOT = path.resolve(__dirname, '../docs/visual-qa/regression-cta');
const HOST = 'host@teameet.v1';
const HIDE = `nextjs-portal,[data-nextjs-dev-tools-button],#__next-dev-tools-indicator,[data-nextjs-toast]{display:none!important}`;

const PAGES = [
  ['matches-new-desktop', '/matches/new'],
  ['team-matches-new-desktop', '/team-matches/new'],
];

(async () => {
  fs.mkdirSync(ROOT, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await ctx.addInitScript((e) => {
    localStorage.removeItem('teameet.v1.userId');
    localStorage.setItem('teameet.v1.userEmail', e);
  }, HOST);
  const p = await ctx.newPage();
  for (const [name, route] of PAGES) {
    try {
      await p.goto(BASE + route, { waitUntil: 'networkidle', timeout: 30000 });
      await p.addStyleTag({ content: HIDE }).catch(() => {});
      await p.evaluate(() => document.fonts.ready).catch(() => {});
      await p.waitForTimeout(500);
      // CTA 위치/스타일 측정 (fixed 유지 여부 판정)
      const cta = await p.evaluate(() => {
        const el = document.querySelector('.tm-create-fixed-cta');
        if (!el) return { found: false };
        const cs = getComputedStyle(el);
        return {
          found: true,
          position: cs.position,
          bottom: cs.bottom,
          background: cs.backgroundColor,
          borderTop: cs.borderTopWidth,
          padding: cs.padding,
        };
      });
      // viewport 캡처(하단 CTA 보이도록)
      await p.screenshot({ path: path.join(ROOT, name + '.png'), fullPage: false });
      console.log('OK', name, JSON.stringify(cta));
    } catch (e) {
      console.log('FAIL', name, (e.message || String(e)).slice(0, 80));
    }
  }
  await p.close();
  await ctx.close();
  await browser.close();
  console.log('=== DONE ===');
})();
