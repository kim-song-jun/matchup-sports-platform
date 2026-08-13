// alpha 실측: 라인업 "배치 설정" 바텀시트가 하단에서 잘리지 않는지 확인한다(PR #423).
//
//   ALPHA_SESSION_TOKEN="$(cat /private/tmp/alpha_admin.cookie)" \
//     node scripts/capture_alpha_lineup_sheet.mjs
//
// 제보된 증상은 시트 하단(선수 칩 줄)이 하단 탭바에 가리는 것이었다. 육안 대조 대신
// 시트의 bottom 좌표와 뷰포트 높이·탭바 존재를 숫자로 재서 잘림 여부를 판정한다.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.ALPHA_BASE || 'https://alpha.teameet.co.kr';
const TOKEN = process.env.ALPHA_SESSION_TOKEN;
const OUT = process.env.OUT_DIR || '/private/tmp/alpha-lineup-sheet';
if (!TOKEN) {
  console.error('ALPHA_SESSION_TOKEN 필요');
  process.exit(1);
}
mkdirSync(OUT, { recursive: true });

const TOURNAMENT_ID = process.env.TOURNAMENT_ID || '663d78c6-fa99-4007-a81b-06937ff14c19';
const FIXTURE_ID = process.env.FIXTURE_ID || 'c9eed3d8-10c5-4dc5-970f-770fc487f978';

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 2 });
await ctx.addCookies([{
  name: 'teameet_v1_session',
  value: TOKEN,
  domain: new URL(BASE).hostname,
  path: '/',
  httpOnly: true,
  secure: true,
  sameSite: 'Lax',
}]);
const page = await ctx.newPage();

await page.goto(`${BASE}/tournaments/${TOURNAMENT_ID}/matches/${FIXTURE_ID}/lineup`, {
  waitUntil: 'domcontentloaded',
  timeout: 45_000,
});
await page.waitForLoadState('networkidle').catch(() => {});
await page
  .waitForFunction(() => !/로그인 정보를 확인하고 있어요/.test(document.body.innerText), null, { timeout: 20_000 })
  .catch(() => {});
await page.waitForTimeout(2000);

// 운영진은 팀 선택을 먼저 거친다.
const pick = page.getByRole('button', { name: /명단 짜기/ }).first();
if ((await pick.count()) > 0 && (await pick.isVisible().catch(() => false))) {
  await pick.click().catch(() => {});
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(2000);
}

const sheetButton = page.getByRole('button', { name: /배치 설정/ }).first();
const found = (await sheetButton.count()) > 0;
console.log('배치 설정 버튼:', found ? '있음' : '없음');
if (found) {
  await sheetButton.click().catch(() => {});
  await page.waitForTimeout(1200);
}

const probe = await page.evaluate(() => {
  const nav = document.querySelector('nav.tm-bottom-nav');
  // 시트는 fixed 오버레이(inset:0) 안의 bottom:0 패널이다. 화면 하단에 붙어 있고
  // 뷰포트보다 아래로 내려가면 잘린 것이다.
  const dialog = document.querySelector('[role="dialog"]');
  const rect = dialog ? dialog.getBoundingClientRect() : null;
  const text = document.body.innerText || '';
  return {
    hasBottomNav: nav !== null,
    sheetOpen: dialog !== null,
    viewportHeight: window.innerHeight,
    sheetTop: rect ? Math.round(rect.top) : null,
    sheetBottom: rect ? Math.round(rect.bottom) : null,
    // 시트 하단이 뷰포트 아래로 넘어간 픽셀 수. 0 이어야 잘리지 않은 것이다.
    clippedPx: rect ? Math.max(0, Math.round(rect.bottom - window.innerHeight)) : null,
    // 시트 안에서 가장 아래에 있는 조작 가능한 요소가 화면 안에 있는지.
    lastControlVisible: (() => {
      if (!dialog) return null;
      const controls = dialog.querySelectorAll('button, [role="button"]');
      if (controls.length === 0) return null;
      const last = controls[controls.length - 1].getBoundingClientRect();
      return last.bottom <= window.innerHeight + 1;
    })(),
    sheetText: dialog ? (dialog.innerText || '').slice(0, 160).replace(/\n+/g, ' | ') : text.slice(0, 120),
  };
});

console.log(JSON.stringify(probe, null, 2));
await page.screenshot({ path: `${OUT}/lineup-sheet-mobile-390.png` });
console.log('저장:', `${OUT}/lineup-sheet-mobile-390.png`);

await browser.close();
