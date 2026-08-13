// alpha 실측: 필드 담당자의 전체 진입 동선을 처음부터 끝까지 걷는다(항목 0 최종 증명).
//
//   ALPHA_SESSION_TOKEN="$(cat /private/tmp/alpha_staff.cookie)" \
//     node scripts/verify_alpha_staff_full_walk.mjs
//
// 링크를 "직접 URL 로 찍지 않고" 실제로 클릭해서 따라간다 — 수정 대상이 라우팅이므로
// 화면이 내주는 링크를 그대로 밟는 것이 이 검증의 핵심이다. mutation 은 보내지 않는다.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.ALPHA_BASE || 'https://alpha.teameet.co.kr';
const TOKEN = process.env.ALPHA_SESSION_TOKEN;
const OUT = process.env.OUT_DIR || '/private/tmp/alpha-staff-walk';
if (!TOKEN) { console.error('ALPHA_SESSION_TOKEN 필요'); process.exit(1); }
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 2 });
await ctx.addCookies([{
  name: 'teameet_v1_session', value: TOKEN,
  domain: 'alpha.teameet.co.kr', path: '/', httpOnly: true, secure: true, sameSite: 'Lax',
}]);
const page = await ctx.newPage();

const failed = [];
page.on('response', (r) => { if (r.status() >= 400) failed.push(`${r.status()} ${r.url().replace(BASE, '')}`); });

const settle = async (ms = 3000) => {
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(ms);
};
const steps = [];
const record = async (label) => {
  const info = await page.evaluate(() => {
    const text = document.body.innerText || '';
    return {
      path: location.pathname,
      blocked: /담당 범위 밖|권한이 없|찾을 수 없|404|Request failed/.test(text),
      head: text.slice(0, 220).replace(/\n+/g, ' | '),
    };
  });
  steps.push({ label, ...info });
  await page.screenshot({ path: `${OUT}/${steps.length}-${label}.png`, fullPage: true });
  console.log(`[${steps.length}] ${label}\n    path=${info.path} blocked=${info.blocked}\n    ${info.head}\n`);
};

try {
  // 1) 담당 대회 목록
  await page.goto(`${BASE}/my/tournament-staff`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await settle();
  await record('staff-list');

  // 2) 대회 카드를 실제로 클릭 (링크 라우팅이 이번 수정의 대상).
  //    TARGET_TITLE 로 어떤 카드를 밟을지 고른다 — 셸 역할이 섞인 대회는 운영 보드로 가는 것이
  //    정상이므로, 필드 담당자만 있는 대회를 지정해야 이번 수정 경로를 검증한다.
  const title = process.env.TARGET_TITLE ?? '이승민 test';
  const card = page.locator('a', { hasText: title }).first();
  if (await card.count() === 0) throw new Error(`'${title}' 카드를 찾지 못함`);
  await card.click({ force: true });
  await settle(3500);
  await record('after-card-click');

  // 3) 담당 경기 행을 클릭해 콘솔로
  const fixtureRow = page.locator('a[href*="/operate"]').first();
  if (await fixtureRow.count() === 0) {
    await record('no-fixture-rows');
  } else {
    await fixtureRow.click({ force: true });
    await settle(4000);
    await record('operate-console');
  }
} catch (err) {
  console.log('FATAL', String(err).slice(0, 300));
} finally {
  await browser.close();
}

console.log('===== 요약 =====');
for (const s of steps) console.log(`${s.blocked ? '❌' : '✅'} ${s.label.padEnd(20)} ${s.path}`);
console.log('실패 요청:', [...new Set(failed)].slice(0, 8));
console.log(`스크린샷: ${OUT}`);
