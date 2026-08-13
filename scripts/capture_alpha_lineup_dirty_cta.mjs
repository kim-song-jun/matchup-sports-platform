// alpha 실측: 라인업이 미저장(dirty) 상태일 때 하단 CTA 가 어떻게 보이는지 확인한다(PR #423).
//
//   ALPHA_SESSION_TOKEN="$(cat /private/tmp/alpha_admin.cookie)" \
//     node scripts/capture_alpha_lineup_dirty_cta.mjs
//
// 종전에는 막힌 사유 전체("저장하지 않은 변경사항이 있어요 — 먼저 저장해 주세요")가 제출
// 버튼의 라벨이었다. 이 버튼은 저장 버튼과 1fr 1fr 로 폭을 나눠 가지므로 390px 에서 한 칸이
// 약 170px 이고, 문장이 버튼 안에서 부풀어 하단이 잘렸다. 사유를 버튼 밖 안내 줄로 옮긴
// 뒤에도 버튼 텍스트가 실제로 한 줄에 들어가는지를 숫자로 확인한다.
//
// 저장/제출을 누르지 않으므로 서버 상태는 바뀌지 않는다(로컬 편집 상태만 만든다).
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.ALPHA_BASE || 'https://alpha.teameet.co.kr';
const TOKEN = process.env.ALPHA_SESSION_TOKEN;
const OUT = process.env.OUT_DIR || '/private/tmp/alpha-lineup-dirty';
if (!TOKEN) {
  console.error('ALPHA_SESSION_TOKEN 필요');
  process.exit(1);
}
mkdirSync(OUT, { recursive: true });

const TOURNAMENT_ID = process.env.TOURNAMENT_ID || '0100a35c-0f86-4a29-a425-643d855606e1';
const FIXTURE_ID = process.env.FIXTURE_ID || '32c8dafa-f886-454f-b21b-e961d8f5ec55';

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

const pick = page.getByRole('button', { name: /명단 짜기/ }).first();
if ((await pick.count()) > 0 && (await pick.isVisible().catch(() => false))) {
  await pick.click().catch(() => {});
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(2000);
}

// 명단 탭에서 선발을 토글하면 dirty 가 된다(로컬 상태만 바뀐다 — 저장은 누르지 않는다).
const rosterTab = page.getByRole('tab', { name: '명단' }).first();
if ((await rosterTab.count()) > 0) {
  await rosterTab.click().catch(() => {});
  await page.waitForTimeout(1200);
}
const toggles = page.locator('input[type="checkbox"], [role="switch"]');
const toggleCount = await toggles.count();
if (toggleCount > 0) {
  await toggles.first().click().catch(() => {});
} else {
  // 체크박스가 아니라 버튼형 토글인 경우
  const btn = page.getByRole('button', { name: /선발|후보로|제외/ }).first();
  if ((await btn.count()) > 0) await btn.click().catch(() => {});
}
await page.waitForTimeout(1200);

const probe = await page.evaluate(() => {
  const cta = document.querySelector('.tm-fixed-cta');
  const nav = document.querySelector('nav.tm-bottom-nav');
  if (!cta) return { hasFixedCta: false, hasBottomNav: nav !== null };
  const buttons = [...cta.querySelectorAll('button')];
  const measure = (el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      label: (el.innerText || '').trim(),
      widthPx: Math.round(r.width),
      heightPx: Math.round(r.height),
      // 텍스트가 버튼 밖으로 넘쳤는지 — 넘치면 scrollWidth 가 clientWidth 보다 크다.
      overflowX: Math.max(0, el.scrollWidth - el.clientWidth),
      lineHeight: cs.lineHeight,
      disabled: el.disabled,
    };
  };
  const ctaRect = cta.getBoundingClientRect();
  return {
    hasFixedCta: true,
    hasBottomNav: nav !== null,
    viewportHeight: window.innerHeight,
    ctaTop: Math.round(ctaRect.top),
    ctaBottom: Math.round(ctaRect.bottom),
    // CTA 가 뷰포트 아래로 잘린 픽셀. 0 이어야 한다.
    ctaClippedPx: Math.max(0, Math.round(ctaRect.bottom - window.innerHeight)),
    // 막힌 사유가 버튼 라벨이 아니라 별도 안내 줄에 있는가.
    blockedNotice: cta.querySelector('#fixture-lineup-submit-blocked')?.textContent?.trim() ?? null,
    buttons: buttons.map(measure),
  };
});

console.log(JSON.stringify(probe, null, 2));
await page.screenshot({ path: `${OUT}/lineup-dirty-cta-mobile-390.png` });
console.log('저장:', `${OUT}/lineup-dirty-cta-mobile-390.png`);

await browser.close();
