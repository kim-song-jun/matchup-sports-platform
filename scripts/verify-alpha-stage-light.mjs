#!/usr/bin/env node
/** 화이트 무대(#749) 실측 -- 마이·공개·공유 + 다크 모드. 자격증명은 환경변수로만. */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const BASE = 'https://alpha.teameet.co.kr';
const PW = process.env.ALPHA_PASSWORD;
const OUT = '.screenshots/player-cards/stage-light-0825';
const pace = (ms = 4000) => new Promise((r) => setTimeout(r, ms));

const head = await fetch(`${BASE}/landing`, { method: 'HEAD' });
console.log('alpha commit:', (head.headers.get('x-teameet-commit') || '').slice(0, 8));

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
async function shot(token, url, file, { dark = false, waitSel = '.tm-my-profile-stage' } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 950 }, deviceScaleFactor: 2 });
  await ctx.addCookies([{ name: 'teameet_v1_session', value: token, domain: 'alpha.teameet.co.kr', path: '/' }]);
  if (dark) await ctx.addInitScript(() => { try { localStorage.setItem('tm-theme', 'dark'); } catch {} });
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector(waitSel, { timeout: 25000 });
  await page.waitForTimeout(2000);
  const bg = await page.locator('.tm-my-profile-stage').first().evaluate((el) => getComputedStyle(el).backgroundColor);
  console.log(file, '| stage bg:', bg);
  await page.screenshot({ path: `${OUT}/${file}.png`, fullPage: true });
  await ctx.close();
}

await shot(p01.token, `${BASE}/my`, '01-my-light');
await pace();
await shot(p02.token, `${BASE}/users/${p01.userId}`, '02-public-light');
await pace();
await shot(p02.token, `${BASE}/users/${p01.userId}/card`, '03-share-light');
await pace();
await shot(p01.token, `${BASE}/my`, '04-my-dark', { dark: true });
await browser.close();
console.log('완료');
