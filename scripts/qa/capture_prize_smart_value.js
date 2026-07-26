// 상금 행 스마트 자유값(A안) 시각 검증 — 공개 상세 상금 카드 / 시상 페이지 상금 테이블 / 어드민 편집기.
// 대상 대회의 prizeBreakdown에 금액+물품 혼합 값(예: "1위 600,000원 / MVP 축구화 · 상품권")을 넣어두고 실행한다.
//
// Usage:
//   TID=<tournamentId> node scripts/qa/capture_prize_smart_value.js
// Env:
//   TID      (required) 캡처 대상 대회 ID
//   WEB_BASE (default http://localhost:3013) v1 web 베이스 URL
//   API_BASE (default http://localhost:8121) v1 API 베이스 URL — 실행 전 도달성 체크용
//   OUT_DIR  (default <repo>/output/playwright/prize-smart-value) PNG·manifest 출력 디렉토리
const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const WEB_BASE = process.env.WEB_BASE || 'http://localhost:3013';
const API_BASE = process.env.API_BASE || 'http://localhost:8121';
const OUT_DIR = process.env.OUT_DIR || path.join(REPO_ROOT, 'output', 'playwright', 'prize-smart-value');
const TID = process.env.TID;
if (!TID) {
  console.error('TID 환경변수가 필요해요. 예: TID=<tournamentId> node scripts/qa/capture_prize_smart_value.js');
  process.exit(1);
}

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
  // API 도달성 선확인 — 웹 프록시 뒤 API가 죽어 있으면 6장 전부 흰 화면이 나온다.
  try {
    const res = await fetch(`${API_BASE}/api/v1/tournaments/${TID}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch (e) {
    console.error(`API_BASE(${API_BASE})에서 대회(${TID})를 읽지 못했어요: ${e.message || e}`);
    process.exit(1);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
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
      await page.goto(WEB_BASE + route, { waitUntil: 'networkidle', timeout: 40000 });
      await page.waitForTimeout(1500);
      if (route.startsWith('/admin/tournaments/')) {
        await page.locator('#tab-info').click().catch(() => {});
        await page.waitForTimeout(600);
      }
      await page.addStyleTag({ content: HIDE }).catch(() => {});
      await page.evaluate(() => document.fonts.ready).catch(() => {});
      await page.screenshot({ path: path.join(OUT_DIR, `${name}.png`), fullPage: true, scale: 'css' });
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
  fs.writeFileSync(path.join(OUT_DIR, 'manifest.json'), JSON.stringify(out, null, 2));
  console.log('\n' + JSON.stringify(out, null, 2));
})();
