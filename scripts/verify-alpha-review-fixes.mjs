#!/usr/bin/env node
/** 적대 검증 수정(#746) + 다크모드 재실측. 자격증명은 환경변수로만. */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const BASE = 'https://alpha.teameet.co.kr';
const PW = process.env.ALPHA_PASSWORD;
const OUT = '.screenshots/player-cards/review-fixes-0825';
const pace = (ms = 4000) => new Promise((r) => setTimeout(r, ms));

async function login(email) {
  const r = await fetch(`${BASE}/api/v1/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: PW }),
  });
  const token = (r.headers.getSetCookie?.() ?? []).map((c) => /teameet_v1_session=([^;]+)/.exec(c)?.[1]).find(Boolean);
  const me = await (await fetch(`${BASE}/api/v1/auth/me`, { headers: { cookie: `teameet_v1_session=${token}` } })).json();
  return { token, userId: me.data.user.id };
}
const p01 = await login('alpha.e2e.player01@teameet.test');
const p02 = await login('alpha.e2e.player02@teameet.test');

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
async function ctxFor(token, dark = false) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 950 }, deviceScaleFactor: 2 });
  await ctx.addCookies([{ name: 'teameet_v1_session', value: token, domain: 'alpha.teameet.co.kr', path: '/' }]);
  if (dark) await ctx.addInitScript(() => { try { localStorage.setItem('tm-theme', 'dark'); } catch {} });
  return ctx;
}

// ① 설정 입구: 존재 + 클릭 착지
{
  const ctx = await ctxFor(p01.token);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/my`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.tm-pcard-settings-link', { timeout: 25000 });
  console.log('① 카드 설정 입구:', await page.locator('.tm-pcard-settings-link').count(), '(기대 1)');
  await page.locator('.tm-my-profile-stage').screenshot({ path: `${OUT}/01-settings-entry.png` });
  await page.locator('.tm-pcard-settings-link').click();
  await page.waitForTimeout(2500);
  console.log('  클릭 착지 URL:', page.url().endsWith('/my/settings/player-card') ? '/my/settings/player-card ✓' : page.url());
  await page.screenshot({ path: `${OUT}/02-settings-landing.png`, fullPage: true });
  await ctx.close();
}
await pace();
// ② 본인 공개 프로필: 진행도 보임 / 남은 안 보임
{
  const ctx = await ctxFor(p01.token);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/users/${p01.userId}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.tm-player-card-progress', { timeout: 25000 }).catch(() => {});
  const own = await page.locator('.tm-player-card-progress').count();
  console.log('② 본인 공개 프로필 진행도:', own, '(기대 1)');
  await page.screenshot({ path: `${OUT}/03-public-self-progress.png`, fullPage: true });
  await ctx.close();
}
await pace();
{
  const ctx = await ctxFor(p02.token);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/users/${p01.userId}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.tm-player-card', { timeout: 25000 });
  await page.waitForTimeout(1500);
  console.log('  남이 볼 때 진행도:', await page.locator('.tm-player-card-progress').count(), '(기대 0)');
  await ctx.close();
}
await pace();
// ③ 진짜 다크모드 (tm-theme=dark)
{
  const ctx = await ctxFor(p01.token, true);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/my`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.tm-my-profile-stage', { timeout: 25000 });
  await page.waitForTimeout(2000);
  const darkOn = await page.evaluate(() => document.documentElement.classList.contains('dark'));
  console.log('③ html.dark 적용:', darkOn, '(기대 true)');
  await page.screenshot({ path: `${OUT}/04-my-true-dark.png`, fullPage: true });
  await ctx.close();
}
await browser.close();
console.log('완료');
