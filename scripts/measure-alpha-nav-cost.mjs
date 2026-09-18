// alpha 실측 — "탭을 바꿀 때마다 새로고침처럼 느껴진다"의 정체를 잰다.
//
// 가설 세 개를 각각 반증 가능한 형태로 구분한다:
//   H1. 전체 문서 리로드(MPA)다               → navigation 엔트리가 늘어난다
//   H2. 클라이언트 네비게이션이지만 RSC 왕복이 있다 → ?_rsc= 요청이 뜬다
//   H3. RSC 는 없고 API 만 다시 부른다          → /api/v1/* 요청이 뜬다
//
// 그리고 각 전환의 **체감 비용**을 잰다: 클릭 → 스켈레톤 → 콘텐츠까지 걸린 시간.
//
// 실행: node scripts/measure-alpha-nav-cost.mjs

import { chromium } from 'playwright';

const ORIGIN = process.env.ALPHA_ORIGIN ?? 'https://alpha.teameet.co.kr';

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
});
const page = await ctx.newPage();

// 요청을 종류별로 센다. RSC 페이로드는 ?_rsc= 쿼리로 구분된다.
let reqs = [];
page.on('request', (r) => {
  const u = r.url();
  reqs.push({
    url: u,
    kind: u.includes('_rsc=') ? 'RSC' : /\/api\/v1\//.test(u) ? 'API' : r.resourceType(),
    t: Date.now(),
  });
});

// 전체 문서 리로드 판정은 **document 리소스 요청**으로만 한다.
// page.on('framenavigated') 는 SPA 의 history.pushState 에도 발화해서 전부 거짓 YES 가 된다
// — 첫 측정에서 실제로 그렇게 오판했다.

async function goto(path) {
  await page.goto(`${ORIGIN}${path}`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await page.waitForTimeout(2500);
}

// 탭 전환 1회의 비용을 잰다.
async function measureTab(fromPath, toHref, label) {
  await goto(fromPath);
  await page.evaluate(() => {
    window.__navStart = 0;
    window.__skelSeen = false;
    window.__skelGone = 0;
  });

  reqs = [];
  const t0 = Date.now();

  await page.click(`.tm-bottom-tab[href="${toHref}"]`);

  // 두 대기를 **동시에** 건다. 순차로 걸면 스켈레톤이 안 뜰 때 그 타임아웃(4초)이
  // 콘텐츠 시간에 통째로 더해진다 — 첫 측정에서 4083ms 로 나온 값이 그 오염이었다.
  let tSkel = null;
  const skelP = page
    .waitForFunction(() => document.querySelectorAll('.tm-skeleton').length > 0, null, { timeout: 4000 })
    .then(() => { tSkel = Date.now(); return true; })
    .catch(() => false);

  // 콘텐츠 도착: 목록 카드나 본문이 실제로 그려진 시점. 스켈레톤 소멸만 보면
  // 애초에 스켈레톤이 없던 화면에서 즉시 참이 되어 아무것도 재지 못한다.
  const contentP = page
    .waitForFunction(
      () => document.querySelectorAll('.tm-skeleton').length === 0
            && document.querySelectorAll('.tm-scroll-area a[href], .tm-scroll-area button').length > 2,
      null, { timeout: 20_000 },
    )
    .then(() => true)
    .catch(() => false);

  const [skelSeen, settled] = await Promise.all([skelP, contentP]);
  const t1 = Date.now();

  await page.waitForTimeout(500);

  const rsc = reqs.filter((r) => r.kind === 'RSC');
  const api = reqs.filter((r) => r.kind === 'API');
  const docs = reqs.filter((r) => r.kind === 'document');

  return {
    label,
    fullReload: docs.length > 0,
    rscCount: rsc.length,
    apiCount: api.length,
    apiPaths: [...new Set(api.map((r) => new URL(r.url).pathname))].slice(0, 6),
    skeletonShown: skelSeen,
    msToSkeleton: skelSeen ? tSkel - t0 : null,
    msToContent: settled ? t1 - t0 : null,
  };
}

const results = [];
results.push(await measureTab('/home', '/matches', '홈 → 매치'));
results.push(await measureTab('/matches', '/teams', '매치 → 팀'));
results.push(await measureTab('/teams', '/tournaments', '팀 → 대회'));

// 같은 탭으로 돌아오면 캐시가 살아 있는가 (React Query 가 이미 가진 데이터를 다시 부르는지)
await goto('/matches');
await page.click('.tm-bottom-tab[href="/teams"]');
await page.waitForTimeout(3000);
reqs = [];
const backT0 = Date.now();
await page.click('.tm-bottom-tab[href="/matches"]');
const backSettled = await page
  .waitForFunction(() => document.querySelectorAll('.tm-skeleton').length === 0, null, { timeout: 20_000 })
  .then(() => true)
  .catch(() => false);
const backMs = Date.now() - backT0;
await page.waitForTimeout(500);
const backApi = reqs.filter((r) => r.kind === 'API');
const backRsc = reqs.filter((r) => r.kind === 'RSC');

console.log('\n===== 탭 전환 비용 =====\n');
for (const r of results) {
  console.log(`■ ${r.label}`);
  console.log(`   전체 리로드      ${r.fullReload ? 'YES ← MPA' : 'NO (클라이언트 네비게이션)'}`);
  console.log(`   RSC 왕복         ${r.rscCount}회`);
  console.log(`   API 호출         ${r.apiCount}회  ${r.apiPaths.join(', ')}`);
  console.log(`   스켈레톤         ${r.skeletonShown ? `표시됨 (+${r.msToSkeleton}ms)` : '없음'}`);
  console.log(`   콘텐츠까지       ${r.msToContent != null ? r.msToContent + 'ms' : '20초 내 미완'}`);
  console.log('');
}

console.log('■ 되돌아오기 (매치 → 팀 → 매치, 캐시가 살아있나)');
console.log(`   RSC 왕복         ${backRsc.length}회`);
console.log(`   API 호출         ${backApi.length}회  ${[...new Set(backApi.map((r) => new URL(r.url).pathname))].slice(0, 6).join(', ')}`);
console.log(`   콘텐츠까지       ${backSettled ? backMs + 'ms' : '미완'}`);
console.log(`   → API 0회 + 짧은 시간이면 캐시가 살아있는 것, 그렇지 않으면 매번 다시 받는 것\n`);

await browser.close();
