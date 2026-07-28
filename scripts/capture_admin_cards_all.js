// admin 카드 마이그레이션 전수 시각 검증 — 데이터 형태가 다른 대표 페이지 데스크톱.
// 출력: docs/visual-qa/admin-cards-all/<name>.png
const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const BASE = 'http://localhost:3013';
const ROOT = path.resolve(__dirname, '../docs/visual-qa/admin-cards-all');
const ADMIN = 'admin@teameet.v1';
const HIDE = `nextjs-portal,[data-nextjs-dev-tools-button],#__next-dev-tools-indicator,[data-nextjs-toast]{display:none!important}`;

const PAGES = [
  ['teams', '/admin/teams'],
  ['users', '/admin/users'],
  ['audit', '/admin/audit'],
  ['tournaments', '/admin/tournaments'],
  ['team-matches', '/admin/team-matches'],
];

(async () => {
  fs.mkdirSync(ROOT, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  await ctx.addInitScript((e) => {
    localStorage.removeItem('teameet.v1.userId');
    localStorage.setItem('teameet.v1.userEmail', e);
  }, ADMIN);
  const p = await ctx.newPage();
  for (const [name, route] of PAGES) {
    try {
      await p.goto(BASE + route, { waitUntil: 'networkidle', timeout: 30000 });
      await p.addStyleTag({ content: HIDE }).catch(() => {});
      await p.evaluate(() => document.fonts.ready).catch(() => {});
      await p.waitForTimeout(700);
      const cards = await p.evaluate(() => document.querySelectorAll('ul[role="list"] > li').length);
      await p.screenshot({ path: path.join(ROOT, name + '.png'), fullPage: false });
      console.log('OK', name, 'cards:', cards);
    } catch (e) {
      console.log('FAIL', name, (e.message || String(e)).slice(0, 70));
    }
  }
  await p.close();
  await ctx.close();
  await browser.close();
  console.log('=== DONE ===');
})();
