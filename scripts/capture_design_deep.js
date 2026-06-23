// 심화 UI critique용 확장 캡처 — 상세/생성폼/채팅/알림/검색/모달 등 이전 critique서 빠진 surface.
// 출력: docs/visual-qa/design-deep/{mobile,desktop}/<name>.png
const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const BASE = 'http://localhost:3013';
const ROOT = path.resolve(__dirname, '../docs/visual-qa/design-deep');
const HOST = 'host@teameet.v1';
const M = '00000000-0000-4000-8000-000000000202';      // match
const TEAM = '00000000-0000-4000-8000-000000000101';   // team
const TMATCH = '00000000-0000-4000-8000-000000001406'; // team-match
const TOURN = 'efc6a994-2349-4316-87b0-4e6cd351b4b5';  // tournament
const CHAT = '5c6a8892-0405-4594-98b8-92e70d49b869';   // chat room

const BREAKPOINTS = [
  { key: 'mobile', width: 390, height: 844 },
  { key: 'desktop', width: 1440, height: 900 },
];

// 이전 critique서 빠진 심화 surface(상세/폼/채팅/알림/검색)
const PAGES = [
  ['d01-match-detail', `/matches/${M}`],
  ['d02-match-new-sport', '/matches/new/sport'],
  ['d03-match-new-placetime', '/matches/new/place-time'],
  ['d04-team-detail', `/teams/${TEAM}`],
  ['d05-team-members', `/teams/${TEAM}/members`],
  ['d06-team-match-detail', `/team-matches/${TMATCH}`],
  ['d07-team-match-new', '/team-matches/new'],
  ['d08-tournament-detail', `/tournaments/${TOURN}`],
  ['d09-chat-list', '/chat'],
  ['d10-chat-room', `/chat/${CHAT}`],
  ['d11-notifications', '/notifications'],
  ['d12-search', '/search'],
  ['d13-my-profile-edit', '/my/profile/edit'],
  ['d14-my-reviews', '/my/reviews'],
];

const HIDE = `nextjs-portal,[data-nextjs-dev-tools-button],#__next-dev-tools-indicator,[data-nextjs-toast]{display:none!important}`;

async function shot(page, dir, name) {
  await page.addStyleTag({ content: HIDE }).catch(() => {});
  await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {});
  await page.evaluate(() => document.fonts.ready).catch(() => {});
  await page.waitForTimeout(450);
  await page.screenshot({ path: path.join(dir, name + '.png'), fullPage: true, scale: 'css' });
}

(async () => {
  const browser = await chromium.launch();
  for (const bp of BREAKPOINTS) {
    const dir = path.join(ROOT, bp.key);
    fs.mkdirSync(dir, { recursive: true });
    console.log(`\n===== ${bp.key} =====`);
    const ctx = await browser.newContext({ viewport: { width: bp.width, height: bp.height }, deviceScaleFactor: 1 });
    await ctx.addInitScript((e) => { localStorage.removeItem('teameet.v1.userId'); localStorage.setItem('teameet.v1.userEmail', e); }, HOST);
    const page = await ctx.newPage();
    for (const [name, route] of PAGES) {
      try {
        await page.goto(BASE + route, { waitUntil: 'networkidle', timeout: 30000 });
        await shot(page, dir, name);
        console.log('  OK', name);
      } catch (e) { console.log('  FAIL', name, (e.message || String(e)).slice(0, 60)); }
    }
    await page.close();
    await ctx.close();
  }
  await browser.close();
  console.log('\n=== DONE ===');
})();
