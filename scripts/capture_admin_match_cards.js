// admin 매치 관리 카드(AdminCardList) 시각 검증 — 데스크톱 그리드 + 모바일 1열.
// 출력: docs/visual-qa/admin-match-cards/<name>.png
const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const BASE = 'http://localhost:3013';
const ROOT = path.resolve(__dirname, '../docs/visual-qa/admin-match-cards');
const ADMIN = 'admin@teameet.v1';
const HIDE = `nextjs-portal,[data-nextjs-dev-tools-button],#__next-dev-tools-indicator,[data-nextjs-toast]{display:none!important}`;

const VIEWS = [
  { name: 'desktop-1440', width: 1440, height: 1000 },
  { name: 'mobile-390', width: 390, height: 900 },
];

(async () => {
  fs.mkdirSync(ROOT, { recursive: true });
  const browser = await chromium.launch();
  for (const v of VIEWS) {
    const ctx = await browser.newContext({ viewport: { width: v.width, height: v.height }, deviceScaleFactor: 1 });
    await ctx.addInitScript((e) => {
      localStorage.removeItem('teameet.v1.userId');
      localStorage.setItem('teameet.v1.userEmail', e);
    }, ADMIN);
    const p = await ctx.newPage();
    try {
      await p.goto(BASE + '/admin/matches', { waitUntil: 'networkidle', timeout: 30000 });
      await p.addStyleTag({ content: HIDE }).catch(() => {});
      await p.evaluate(() => document.fonts.ready).catch(() => {});
      await p.waitForTimeout(700);
      const cardCount = await p.evaluate(() => document.querySelectorAll('ul[role="list"] > li').length);
      await p.screenshot({ path: path.join(ROOT, v.name + '.png'), fullPage: false });
      console.log('OK', v.name, 'cards:', cardCount);
    } catch (e) {
      console.log('FAIL', v.name, (e.message || String(e)).slice(0, 80));
    }
    await p.close();
    await ctx.close();
  }
  await browser.close();
  console.log('=== DONE ===');
})();
