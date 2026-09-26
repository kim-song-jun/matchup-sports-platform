#!/usr/bin/env node
/** 신원 통합 스테이지(#729) 실측 -- 마이페이지 3폭 캡처. 자격증명은 환경변수로만. */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const BASE = process.env.ALPHA_BASE ?? 'https://alpha.teameet.co.kr';
const { ALPHA_PASSWORD: PW, ALPHA_ACCOUNT: ACC } = process.env;
const OUT = process.env.OUT_DIR ?? '.screenshots/player-cards/stage-0825';
if (!PW || !ACC) { console.error('ALPHA_PASSWORD / ALPHA_ACCOUNT 필요'); process.exit(1); }

const res = await fetch(`${BASE}/api/v1/auth/login`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: ACC, password: PW }),
});
const token = (res.headers.getSetCookie?.() ?? []).map((c) => /teameet_v1_session=([^;]+)/.exec(c)?.[1]).find(Boolean);
if (!token) throw new Error(`로그인 실패 ${res.status}`);

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
for (const [label, width] of [['mobile', 390], ['tablet', 768], ['desktop', 1440]]) {
  const ctx = await browser.newContext({ viewport: { width, height: width === 390 ? 950 : 1050 }, deviceScaleFactor: 2 });
  await ctx.addCookies([{ name: 'teameet_v1_session', value: token, domain: new URL(BASE).hostname, path: '/' }]);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/my`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2600);
  const hasStage = await page.locator('.tm-my-profile-stage').count();
  const hasLightHead = await page.locator('.tm-my-profile-head').count();
  console.log(`${label}: stage=${hasStage} lightHead=${hasLightHead}`);
  await page.screenshot({ path: `${OUT}/my-stage-${label}-${width}.png`, fullPage: width !== 1440 });
  console.log('찍음', `${OUT}/my-stage-${label}-${width}.png`);
  await ctx.close();
}
await browser.close();
