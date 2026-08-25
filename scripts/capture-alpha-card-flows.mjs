#!/usr/bin/env node
/** 카드·프로필 전 플로우 실측 (적대 검증 증거 수집). 자격증명은 환경변수로만. */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const BASE = process.env.ALPHA_BASE ?? 'https://alpha.teameet.co.kr';
const PW = process.env.ALPHA_PASSWORD;
const OUT = process.env.OUT_DIR ?? '.screenshots/player-cards/flows-0825';
if (!PW) { console.error('ALPHA_PASSWORD 필요'); process.exit(1); }

async function login(email) {
  const r = await fetch(`${BASE}/api/v1/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: PW }),
  });
  const token = (r.headers.getSetCookie?.() ?? []).map((c) => /teameet_v1_session=([^;]+)/.exec(c)?.[1]).find(Boolean);
  if (!token) throw new Error(`${email} 로그인 실패 ${r.status}`);
  const me = await (await fetch(`${BASE}/api/v1/auth/me`, { headers: { cookie: `teameet_v1_session=${token}` } })).json();
  return { token, userId: me.data.user.id, email };
}

const admin = await login('alpha.e2e.admin@teameet.test');
const p01 = await login('alpha.e2e.player01@teameet.test');
const p02 = await login('alpha.e2e.player02@teameet.test');
const staff = await login('alpha.e2e.staff@teameet.test');

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();

async function ctxFor(token, width = 390, opts = {}) {
  const ctx = await browser.newContext({
    viewport: { width, height: width === 390 ? 950 : 1050 },
    deviceScaleFactor: 2,
    ...opts,
  });
  await ctx.addCookies([{ name: 'teameet_v1_session', value: token, domain: new URL(BASE).hostname, path: '/' }]);
  return ctx;
}

async function snap(page, file, full = true) {
  await page.screenshot({ path: `${OUT}/${file}.png`, fullPage: full });
  console.log('찍음', file);
}

// 1-2. admin 여정 면 + 뒷면
{
  const ctx = await ctxFor(admin.token);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/my`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  await snap(page, '01-my-journey-390');
  await page.getByRole('button', { name: /카드 뒤집기/ }).click();
  await page.waitForTimeout(1100);
  await page.locator('.tm-my-profile-stage').screenshot({ path: `${OUT}/02-my-journey-back.png` });
  console.log('찍음 02-my-journey-back');
  await ctx.close();
}
// 3-4. player01 기록 면 + 뒷면
{
  const ctx = await ctxFor(p01.token);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/my`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  await snap(page, '03-my-record-390');
  await page.getByRole('button', { name: /카드 뒤집기/ }).click();
  await page.waitForTimeout(1100);
  await page.locator('.tm-my-profile-stage').screenshot({ path: `${OUT}/04-my-record-back.png` });
  console.log('찍음 04-my-record-back');
  await ctx.close();
}
// 5. player01 데스크톱
{
  const ctx = await ctxFor(p01.token, 1440);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/my`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  await snap(page, '05-my-record-1440', false);
  await ctx.close();
}
// 6-7. 남이 보는 공개 프로필 (390 + 1440)
for (const [w, name] of [[390, '06-public-by-other-390'], [1440, '07-public-by-other-1440']]) {
  const ctx = await ctxFor(p02.token, w);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/users/${p01.userId}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  await snap(page, name, w === 390);
  await ctx.close();
}
// 8-10. 본인 플로우: 마이 → 공유하기 → 공유 화면 → 프로필 전체 보기
{
  const ctx = await ctxFor(p01.token);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/my`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2200);
  await page.getByRole('link', { name: '카드 공유하기' }).click();
  await page.waitForTimeout(2500);
  await snap(page, '08-share-self-390');
  await page.getByRole('link', { name: '프로필 전체 보기' }).click();
  await page.waitForTimeout(2500);
  await snap(page, '09-public-self-390');
  await ctx.close();
}
// 11. 기록 공개 설정 (CTA 착지)
{
  const ctx = await ctxFor(admin.token);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/my/settings/record-consent`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2200);
  await snap(page, '10-record-consent-390');
  await ctx.close();
}
// 12. 카드 설정(숨김+모양)
{
  const ctx = await ctxFor(p01.token);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/my/settings/player-card`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2200);
  await snap(page, '11-card-settings-390');
  await ctx.close();
}
// 13-14. 카드 숨김 상태의 마이/공개 프로필(fallback) -- staff 로 켰다가 반드시 되돌린다.
async function setHidden(token, hidden) {
  const r = await fetch(`${BASE}/api/v1/me/player-card-hidden`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', cookie: `teameet_v1_session=${token}` },
    body: JSON.stringify({ hidden }),
  });
  console.log('hidden →', hidden, r.status);
  return r.ok;
}
if (await setHidden(staff.token, true)) {
  try {
    const ctx = await ctxFor(staff.token);
    const page = await ctx.newPage();
    await page.goto(`${BASE}/my`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    await snap(page, '12-my-hidden-fallback-390');
    await page.goto(`${BASE}/users/${staff.userId}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    await snap(page, '13-public-hidden-fallback-390');
    await ctx.close();
  } finally {
    await setHidden(staff.token, false);
  }
}
// 15. 다크 모드 (시스템 다크)
{
  const ctx = await ctxFor(p01.token, 390, { colorScheme: 'dark' });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/my`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  await snap(page, '14-my-record-dark-390');
  await ctx.close();
}
await browser.close();
console.log('완료');
