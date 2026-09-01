// 느린 탭 전환의 원인을 "요청이 많다" 와 "서버가 느리다" 로 가른다.
// 각 API 응답의 실제 소요시간과, 클릭 이후 언제 발사됐는지(워터폴 깊이)를 잰다.
import { chromium } from 'playwright';
const ORIGIN = process.env.ALPHA_ORIGIN ?? 'https://alpha.teameet.co.kr';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();

let t0 = 0, rows = [];
page.on('requestfinished', async (r) => {
  if (!/\/api\/v1\//.test(r.url())) return;
  const timing = r.timing();
  rows.push({
    path: new URL(r.url()).pathname,
    firedAt: Math.round(Date.now() - t0),
    ms: Math.round(timing.responseEnd - timing.requestStart),
  });
});

async function run(from, toHref, label) {
  await page.goto(`${ORIGIN}${from}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  rows = []; t0 = Date.now();
  await page.click(`.tm-bottom-tab[href="${toHref}"]`);
  await page.waitForTimeout(7000);
  const total = rows.length;
  const slowest = [...rows].sort((a, b) => b.ms - a.ms).slice(0, 3);
  const lastFired = Math.max(0, ...rows.map((r) => r.firedAt));
  const sumMs = rows.reduce((n, r) => n + r.ms, 0);
  console.log(`\n■ ${label}`);
  console.log(`   API ${total}회 · 응답시간 합 ${sumMs}ms · 마지막 요청이 ${lastFired}ms 에 발사`);
  console.log(`   가장 느린 3개:`);
  slowest.forEach((r) => console.log(`     ${String(r.ms).padStart(5)}ms  (+${r.firedAt}ms 발사)  ${r.path}`));
  if (lastFired > 1500) console.log(`   → 마지막 요청이 ${lastFired}ms 에 나갔다 = 워터폴(앞 응답을 보고 다음을 부름)`);
  else console.log(`   → 요청이 초반에 몰려 나갔다 = 워터폴 아님, 개별 응답 지연이 원인`);
}

await run('/home', '/matches', '홈 → 매치 (383ms 로 빨랐던 화면)');
await run('/matches', '/teams', '매치 → 팀 (API 46회)');
await run('/teams', '/tournaments', '팀 → 대회 (API 3회인데 느림)');
await browser.close();
