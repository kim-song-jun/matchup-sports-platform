/**
 * Task 154 P1·P2 공개 프로필 캡처 (390/768/1440).
 * alpha 로그인은 rate limit 이 걸리므로 세션 토큰을 환경변수로만 넘긴다.
 * 사용법: ALPHA_SESSION_TOKEN=... TARGET_USER_ID=... node scripts/capture-public-profile.mjs [outDir]
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const BASE = process.env.CAPTURE_BASE_URL ?? 'https://alpha.teameet.co.kr';
const OUT = process.argv[2] ?? '.capture/public-profile';
const TOKEN = process.env.ALPHA_SESSION_TOKEN;
const TARGET = process.env.TARGET_USER_ID;
if (!TOKEN || !TARGET) { console.error('ALPHA_SESSION_TOKEN / TARGET_USER_ID 필요'); process.exit(1); }

const WIDTHS = [
  { key: 'mobile', width: 390, height: 1100 },
  { key: 'tablet', width: 768, height: 1100 },
  { key: 'desktop', width: 1440, height: 1100 },
];
const TARGETS = [
  { name: 'public-profile', path: `/users/${TARGET}` },
  { name: 'records', path: `/users/${TARGET}/records` },
];

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const results = [];
for (const { key, width, height } of WIDTHS) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2 });
  await ctx.addCookies([{ name: 'teameet_v1_session', value: TOKEN, domain: new URL(BASE).hostname, path: '/' }]);
  await ctx.addInitScript(() => window.localStorage.setItem('teameet.v1.session', 'active'));
  const page = await ctx.newPage();
  for (const t of TARGETS) {
    const resp = await page.goto(`${BASE}${t.path}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(2200);
    await page.screenshot({ path: `${OUT}/${t.name}-${key}-${width}.png`, fullPage: true });
    results.push({ target: t.name, width: key, httpStatus: resp?.status() ?? null });
    console.log(`${t.name} @${width} -> ${resp?.status()}`);
  }
  await ctx.close();
}
await browser.close();
await writeFile(`${OUT}/meta.json`, JSON.stringify({ base: BASE, results }, null, 2));
console.log(`완료: ${OUT}/meta.json`);
