/**
 * [리그 목록 리디렉트] `/league-matches` 만 통합 목록으로 넘어가고 **하위 화면은 그대로**인가.
 *
 * ## 판정 축은 "넘어가는 것"이 아니라 **"안 넘어가는 것"**이다
 * 리다이렉트가 걸렸는지는 쉽게 참이 된다 — **경로 전체를 넘겨도 참이다.** 사용자가 고른
 * A안은 *"목록만 넘기고 상세·경기·시상은 그대로"* 이고, 특히 **시상은 대회 쪽에 대응 화면이
 * 아예 없다** — 넘어가면 갈 곳이 없다.
 *
 * ## ⚠️ HTTP 상태코드로 판정하면 **아무것도 못 가른다** (2026-09-02 실사고)
 * 처음엔 `fetch(..., { redirect: 'manual' })` 로 3xx + Location 을 봤다. **전부 200 이 나와서
 * "리다이렉트가 안 걸렸다"고 오판했다.** 실제로는 브라우저에서 완벽히 동작하고 있었다 —
 * Next 의 서버 컴포넌트 `redirect()` 는 **스트리밍 중이면 200 으로 내보내고** 이동은 클라이언트가
 * 한다(이 저장소의 알려진 함정).
 *
 * 더 나쁜 건 반대쪽이었다: 그 방법으로는 하위 화면의 200 도 *"안 넘어갔다"* 가 아니라
 * **"넘어갔어도 200"** 이라 ✅ 가 **vacuous** 였다 — 정작 이 하네스의 핵심 판정이
 * 참·거짓을 못 가르고 있었다. 그래서 **실제 브라우저의 최종 URL**로 판정한다.
 *
 * ```
 * state=active     → status=in_progress   옮긴다
 * state=archived   → (없음)                모르는 값은 버린다 (서버가 @IsIn → 400)
 * sportId=<uuid>   → 그대로
 * sportId=쓰레기    → (없음)                UUID 아니면 버린다 (서버가 @IsUUID → 400)
 * ```
 *
 * ## 이 하네스가 덮지 않는 것
 * ```
 * 렌더 내용   URL 만 본다. 목록이 실제로 그려지는지는 캡처 하네스의 몫.
 * 307 vs 308  브라우저 캐시 동작은 못 잰다.
 * ```
 *
 * 사용: node scripts/verify-alpha-league-list-redirect.mjs
 */
import { chromium } from 'playwright';

const BASE = 'https://alpha.teameet.co.kr';
const PACE_MS = 1_500; // alpha 는 과한 연속 요청에 전면 403 을 건다
const SETTLE_MS = 3_000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function servingCommit() {
  const res = await fetch(`${BASE}/landing`, { method: 'HEAD' });
  return res.headers.get('x-teameet-commit') ?? '(헤더 없음)';
}

/** 쿼리를 정렬해 비교 가능한 형태로 — 순서에 기대지 않는다. */
function normalize(url) {
  const [path, qs] = url.replace(BASE, '').split('?');
  const q = [...new URLSearchParams(qs ?? '').entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('&');
  return q === '' ? path : `${path}?${q}`;
}

async function main() {
  const before = await servingCommit();
  console.log(`서빙(전)  ${before}\n`);

  // 하위 화면 판정에 쓸 실제 id — 하드코딩하면 데이터가 바뀔 때 죽는다.
  const listRes = await fetch(`${BASE}/api/v1/league-matches?limit=20`);
  if (!listRes.ok) {
    console.log(`⚠️ 리그 목록 API HTTP ${listRes.status} — 판정 중단.`);
    process.exitCode = 2;
    return;
  }
  const leagues = (await listRes.json()).data.items;
  const league = leagues.find((l) => l.state === 'active') ?? leagues[0];
  if (league === undefined) {
    console.log('⚠️ 리그가 0건이다 — 판정 중단.');
    process.exitCode = 2;
    return;
  }
  const id = league.leagueId;

  /**
   * 대진은 **상세 응답에 embedded 된 `fixtures`** 다 — `/:id/fixtures` 하위 리소스가 아니다(실측 404).
   * 처음에 그 경로를 찔러 404 를 *"대진 0건"* 으로 보고했는데 실제로는 1건 있었다.
   * **못 찾은 것과 없는 것은 다르다** — 없다고 단정하기 전에 경로부터 의심해라.
   */
  const detailRes = await fetch(`${BASE}/api/v1/league-matches/${id}`);
  const fixtures = detailRes.ok ? ((await detailRes.json()).data.fixtures ?? []) : null;
  const fixture = fixtures === null ? undefined : fixtures[0];

  const browser = await chromium.launch();
  const rows = [];
  try {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();

    /** 실제로 브라우저를 태워 **최종 URL**을 본다. 상태코드로는 못 가른다(위 주석 참조). */
    const land = async (path) => {
      await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
      await page.waitForTimeout(SETTLE_MS);
      const landed = normalize(page.url());
      await sleep(PACE_MS);
      return landed;
    };

    // ── 목록은 넘어간다 + 아는 값만 옮긴다
    for (const [항목, path, 기대] of [
      ['목록 ?state=active', '/league-matches?state=active', '/tournaments?kind=league&status=in_progress'],
      ['목록 ?state=archived', '/league-matches?state=archived', '/tournaments?kind=league'],
      ['목록 ?sportId=쓰레기', '/league-matches?sportId=not-a-uuid', '/tournaments?kind=league'],
      ['목록 (쿼리 없음)', '/league-matches', '/tournaments?kind=league'],
    ]) {
      const landed = await land(path);
      rows.push({ 항목, 착지: landed, 기대, 판정: landed === 기대 ? '✅' : '❌' });
    }

    // ── 하위 화면은 **안 넘어간다** — 이 하네스의 핵심
    const subs = [
      ['상세 /:id', `/league-matches/${id}`],
      ['시상 /:id/awards', `/league-matches/${id}/awards`],
    ];
    if (fixture !== undefined) subs.push(['경기 /:id/fixtures/:fid', `/league-matches/${id}/fixtures/${fixture.teamMatchId}`]);
    for (const [항목, path] of subs) {
      const landed = await land(path);
      rows.push({ 항목, 착지: landed === path ? '(그대로)' : landed, 기대: '그대로', 판정: landed === path ? '✅' : '❌ 넘어갔다' });
    }
    if (fixture === undefined) {
      rows.push({ 항목: '경기 /:id/fixtures/:fid', 착지: '-', 기대: '그대로', 판정: fixtures === null ? '⚠️ 상세 API 실패 — 못 쟀다' : '⚠️ 이 리그에 대진이 없다 — 못 쟀다' });
    }
    await ctx.close();
  } finally {
    await browser.close();
  }

  console.table(rows);
  console.log(`  하위 화면 판정에 쓴 리그: ${id.slice(0, 8)}… (state=${league.state})`);

  const after = await servingCommit();
  console.log(`\n서빙(후)  ${after}`);
  const headerMissing = before === '(헤더 없음)' || after === '(헤더 없음)';
  if (headerMissing) console.log('⚠️ 서빙 커밋 헤더를 못 읽었다 — 배포 창인지 rate limit 인지 못 가른다.');
  else if (before !== after) console.log('⚠️ 측정 도중 서빙본이 바뀌었다 — 버리고 다시 돌려라.');

  const harness = rows.filter((r) => String(r.판정).startsWith('⚠️')).length;
  const failed = rows.filter((r) => String(r.판정).startsWith('❌')).length;
  if (harness > 0) console.log(`⚠️ 못 잰 항목 ${harness}건 — 그 자리에 대해 판정하지 마라.`);
  if (failed > 0 || headerMissing || before !== after) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e instanceof Error ? (e.stack ?? e.message) : String(e));
  process.exitCode = 2;
});
