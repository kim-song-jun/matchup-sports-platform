/**
 * [예정 리그 노출] 예정(draft) 리그가 **통합 목록에 나오고 눌러서 열리는가**, 그리고
 * **준비 중 대회는 여전히 감춰져 있는가**를 alpha 에서 값으로 판정한다.
 *
 * ## 왜 둘을 같이 봐야 하나
 * 이 변경은 *"감추던 것을 하나만 골라 연다"* 이다. 그래서 **연 쪽만 보면 판정이 안 된다** —
 * 리그가 보이는 것은 `draft` 를 통째로 열어도 참이기 때문이다. *"대회의 준비 중은 그대로
 * 감춰져 있다"* 가 함께 참이어야 **골라 열었다**는 뜻이 된다(사용자가 명시한 조건이기도 하다).
 *
 * ## 목록에 나오는 것만으로는 부족하다
 * 2026-09-01 실측: 예정 리그는 `/tournaments/<id>` **상세가 404** 였다(일정은 200). 목록에만
 * 올리면 카드는 보이는데 **누르면 "찾을 수 없어요"** 가 뜬다 — 안 보이는 것보다 나쁘다.
 * 그래서 목록·상세를 **같이** 잰다.
 *
 * ## 이 하네스가 덮지 않는 것
 * ```
 * 화면 렌더        API 만 본다. 카드가 실제로 그려지는지는 캡처 하네스의 몫이다.
 * 리디렉트         2단계다. 여기서는 /league-matches 가 살아 있는지만 참고로 찍는다.
 * ```
 *
 * 사용:
 *   node scripts/verify-alpha-draft-league-exposure.mjs
 */
const BASE = 'https://alpha.teameet.co.kr';
const API = `${BASE}/api/v1`;

async function json(path) {
  const res = await fetch(`${API}${path}`);
  if (!res.ok) throw new Error(`GET ${path} → HTTP ${res.status}`);
  return (await res.json()).data;
}
async function status(path) {
  const res = await fetch(`${API}${path}`);
  return res.status;
}
async function servingCommit() {
  const res = await fetch(`${BASE}/landing`, { method: 'HEAD' });
  return res.headers.get('x-teameet-commit') ?? '(헤더 없음)';
}

/** 커서를 **소진할 때까지** 넘긴다 — 결과 수가 limit 과 같다고 끝이 아니다. */
async function pageAll(path, cap = 8) {
  let cursor = null;
  const out = [];
  for (let i = 0; i < cap; i += 1) {
    const sep = path.includes('?') ? '&' : '?';
    const d = await json(`${path}${sep}limit=50${cursor ? `&cursor=${cursor}` : ''}`);
    out.push(...d.items);
    const info = d.pageInfo ?? {};
    if (!info.hasNext) return out;
    cursor = info.nextCursor;
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`${path}: 커서를 ${cap} 페이지 안에 소진하지 못했다 — 판정 불가`);
}

async function main() {
  const before = await servingCommit();
  console.log(`서빙(전)  ${before}\n`);

  const leagueAxis = await pageAll('/league-matches');
  const drafts = leagueAxis.filter((i) => i.state === 'draft');
  const unified = await pageAll('/tournaments?kind=league');
  const tournaments = await pageAll('/tournaments?kind=tournament');
  const unifiedIds = new Set(unified.map((i) => i.id));

  // 합이 맞는다고 같은 집합인 것은 아니다 — **id 로 교차**한다.
  const draftShown = drafts.filter((d) => unifiedIds.has(d.leagueId)).length;
  /**
   * **한 방향만 보면 절반이다.** `35→35` 는 *"예정이 들어왔다"* 를 말하지만 *"엉뚱한 게 안
   * 섞였다"* 는 말하지 않는다. 리그 축에 없는 id 가 통합 목록에 있으면 조건이 넓게 잡힌 것이다.
   */
  const leagueAxisIds = new Set(leagueAxis.map((i) => i.leagueId));
  const strayInUnified = unified.filter((u) => !leagueAxisIds.has(u.id)).length;

  /**
   * 상세 화면은 **경로를 하나만 부르지 않는다.** 상세를 열어도 `/standings/overall` 이 닫혀
   * 있으면 순위 섹션이 에러가 된다(2026-09-01 실측: 예정 404 · 진행 200). 그래서 **형제 경로를
   * 함께** 재고, **진행 리그를 대조군으로** 나란히 둔다 — `/player-records` 처럼 *둘 다 404* 인
   * 것은 리그에 개념이 없는 것이지 결함이 아니다. 대조군이 없으면 그 구분이 안 된다.
   */
  const SIBLINGS = ['', '/standings/overall'];
  const probeAll = async (id) => {
    const out = {};
    for (const p of SIBLINGS) {
      out[p || '상세'] = await status(`/tournaments/${id}${p}`);
      await new Promise((r) => setTimeout(r, 400));
    }
    return out;
  };
  const sample = drafts.slice(0, 3);
  const detail = [];
  for (const d of sample) {
    const r = await probeAll(d.leagueId);
    detail.push({ id: d.leagueId.slice(0, 8), 상세: r['상세'], 통합순위: r['/standings/overall'] });
  }
  const activeLeague = leagueAxis.find((i) => i.state === 'active');
  const control = activeLeague ? await probeAll(activeLeague.leagueId) : null;

  // 대조군: 대회의 준비 중이 목록에 새어나오지 않았나.
  const tournamentDraft = tournaments.filter((t) => t.status === 'draft').length;
  /**
   * **통합(`all`) 목록의 draft 는 전부 리그여야 한다.** `?kind=tournament` 만 보면 그 축에서
   * 걸러졌을 뿐이고, `all` 에서 대회 draft 가 새면 그건 못 잡는다. 종류 분포로 본다.
   */
  const all = await pageAll('/tournaments?kind=all');
  const allDrafts = all.filter((i) => i.status === 'draft');
  const nonLeagueDraft = allDrafts.filter((i) => i.kind !== 'regular_league').length;

  const rows = [
    { 항목: '리그 축 전체', 값: leagueAxis.length, 기대: '88', 판정: leagueAxis.length === 88 ? '✅' : '⚠️ 데이터가 바뀌었다' },
    { 항목: '그중 예정(draft)', 값: drafts.length, 기대: '35', 판정: drafts.length === 35 ? '✅' : '⚠️ 데이터가 바뀌었다' },
    /**
     * ⚠️ 빠짐과 초과를 **갈라서** 적는다. 예전엔 `leagueAxis.length - unified.length` 를 그대로
     * 찍어 통합 목록이 더 많을 때 `-2건 빠짐` 이라는 말이 안 되는 문장이 나왔다. 판정은 맞는데
     * **원인이 반대로 읽힌다** — 빠진 게 아니라 엉뚱한 게 들어온 것이고, 그건 아래 역방향 행이
     * 잡는 결함이다. 숫자가 음수인 걸 눈치채기 전까지 없는 쪽을 찾게 된다.
     */
    {
      항목: '통합 목록의 리그',
      값: unified.length,
      기대: `${leagueAxis.length}`,
      판정:
        unified.length === leagueAxis.length
          ? '✅'
          : unified.length < leagueAxis.length
            ? `❌ ${leagueAxis.length - unified.length}건 빠짐`
            : `❌ ${unified.length - leagueAxis.length}건 더 들어왔다 (역방향 행을 보라)`,
    },
    { 항목: '예정 리그가 통합 목록에', 값: `${draftShown}/${drafts.length}`, 기대: '전부', 판정: draftShown === drafts.length ? '✅' : `❌ ${drafts.length - draftShown}건 안 보임` },
    { 항목: '예정 리그 상세(표본 3)', 값: detail.map((d) => d.상세).join(','), 기대: '200,200,200', 판정: detail.every((d) => d.상세 === 200) ? '✅' : '❌ 눌러도 안 열린다' },
    { 항목: '예정 리그 통합순위(표본 3)', 값: detail.map((d) => d.통합순위).join(','), 기대: '200,200,200', 판정: detail.every((d) => d.통합순위 === 200) ? '✅' : '❌ 상세는 열리는데 순위가 404' },
    { 항목: '대조군 · 진행 리그 두 경로', 값: control ? `${control['상세']},${control['/standings/overall']}` : '-', 기대: '200,200', 판정: control && control['상세'] === 200 && control['/standings/overall'] === 200 ? '✅' : '❌ 진행 리그가 깨졌다' },
    { 항목: '역방향 · 리그 축에 없는 id 유입', 값: strayInUnified, 기대: '0', 판정: strayInUnified === 0 ? '✅' : '❌ 엉뚱한 것이 섞였다' },
    { 항목: '대조군 · 대회 준비중 노출(kind=tournament)', 값: tournamentDraft, 기대: '0', 판정: tournamentDraft === 0 ? '✅' : '❌ 대회 draft 가 새어나왔다' },
    { 항목: '대조군 · all 의 draft 중 리그 아닌 것', 값: `${nonLeagueDraft}/${allDrafts.length}`, 기대: '0', 판정: nonLeagueDraft === 0 ? '✅' : '❌ 대회 draft 가 all 로 샜다' },
  ];
  console.table(rows);
  detail.forEach((d) => console.log(`   표본 ${d.id} 상세 ${d.상세}`));

  const after = await servingCommit();
  console.log(`\n서빙(후)  ${after}`);
  const headerMissing = before === '(헤더 없음)' || after === '(헤더 없음)';
  if (headerMissing) console.log('⚠️ 서빙 커밋 헤더를 못 읽었다 — 배포 창인지 rate limit 인지 못 가른다.');
  else if (before !== after) console.log('⚠️ 측정 도중 서빙본이 바뀌었다 — 버리고 다시 돌려라.');

  const failed = rows.filter((r) => String(r.판정).startsWith('❌')).length;
  if (failed > 0 || headerMissing || before !== after) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exitCode = 2;
});
