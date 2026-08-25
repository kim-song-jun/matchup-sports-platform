#!/usr/bin/env node
/** flows 캡처 재개(08~14) -- 연속 요청 완화를 위해 내비게이션 간 5초 간격. */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const BASE = 'https://alpha.teameet.co.kr';
const PW = process.env.ALPHA_PASSWORD;
const OUT = '.screenshots/player-cards/flows-0825';
const pace = (ms = 5000) => new Promise((r) => setTimeout(r, ms));

async function login(email) {
  const r = await fetch(`${BASE}/api/v1/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: PW }),
  });
  const token = (r.headers.getSetCookie?.() ?? []).map((c) => /teameet_v1_session=([^;]+)/.exec(c)?.[1]).find(Boolean);
  const me = await (await fetch(`${BASE}/api/v1/auth/me`, { headers: { cookie: `teameet_v1_session=${token}` } })).json();
  return { token, userId: me.data.user.id };
}
const admin = await login('alpha.e2e.admin@teameet.test');
const p01 = await login('alpha.e2e.player01@teameet.test');
const staff = await login('alpha.e2e.staff@teameet.test');

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
async function ctxFor(token, width = 390, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width, height: width === 390 ? 950 : 1050 }, deviceScaleFactor: 2, ...opts });
  await ctx.addCookies([{ name: 'teameet_v1_session', value: token, domain: 'alpha.teameet.co.kr', path: '/' }]);
  return ctx;
}
async function snap(page, file, full = true) {
  await page.screenshot({ path: `${OUT}/${file}.png`, fullPage: full });
  console.log('찍음', file);
}

// 8-9. 본인 플로우: 마이 → 공유 → 프로필 전체 보기
{
  const ctx = await ctxFor(p01.token);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/my`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.tm-player-card-share-link', { timeout: 30000 });
  await pace(2000);
  await page.locator('.tm-player-card-share-link').click();
  await page.waitForTimeout(3000);
  await snap(page, '08-share-self-390');
  await pace();
  await page.getByRole('link', { name: '프로필 전체 보기' }).click();
  await page.waitForTimeout(3000);
  await snap(page, '09-public-self-390');
  await ctx.close();
}
await pace();
// 10. 기록 공개 설정
{
  const ctx = await ctxFor(admin.token);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/my/settings/record-consent`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  await snap(page, '10-record-consent-390');
  await ctx.close();
}
await pace();
// 11. 카드 설정(숨김+모양)
{
  const ctx = await ctxFor(p01.token);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/my/settings/player-card`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  await snap(page, '11-card-settings-390');
  await ctx.close();
}
await pace();
// 12-13. 카드 숨김 fallback -- 반드시 복구
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
    await page.waitForTimeout(3000);
    await snap(page, '12-my-hidden-fallback-390');
    await pace();
    await page.goto(`${BASE}/users/${staff.userId}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    await snap(page, '13-public-hidden-fallback-390');
    await ctx.close();
  } finally {
    await setHidden(staff.token, false);
  }
}
await pace();
// 14. 다크 모드
{
  const ctx = await ctxFor(p01.token, 390, { colorScheme: 'dark' });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/my`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  await snap(page, '14-my-record-dark-390');
  await ctx.close();
}
await browser.close();
console.log('재개 완료');
