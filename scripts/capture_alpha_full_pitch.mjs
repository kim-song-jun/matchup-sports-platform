// alpha 실측 캡처: 라인업 포메이션 에디터가 하프 코트가 아니라 풀 구장으로 그려지는지
// 3폭(390/768/1440)으로 찍고, 동시에 SVG 구조를 DOM 에서 측정한다(PR #429).
//
//   ALPHA_SESSION_TOKEN="$(cat /private/tmp/alpha_admin.cookie)" \
//     node scripts/capture_alpha_full_pitch.mjs
//
// 스크린샷만으로는 "하프라인이 정말 중앙인가"를 눈으로 우겨야 해서, 라인 좌표·요소
// 개수를 실제 DOM 에서 읽어 기대값과 대조한다 — 통과/실패가 숫자로 남는다.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = process.env.ALPHA_BASE || 'https://alpha.teameet.co.kr';
const TOKEN = process.env.ALPHA_SESSION_TOKEN;
const OUT = process.env.OUT_DIR || '/private/tmp/alpha-full-pitch';
if (!TOKEN) {
  console.error('ALPHA_SESSION_TOKEN 필요');
  process.exit(1);
}
mkdirSync(OUT, { recursive: true });

const TOURNAMENT_ID = process.env.TOURNAMENT_ID || '663d78c6-fa99-4007-a81b-06937ff14c19';
const FIXTURE_ID = process.env.FIXTURE_ID || 'c9eed3d8-10c5-4dc5-970f-770fc487f978';
const LINEUP_PATH = process.env.LINEUP_PATH || `/tournaments/${TOURNAMENT_ID}/matches/${FIXTURE_ID}/lineup`;

const WIDTHS = [
  { key: 'mobile-390', width: 390, height: 1100 },
  { key: 'tablet-768', width: 768, height: 1100 },
  { key: 'desktop-1440', width: 1440, height: 1000 },
];

const browser = await chromium.launch({ headless: true });
const results = [];

for (const vp of WIDTHS) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 2,
  });
  await ctx.addCookies([{
    name: 'teameet_v1_session',
    value: TOKEN,
    domain: new URL(BASE).hostname,
    path: '/',
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
  }]);
  const page = await ctx.newPage();

  await page.goto(BASE + LINEUP_PATH, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(2500);

  // 대회 라인업은 "어느 팀의 명단을 짤까요?" 팀 선택을 먼저 거친다 — 팀을 고르지 않으면
  // 피치가 아예 렌더되지 않는다. 보이면 첫 팀을 골라 편집 화면으로 들어간다.
  const teamPick = page.getByRole('button', { name: /명단 짜기/ }).first();
  if (await teamPick.count().then((n) => n > 0).catch(() => false)) {
    await teamPick.click({ timeout: 5000 }).catch(() => {});
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(2000);
  }

  // "피치 배치" 뷰가 기본이 아닐 수 있어, 보이면 눌러 전환한다.
  const pitchTab = page.getByRole('button', { name: /피치/ }).first();
  if (await pitchTab.count().then((n) => n > 0).catch(() => false)) {
    await pitchTab.click({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(1500);
  }

  const board = page.getByRole('application', { name: '피치 배치 보드' }).first();
  const hasBoard = await board.count().then((n) => n > 0).catch(() => false);

  // SVG 구조 실측 — 육안 대조 대신 숫자로 남긴다.
  const probe = hasBoard
    ? await page.evaluate(() => {
        const el = document.querySelector('[aria-label="피치 배치 보드"]');
        const svg = el?.querySelector('svg');
        if (!svg) return { error: 'svg 없음' };
        const num = (v) => (v === null ? null : Number(v));
        const lines = [...svg.querySelectorAll('line')].map((l) => ({
          y1: num(l.getAttribute('y1')), y2: num(l.getAttribute('y2')),
        }));
        const rects = [...svg.querySelectorAll('rect')].map((r) => ({
          x: num(r.getAttribute('x')), y: num(r.getAttribute('y')),
          w: num(r.getAttribute('width')), h: num(r.getAttribute('height')),
        }));
        const box = el.getBoundingClientRect();
        return {
          halfwayLines: lines,
          rectCount: rects.length,
          ellipseCount: svg.querySelectorAll('ellipse').length,
          pathCount: svg.querySelectorAll('path').length,
          circleCount: svg.querySelectorAll('circle').length,
          // 위/아래 페널티박스가 둘 다 있는지 (y<50 과 y>50 각각)
          // 외곽 경계선(w=96)도 조건을 만족해 버리므로 폭 상한을 둬 페널티박스만 센다.
          penaltyBoxesTop: rects.filter((r) => r.w > 50 && r.w < 70 && r.h > 10 && r.y < 50).length,
          penaltyBoxesBottom: rects.filter((r) => r.w > 50 && r.w < 70 && r.h > 10 && r.y >= 50).length,
          goalFrames: rects.filter((r) => r.w > 8 && r.w < 12).length,
          boardAspect: +(box.height / box.width).toFixed(3),
          boardSize: `${Math.round(box.width)}x${Math.round(box.height)}`,
        };
      })
    : { error: '피치 배치 보드 없음' };

  const full = `${OUT}/lineup-${vp.key}.png`;
  await page.screenshot({ path: full, fullPage: false });
  let closeup = null;
  if (hasBoard) {
    closeup = `${OUT}/pitch-${vp.key}.png`;
    await board.screenshot({ path: closeup }).catch(() => { closeup = null; });
  }

  results.push({ viewport: vp.key, hasBoard, full, closeup, ...probe });
  console.log(`[${vp.key}] board=${hasBoard} ${JSON.stringify(probe)}`);
  await ctx.close();
}

await browser.close();

// 기대값 대조 — 풀 구장이면 반드시 성립해야 하는 것들
console.log('\n=== 검증 ===');
let fail = 0;
for (const r of results) {
  // 보드를 못 찾은 건 "검증할 게 없다"가 아니라 검증 실패다 — 여기서 조용히 넘어가면
  // 캡처가 엉뚱한 화면을 찍고도 ALL PASS 가 찍힌다(fail-open).
  if (!r.hasBoard) { fail++; console.log(`FAIL  [${r.viewport}] 피치 배치 보드를 찾지 못함 — 캡처 대상 화면이 아님`); continue; }
  const half = r.halfwayLines?.find((l) => l.y1 === 50 && l.y2 === 50);
  const checks = [
    ['하프라인이 정중앙(y=50)', !!half],
    ['위쪽 페널티박스 존재', r.penaltyBoxesTop === 1],
    ['아래쪽 페널티박스 존재', r.penaltyBoxesBottom === 1],
    ['골대 2개(양 진영)', r.goalFrames === 2],
    ['ellipse 4개(센터서클·센터스폿·페널티스폿 2)', r.ellipseCount === 4],
    ['path 6개(페널티아크 2·코너 4)', r.pathCount === 6],
    ['찌그러지는 circle 0개', r.circleCount === 0],
  ];
  for (const [label, ok] of checks) {
    if (!ok) fail++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  [${r.viewport}] ${label}`);
  }
}
writeFileSync(`${OUT}/probe.json`, JSON.stringify(results, null, 2));
console.log(`\n${fail === 0 ? 'ALL PASS' : fail + ' FAIL'}  · 결과: ${OUT}`);
