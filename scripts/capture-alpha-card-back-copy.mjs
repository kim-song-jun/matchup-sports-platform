#!/usr/bin/env node
/** 문구 개선(#722) 실측 -- 카드 앞면·버튼·뒷면 새 문구를 alpha 에서 캡처한다.
 *  자격증명은 환경변수로만(ALPHA_PASSWORD, ALPHA_ACCOUNT). */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.ALPHA_BASE ?? 'https://alpha.teameet.co.kr';
const { ALPHA_PASSWORD: PW, ALPHA_ACCOUNT: ACC } = process.env;
const OUT = process.env.OUT_DIR ?? '.screenshots/player-cards/copy-fix-0825';
if (!PW || !ACC) { console.error('ALPHA_PASSWORD / ALPHA_ACCOUNT 필요'); process.exit(1); }

const res = await fetch(`${BASE}/api/v1/auth/login`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: ACC, password: PW }),
});
const token = (res.headers.getSetCookie?.() ?? []).map((c) => /teameet_v1_session=([^;]+)/.exec(c)?.[1]).find(Boolean);
if (!token) throw new Error(`로그인 실패 ${res.status}`);
const me = await (await fetch(`${BASE}/api/v1/auth/me`, { headers: { cookie: `teameet_v1_session=${token}` } })).json();
const userId = me.data.user.id;

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 2 });
await ctx.addCookies([{ name: 'teameet_v1_session', value: token, domain: new URL(BASE).hostname, path: '/' }]);
const page = await ctx.newPage();
await page.goto(`${BASE}/users/${userId}`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.tm-player-card', { timeout: 20000 });
await page.waitForTimeout(2000);

const card = page.locator('.tm-player-card').first();
await card.screenshot({ path: path.join(OUT, 'front-with-button.png') });
const btnText = await page.getByRole('button', { name: /카드 뒤집기|앞면 보기/ }).first().textContent();
console.log('버튼 문구:', JSON.stringify(btnText?.trim()));
await page.getByRole('button', { name: /카드 뒤집기/ }).click();
await page.waitForTimeout(1100);
await card.screenshot({ path: path.join(OUT, 'back-new-copy.png') });
const backText = await card.locator('.tm-pcard-backface').innerText();
console.log('뒷면 전문:\n' + backText);
await browser.close();
