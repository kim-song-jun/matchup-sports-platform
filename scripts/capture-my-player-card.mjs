/**
 * 마이페이지의 내 선수 카드 3폭 캡처 (Task 155).
 * 사용법: ALPHA_SESSION_TOKEN=... node scripts/capture-my-player-card.mjs [outDir]
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
const BASE = process.env.CAPTURE_BASE_URL ?? 'https://alpha.teameet.co.kr';
const OUT = process.argv[2] ?? '.capture/my-card';
const TOKEN = process.env.ALPHA_SESSION_TOKEN;
if (!TOKEN) { console.error('ALPHA_SESSION_TOKEN 이 필요해요.'); process.exit(1); }
const WIDTHS = [ {key:'mobile',width:390,height:1200}, {key:'tablet',width:768,height:1100}, {key:'desktop',width:1440,height:1100} ];
await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const results = [];
for (const { key, width, height } of WIDTHS) {
  const ctx = await browser.newContext({ viewport:{width,height}, deviceScaleFactor:2 });
  await ctx.addCookies([{ name:'teameet_v1_session', value:TOKEN, domain:new URL(BASE).hostname, path:'/' }]);
  const page = await ctx.newPage();
  const resp = await page.goto(`${BASE}/my`, { waitUntil:'domcontentloaded', timeout:45000 });
  await page.waitForTimeout(3000);
  await page.screenshot({ path:`${OUT}/my-${key}-${width}.png`, fullPage:false });
  const hasCard = await page.locator('.tm-player-card').count();
  results.push({ width:key, httpStatus: resp?.status() ?? null, cardVisible: hasCard > 0 });
  console.log(`my @${width} -> ${resp?.status()} | 카드 ${hasCard > 0 ? '있음' : '없음'}`);
  await ctx.close();
}
await browser.close();
await writeFile(`${OUT}/meta.json`, JSON.stringify({ base:BASE, results }, null, 2));
console.log('완료:', `${OUT}/meta.json`);
