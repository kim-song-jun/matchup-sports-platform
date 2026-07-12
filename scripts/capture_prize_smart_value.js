// 상금 행 스마트 자유값(A안) 시각 검증 — 공개 상세 상금 카드 / 시상 페이지 상금 테이블 / 어드민 편집기.
// web 3015(→v1_api 8123, isolated verify DB) 전제. Run: node scripts/capture_prize_smart_value.js
const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const BASE = 'http://localhost:3015';
const ROOT = '/private/tmp/claude-501/-Users-sungjun-Documents-projects-matchup-sports-platform/95f8eae2-88a5-4daf-a4ec-ceb8f356baf9/scratchpad/prize-verify';
const TID = '22642cc1-f6c9-4973-abec-ae0d35e1e277';
const HOST = [null, 'host@teameet.v1'];
const ADMIN = [null, 'admin@teameet.v1'];
const HIDE = `nextjs-portal,[data-nextjs-dev-tools-button],#__next-dev-tools-indicator,[data-nextjs-toast]{display:none!important}`;

// [name, route, auth, width]
const SHOTS = [
  ['public-detail-mobile', `/tournaments/${TID}`, HOST, 390],
  ['public-detail-desktop', `/tournaments/${TID}`, HOST, 1440],
  ['awards-mobile', `/tournaments/${TID}/awards`, HOST, 390],
  ['awards-desktop', `/tournaments/${TID}/awards`, HOST, 1440],
  ['admin-info-mobile', `/admin/tournaments/${TID}`, ADMIN, 390],
  ['admin-info-desktop', `/admin/tournaments/${TID}`, ADMIN, 1440],
];

(async () => {
  fs.mkdirSync(ROOT, { recursive: true });
  const browser = await chromium.launch();
  const out = {};
  for (const [name, route, auth, w] of SHOTS) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, deviceScaleFactor: 2 });
    await ctx.addInitScript(([i, e]) => {
      if (i) window.localStorage.setItem('teameet.v1.userId', i);
      if (e) window.localStorage.setItem('teameet.v1.userEmail', e);
    }, auth);
    const page = await ctx.newPage();
    const errs = [];
    page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 160)); });
    try {
      await page.goto(BASE + route, { waitUntil: 'networkidle', timeout: 40000 });
      await page.waitForTimeout(1500);
      if (route.startsWith('/admin/tournaments/')) {
        await page.locator('#tab-info').click().catch(() => {});
        await page.waitForTimeout(600);
      }
      await page.addStyleTag({ content: HIDE }).catch(() => {});
      await page.evaluate(() => document.fonts.ready).catch(() => {});
      await page.screenshot({ path: path.join(ROOT, `${name}.png`), fullPage: true, scale: 'css' });
      const txt = await page.evaluate(() => document.body.innerText);
      out[name] = {
        hasMvpGoods: txt.includes('축구화'),
        hasAmountRow: txt.includes('600,000'),
        hasParticipantGoods: txt.includes('음료'),
        console: [...new Set(errs)].slice(0, 5),
      };
      console.log(`OK ${name}`);
    } catch (e) {
      out[name] = { error: (e.message || String(e)).slice(0, 200) };
      console.log(`FAIL ${name} — ${out[name].error}`);
    }
    await page.close(); await ctx.close();
  }
  await browser.close();
  fs.writeFileSync(path.join(ROOT, 'manifest.json'), JSON.stringify(out, null, 2));
  console.log('\n' + JSON.stringify(out, null, 2));
})();
