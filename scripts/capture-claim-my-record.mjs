/**
 * Task 154 P0-5 "이 기록은 제 것입니다" 화면 캡처 (390/768/1440).
 *
 * alpha 는 로그인 API 에 rate limit 이 걸려 있어(429 + retry-after) 캡처 때마다
 * 로그인하면 금방 막힌다 -- 이미 받아 둔 세션 토큰을 **환경변수로만** 넘긴다.
 * 저장소가 PUBLIC 이므로 토큰·비밀번호를 파일에 적지 않는다.
 *
 * 사용법: ALPHA_SESSION_TOKEN=... TOURNAMENT_ID=... FIXTURE_ID=... \
 *          node scripts/capture-claim-my-record.mjs [outDir]
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const BASE = process.env.CAPTURE_BASE_URL ?? 'https://alpha.teameet.co.kr';
const OUT = process.argv[2] ?? '.capture/claim-my-record';
const TOKEN = process.env.ALPHA_SESSION_TOKEN;
const T = process.env.TOURNAMENT_ID;
const FX = process.env.FIXTURE_ID;
if (!TOKEN || !T || !FX) {
  console.error('ALPHA_SESSION_TOKEN / TOURNAMENT_ID / FIXTURE_ID 가 필요해요.');
  process.exit(1);
}

const WIDTHS = [
  { key: 'mobile', width: 390, height: 1000 },
  { key: 'tablet', width: 768, height: 1000 },
  { key: 'desktop', width: 1440, height: 1000 },
];

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const results = [];
for (const { key, width, height } of WIDTHS) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2 });
  await context.addCookies([{ name: 'teameet_v1_session', value: TOKEN, domain: new URL(BASE).hostname, path: '/' }]);
  await context.addInitScript(() => window.localStorage.setItem('teameet.v1.session', 'active'));
  const page = await context.newPage();
  const url = `${BASE}/tournaments/${T}/matches/${FX}`;
  // 라이브 폴링이 있는 화면은 networkidle 이 끝나지 않는다 -- domcontentloaded + 명시 대기.
  const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/match-${key}-${width}.png`, fullPage: true });
  results.push({ view: 'match', width: key, httpStatus: resp?.status() ?? null });
  console.log(`match @${width} -> ${resp?.status()}`);

  // 모달을 실제로 열어 찍는다 -- 배너만 찍으면 이 기능의 핵심 화면을 못 본다.
  const trigger = page.getByRole('button', { name: '명단에서 나 찾기' });
  if (await trigger.count()) {
    await trigger.first().click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${OUT}/modal-${key}-${width}.png`, fullPage: false });
    results.push({ view: 'modal', width: key, opened: true });
    console.log(`modal @${width} -> opened`);
  } else {
    results.push({ view: 'modal', width: key, opened: false });
    console.log(`modal @${width} -> 배너 없음(섹션 미노출)`);
  }
  await context.close();
}
await browser.close();
await writeFile(`${OUT}/meta.json`, JSON.stringify({ base: BASE, results }, null, 2));
console.log(`완료: ${OUT}/meta.json`);
