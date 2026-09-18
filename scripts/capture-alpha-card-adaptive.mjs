#!/usr/bin/env node
/** 상태 적응형 카드(#736) 실측 -- 여정 면 / 남이 보는 공개 프로필 / 공유 무대.
 *  자격증명은 환경변수로만(ALPHA_PASSWORD). */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const BASE = process.env.ALPHA_BASE ?? 'https://alpha.teameet.co.kr';
const PW = process.env.ALPHA_PASSWORD;
const OUT = process.env.OUT_DIR ?? '.screenshots/player-cards/adaptive-0825';
if (!PW) { console.error('ALPHA_PASSWORD 필요'); process.exit(1); }

async function login(email) {
  const r = await fetch(`${BASE}/api/v1/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: PW }),
  });
  const token = (r.headers.getSetCookie?.() ?? []).map((c) => /teameet_v1_session=([^;]+)/.exec(c)?.[1]).find(Boolean);
  if (!token) throw new Error(`${email} 로그인 실패 ${r.status}`);
  const me = await (await fetch(`${BASE}/api/v1/auth/me`, { headers: { cookie: `teameet_v1_session=${token}` } })).json();
  return { token, userId: me.data.user.id };
}

const admin = await login('alpha.e2e.admin@teameet.test');      // 0경기 -- 여정 면
const p01 = await login('alpha.e2e.player01@teameet.test');     // 4경기 -- 기록 면
const p02 = await login('alpha.e2e.player02@teameet.test');     // 남(viewer)

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();

async function shot(token, url, file, checks) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 950 }, deviceScaleFactor: 2 });
  await ctx.addCookies([{ name: 'teameet_v1_session', value: token, domain: new URL(BASE).hostname, path: '/' }]);
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2600);
  for (const [label, sel, expectCount] of checks) {
    const n = await page.locator(sel).count();
    console.log(`  ${label}: ${n} (기대 ${expectCount})${n === expectCount ? '' : '  ⚠️'}`);
  }
  await page.screenshot({ path: `${OUT}/${file}`, fullPage: true });
  console.log('찍음', `${OUT}/${file}`);
  await ctx.close();
}

console.log('① 마이페이지 여정 면 (관리자 0경기, 본인)');
await shot(admin.token, `${BASE}/my`, 'my-journey-admin.png', [
  ['여정 면', ".tm-player-card[data-face='journey']", 1],
  ['자물쇠 그리드', '.tm-player-card-stats', 0],
  ['진행도(본인이라 있음)', '.tm-player-card-progress', 1],
]);

console.log('② 남이 보는 공개 프로필 (player02 → player01)');
await shot(p02.token, `${BASE}/users/${p01.userId}`, 'public-p01-viewed-by-p02.png', [
  ['스테이지', '.tm-my-profile-stage', 1],
  ['흰 헤더(중복)', '.tm-my-profile-head', 0],
  ['진행도(남이라 없음)', '.tm-player-card-progress', 0],
  ['기록 면', ".tm-player-card[data-face='record']", 1],
]);

console.log('③ 공유 화면 무대 (player02 → player01 카드)');
await shot(p02.token, `${BASE}/users/${p01.userId}/card`, 'share-p01-viewed-by-p02.png', [
  ['스테이지', '.tm-my-profile-stage', 1],
  ['진행도(남이라 없음)', '.tm-player-card-progress', 0],
]);

await browser.close();
