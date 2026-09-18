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
  // 키만으로 정렬하면 **같은 키가 여러 번** 나올 때(중복 쿼리) 비교가 입력 순서에 의존한다.
  // 값까지 정렬해 완전히 결정적으로 만든다 — 비교 대상이 흔들리면 판정도 흔들린다.
  const q = [...new URLSearchParams(qs ?? '').entries()]
    .map(([k, v]) => `${k}=${v}`)
    .sort((a, b) => a.localeCompare(b))
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
      const res = await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
      /**
       * ⚠️ **응답 상태를 안 보면 rate limit 페이지도 "착지"로 센다.** alpha 는 과한 연속 요청에
       * 전면 403 을 거는데, 그때 최종 URL 은 원래 경로 그대로라 **하위 화면 행이 ✅ 로 통과하고**
       * 목록 행은 ❌ 로 찍힌다 — 둘 다 거짓이다. URL 만 보면 "못 쟀다"와 "안 넘어갔다"가
       * 구별되지 않는다. 그래서 상태코드로 먼저 가른다(문구가 아니라 숫자로).
       */
      const status = res?.status() ?? 0;
      /**
       * ⚠️ **여기서 세 가지를 갈라야 한다 — 뭉뚱그리면 어느 쪽이든 틀린다.**
       * ```
       * 403 · 429 · 0   rate limit / 무응답 → **못 쟀다**. 실행을 끊는다(exit 2).
       * 그 외 4xx · 5xx  경로가 닫혔거나 서버 에러 → **진짜 회귀다**. ❌ 로 표에 남긴다(exit 1).
       * 2xx · 3xx       그때만 URL 을 비교한다.
       * ```
       * 처음엔 403/429 만 걸렀는데 404·500 이 URL 비교로 흘러가 **하위 화면이 vacuous-pass**
       * 했다. 그걸 고치며 `>= 400` 을 통째로 하네스 실패로 돌렸더니 이번엔 **진짜 회귀를
       * "못 쟀다"로 숨겼다.** URL 비교에서 빼는 것과 결함으로 세는 것은 다른 일이다.
       */
      if (status === 403 || status === 429 || status === 0) {
        throw new Error(`HARNESS: ${path} → HTTP ${status} (rate limit/무응답) — 못 쟀다. 화면에 대해 판정하지 마라.`);
      }
      await sleep(PACE_MS);
      if (status >= 400) return { landed: null, status };
      await page.waitForTimeout(SETTLE_MS);
      return { landed: normalize(page.url()), status };
    };

    // ── 목록은 넘어간다 + 아는 값만 옮긴다
    for (const [항목, path, 기대] of [
      ['목록 ?state=active', '/league-matches?state=active', '/tournaments?kind=league&status=in_progress'],
      ['목록 ?state=archived', '/league-matches?state=archived', '/tournaments?kind=league'],
      ['목록 ?sportId=쓰레기', '/league-matches?sportId=not-a-uuid', '/tournaments?kind=league'],
      ['목록 (쿼리 없음)', '/league-matches', '/tournaments?kind=league'],
    ]) {
      const { landed, status } = await land(path);
      rows.push({
        항목,
        착지: landed ?? `HTTP ${status}`,
        기대,
        판정: landed === null ? `❌ HTTP ${status}` : landed === 기대 ? '✅' : '❌',
      });
    }

    // ── 하위 화면은 **안 넘어간다** — 이 하네스의 핵심
    const subs = [
      ['상세 /:id', `/league-matches/${id}`],
      ['시상 /:id/awards', `/league-matches/${id}/awards`],
    ];
    if (fixture !== undefined) subs.push(['경기 /:id/fixtures/:fid', `/league-matches/${id}/fixtures/${fixture.teamMatchId}`]);
    for (const [항목, path] of subs) {
      const { landed, status } = await land(path);
      rows.push({
        항목,
        착지: landed === null ? `HTTP ${status}` : landed === path ? '(그대로)' : landed,
        기대: '그대로',
        판정: landed === null ? `❌ HTTP ${status} — 화면이 열리지 않는다` : landed === path ? '✅' : '❌ 넘어갔다',
      });
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

  /**
   * ⚠️ **exit code 가 표와 같은 말을 해야 한다.** 예전엔 `harness > 0` 일 때 문장만 찍고
   * exit 는 0 으로 끝났다 — 표엔 *"못 쟀다"* 라고 적혀 있는데 CI·자동화는 **성공으로 읽는다.**
   * 이 파일 안에 `exitCode = 2` 가 있긴 했지만 그건 `main().catch()` 쪽이라 이 경로와 무관했다.
   * (`⚠️` 와 `exitCode = 2` 가 **같은 파일에 있다**는 것만 확인하면 이 결함을 못 잡는다 —
   *  둘이 **연결됐는지**를 봐야 한다.)
   */
  const harness = rows.filter((r) => String(r.판정).startsWith('⚠️')).length;
  const failed = rows.filter((r) => String(r.판정).startsWith('❌')).length;
  if (harness > 0) {
    console.log(`⚠️ 못 잰 항목 ${harness}건 — 그 자리에 대해 판정하지 마라.`);
    process.exitCode = 2;
  } else if (headerMissing || before !== after) {
    // 배포 창의 숫자는 판정에 쓸 수 없다 — 결함(1)이 아니라 버려야 할 실행(2)이다.
    process.exitCode = 2;
  } else if (failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? (e.stack ?? e.message) : String(e));
  process.exitCode = 2;
});
