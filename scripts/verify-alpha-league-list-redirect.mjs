/**
 * [리그 목록 리디렉트] `/league-matches` 만 통합 목록으로 넘어가고 **하위 화면은 그대로**인가.
 *
 * ## 이 하네스의 판정 축은 "넘어가는 것"이 아니라 **"안 넘어가는 것"**이다
 * 리다이렉트가 걸렸는지는 쉽게 참이 된다 — **경로 전체를 넘겨도 참이다.** 사용자가 고른
 * A안은 *"목록만 넘기고 상세·경기·시상은 그대로"* 이고, 특히 **시상은 대회 쪽에 대응 화면이
 * 아예 없다** — 넘어가면 갈 곳이 없다. 그래서 하위 3종이 **302 가 아니라 200** 인 것이
 * 이 변경의 진짜 계약이다.
 *
 * ## 상태 보존은 "옮겼나"가 아니라 **"무엇을 버렸나"**로 잰다
 * 이 PR 의 원칙은 *"모르는 값은 버리고 목록은 연다"* 이다. 서버는 `status` 를 `@IsIn`,
 * `sportId` 를 `@IsUUID()` 로 검증하므로 **둘 다 400 을 낸다** — 옛 링크의 죽은 값을 그대로
 * 옮기면 넘어간 화면이 에러다. **리다이렉트 직후의 에러는 원인이 가장 안 보인다.**
 *
 * ```
 * state=active     → status=in_progress   옮긴다
 * state=archived   → (없음)                모르는 값은 버린다
 * sportId=<uuid>   → 그대로                 옮긴다
 * sportId=쓰레기    → (없음)                UUID 아니면 버린다
 * ```
 *
 * ## 이 하네스가 덮지 않는 것
 * ```
 * 화면 렌더    Location 헤더와 상태코드만 본다. 목록이 실제로 그려지는지는 캡처 하네스의 몫.
 * 307 vs 308  헤더로 확인은 하되, 브라우저 캐시 동작까지는 못 잰다.
 * ```
 *
 * 사용: node scripts/verify-alpha-league-list-redirect.mjs
 */
const BASE = 'https://alpha.teameet.co.kr';
const PACE_MS = 1_200; // alpha 는 과한 연속 요청에 전면 403 을 건다

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function servingCommit() {
  const res = await fetch(`${BASE}/landing`, { method: 'HEAD' });
  return res.headers.get('x-teameet-commit') ?? '(헤더 없음)';
}

/** 리다이렉트를 **따라가지 않고** 그 자리의 상태코드와 Location 을 본다. */
async function probe(path) {
  const res = await fetch(`${BASE}${path}`, { redirect: 'manual' });
  await sleep(PACE_MS);
  return { status: res.status, location: res.headers.get('location') };
}

/** Location 의 쿼리를 정렬해 비교 가능한 형태로. 순서에 기대지 않는다. */
function queryOf(location) {
  if (location === null) return null;
  const q = new URLSearchParams(location.split('?')[1] ?? '');
  return [...q.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('&');
}

async function main() {
  const before = await servingCommit();
  console.log(`서빙(전)  ${before}\n`);

  // 하위 화면 판정에 쓸 실제 id 를 공개 API 에서 가져온다 — 하드코딩하면 데이터가 바뀔 때 죽는다.
  const listRes = await fetch(`${BASE}/api/v1/league-matches?limit=20`);
  if (!listRes.ok) {
    console.log(`⚠️ 리그 목록 API HTTP ${listRes.status} — 하위 화면을 못 고른다. 판정 중단.`);
    process.exitCode = 2;
    return;
  }
  const leagues = (await listRes.json()).data.items;
  const league = leagues.find((l) => l.state === 'active') ?? leagues[0];
  if (league === undefined) {
    console.log('⚠️ 리그가 0건이다 — 하위 화면을 못 고른다. 판정 중단.');
    process.exitCode = 2;
    return;
  }
  const id = league.leagueId;

  const rows = [];
  const add = (항목, r, 기대, ok) => rows.push({ 항목, HTTP: r.status, '→': queryOf(r.location) ?? '-', 기대, 판정: ok ? '✅' : '❌' });

  // ── 1) 목록은 넘어간다 + 상태를 옮긴다
  const active = await probe('/league-matches?state=active');
  add('목록 ?state=active', active, 'kind=league&status=in_progress',
    active.status >= 300 && active.status < 400 && queryOf(active.location) === 'kind=league&status=in_progress');

  // ── 2) 모르는 상태는 **버린다** (그대로 옮기면 목적지가 400)
  const unknown = await probe('/league-matches?state=archived');
  add('목록 ?state=archived', unknown, 'kind=league (status 없음)',
    unknown.status >= 300 && unknown.status < 400 && queryOf(unknown.location) === 'kind=league');

  // ── 3) UUID 아닌 sportId 는 **버린다** (서버가 @IsUUID)
  const badSport = await probe('/league-matches?sportId=not-a-uuid');
  add('목록 ?sportId=쓰레기', badSport, 'kind=league (sportId 없음)',
    badSport.status >= 300 && badSport.status < 400 && queryOf(badSport.location) === 'kind=league');

  // ── 4) 하위 화면은 **안 넘어간다** — 이 하네스의 핵심
  for (const [label, path] of [
    ['상세 /:id', `/league-matches/${id}`],
    ['시상 /:id/awards', `/league-matches/${id}/awards`],
  ]) {
    const r = await probe(path);
    add(label, r, '200 (302 아님)', r.status === 200);
  }

  /**
   * 경기 상세는 대진이 있는 리그에서만 의미가 있다.
   *
   * ⚠️ 대진은 **상세 응답에 embedded 된 `fixtures`** 다 — `/:id/fixtures` 같은 하위 리소스가
   * 아니다(실측 404). 처음에 그 경로를 찔러 놓고 404 를 *"대진 0건"* 으로 보고했는데, 그 리그엔
   * 실제로 대진이 1건 있었다. **못 찾은 것과 없는 것은 다르다** — 없다고 단정하기 전에
   * 경로부터 의심해라. 그래서 여기서는 목록을 못 얻으면 "0건"이 아니라 **"못 쟀다"**로 적는다.
   */
  const detailRes = await fetch(`${BASE}/api/v1/league-matches/${id}`);
  await sleep(PACE_MS);
  const fixtures = detailRes.ok ? ((await detailRes.json()).data.fixtures ?? []) : null;
  const fixture = fixtures === null ? undefined : fixtures[0];
  if (fixtures === null) {
    rows.push({ 항목: '경기 /:id/fixtures/:fid', HTTP: detailRes.status, '→': '-', 기대: '200', 판정: '⚠️ 상세 API 실패 — 못 쟀다' });
  } else if (fixture === undefined) {
    rows.push({ 항목: '경기 /:id/fixtures/:fid', HTTP: '-', '→': '-', 기대: '200', 판정: '⚠️ 이 리그에 대진이 없다 — 못 쟀다' });
  } else {
    const r = await probe(`/league-matches/${id}/fixtures/${fixture.teamMatchId}`);
    add('경기 /:id/fixtures/:fid', r, '200 (302 아님)', r.status === 200);
  }

  // ── 5) 대조군: 목적지가 실제로 열리나. 넘겼는데 목적지가 죽어 있으면 넘긴 게 손해다.
  const dest = await probe('/tournaments?kind=league&status=in_progress');
  add('대조군 · 목적지', dest, '200', dest.status === 200);

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
