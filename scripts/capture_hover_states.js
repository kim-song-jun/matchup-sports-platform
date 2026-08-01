// Figma 컴포넌트 상태 가시화 — 버튼 hover/active, 카드 hover-lift, input focus ring.
// 출력: docs/visual-qa/figma-states/<name>.png
const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const BASE = 'http://localhost:3013';
const ROOT = path.resolve(__dirname, '../docs/visual-qa/figma-states');
const HOST = 'host@teameet.v1';
const HIDE = `nextjs-portal,[data-nextjs-dev-tools-button],#__next-dev-tools-indicator,[data-nextjs-toast]{display:none!important}`;

(async () => {
  fs.mkdirSync(ROOT, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await ctx.addInitScript((e) => { localStorage.removeItem('teameet.v1.userId'); localStorage.setItem('teameet.v1.userEmail', e); }, HOST);
  const p = await ctx.newPage();

  // 1) 로그인 — input focus ring + 버튼 hover
  try {
    await p.goto(BASE + '/login/email', { waitUntil: 'networkidle', timeout: 30000 });
    await p.addStyleTag({ content: HIDE }).catch(() => {});
    await p.waitForTimeout(500);
    const input = p.locator('input').first();
    if (await input.count()) { await input.focus(); await p.waitForTimeout(300); }
    await p.screenshot({ path: path.join(ROOT, 'login-input-focus.png'), fullPage: false });
    console.log('OK login-input-focus');
  } catch (e) { console.log('FAIL login', (e.message||'').slice(0,50)); }

  // 2) 매치 — 카드/버튼 hover (데스크톱에서 hover 의미)
  const dctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await dctx.addInitScript((e) => { localStorage.removeItem('teameet.v1.userId'); localStorage.setItem('teameet.v1.userEmail', e); }, HOST);
  const d = await dctx.newPage();
  try {
    await d.goto(BASE + '/matches', { waitUntil: 'networkidle', timeout: 30000 });
    await d.addStyleTag({ content: HIDE }).catch(() => {});
    await d.waitForTimeout(600);
    // primary 버튼 hover
    const btn = d.locator('.tm-btn-primary').first();
    if (await btn.count()) { await btn.hover(); await d.waitForTimeout(250); }
    await d.screenshot({ path: path.join(ROOT, 'matches-btn-hover.png'), fullPage: false });
    console.log('OK matches-btn-hover');
    // 인터랙티브 카드 hover-lift (있으면)
    const card = d.locator('.tm-card-interactive, .tm-interactive').first();
    if (await card.count()) { await card.hover(); await d.waitForTimeout(250); await d.screenshot({ path: path.join(ROOT, 'card-hover-lift.png'), fullPage: false }); console.log('OK card-hover-lift'); }
    else console.log('no interactive card on /matches');
  } catch (e) { console.log('FAIL matches', (e.message||'').slice(0,50)); }

  await browser.close();
  console.log('=== DONE ===');
})();
