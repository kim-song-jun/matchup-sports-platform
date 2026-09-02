/**
 * [예정 상태 필터] `?status=draft` 가 **리그에만** 걸리는가를 alpha 에서 값으로 판정한다.
 *
 * ## 왜 세 조합을 다 봐야 하나
 * `status=draft` 를 열면 *"리그가 나온다"* 는 쉽게 참이 된다 — **draft 를 통째로 열어도 참이다.**
 * 판정이 성립하려면 **안 열려야 하는 두 조합**이 함께 참이어야 한다:
 * ```
 * kind=league&status=draft        리그 예정만 나온다
 * kind=tournament&status=draft    빈 목록          ← 대회 비공개가 새면 안 된다
 * status=draft (kind 없음)         빈 목록          ← 기본이 대회 surface 다. 여기가 제일 위험하다
 * ```
 *
 * ## 왜 400 이 아니라 200 + 빈 목록인가
 * 안전성의 근거가 다르다. 400 은 *"검증이 막아 준다"* 이고, 빈 목록은 *"조건이 서로 모순이라
 * 나올 수가 없다"* 다 — **후자는 검증을 누가 풀어도 안 샌다.** 그리고 이 저장소의 다른 교차
 * 필터(대회 탭 + 리그 전용 종목)도 400 이 아니라 빈 목록이라 규칙이 갈리지 않는다.
 *
 * ⚠️ 그래서 **빈 목록이 "기능이 없다" 가 아니라 "정확히 막혔다" 는 증거**다. 두 조합이 빈 것을
 * 결함으로 읽지 마라 — 그게 통과 조건이다.
 *
 * ## 이 하네스가 덮지 않는 것
 * ```
 * 화면        API 만 본다. 칩이 실제로 그려지는지는 별개다.
 * 상태 매핑   리디렉트가 `active → in_progress` 로 옮기는지는 2단계에서 잰다.
 * ```
 *
 * 사용: node scripts/verify-alpha-draft-status-filter.mjs
 */
const BASE = 'https://alpha.teameet.co.kr';
const API = `${BASE}/api/v1`;

/**
 * ⚠️ **403/429 는 화면 결함이 아니라 "못 쟀다" 다** — 그 자리에서 실행을 끊는다.
 * alpha 는 과한 연속 요청에 **전면 403** 을 1분간 건다. 그걸 표에 `❌ HTTP 403` 으로 적으면
 * *"기능이 막혔다"* 로 읽히고, 이 하네스가 주석으로 선언한 ⚠️/❌ 분리를 스스로 어긴다.
 * 한 요청이 403 이면 그 뒤 요청도 거의 다 403 이라 **그 실행의 판정 전체를 못 쓴다** —
 * 남은 행을 마저 채워 표를 그리는 것이 오히려 위험하다.
 */
function assertMeasurable(res, path) {
  if (res.status === 403 || res.status === 429) {
    throw new Error(`HARNESS: ${path} → HTTP ${res.status} (rate limit) — 못 쟀다. 화면에 대해 판정하지 마라.`);
  }
}

async function query(qs) {
  const res = await fetch(`${API}/tournaments?limit=50&${qs}`);
  assertMeasurable(res, `/tournaments?${qs}`);
  if (!res.ok) return { status: res.status, items: null, kinds: null };
  const d = (await res.json()).data;
  const kinds = {};
  for (const i of d.items) kinds[i.kind ?? '(null)'] = (kinds[i.kind ?? '(null)'] ?? 0) + 1;
  return { status: res.status, items: d.items.length, kinds };
}
async function servingCommit() {
  const res = await fetch(`${BASE}/landing`, { method: 'HEAD' });
  return res.headers.get('x-teameet-commit') ?? '(헤더 없음)';
}

async function main() {
  const before = await servingCommit();
  console.log(`서빙(전)  ${before}\n`);

  const a = await query('kind=league&status=draft');
  const b = await query('kind=tournament&status=draft');
  const c = await query('status=draft');
  const ctl = await query('status=in_progress'); // 대조군: 종전 동작이 그대로인가

  const onlyLeague = a.kinds !== null && Object.keys(a.kinds).every((k) => k === 'regular_league');
  /**
   * **판정은 "200 이냐"가 아니라 "리그 아닌 게 있냐"다.** 200+빈 목록과 200+대회 draft 는
   * 상태코드가 같아서, 개수만 보면 *"막혔다"* 와 *"샜다"* 를 못 가른다. 그리고 개수 기준은
   * 나중에 기본 표면이 바뀌면 멀쩡한 동작을 ❌ 로 만든다 — 지켜야 하는 성질은 **종류**다.
   */
  const nonLeague = (r) => (r.kinds === null ? null : Object.entries(r.kinds).filter(([k]) => k !== 'regular_league').reduce((n, [, v]) => n + v, 0));

  const rows = [
    {
      항목: 'kind=league&status=draft',
      값: a.status === 200 ? `200 · ${a.items}건 ${JSON.stringify(a.kinds)}` : `HTTP ${a.status}`,
      기대: '200 · 리그만',
      판정: a.status === 200 && a.items > 0 && onlyLeague ? '✅' : a.status !== 200 ? `❌ HTTP ${a.status}` : '❌ 리그 아닌 것이 섞였다',
    },
    {
      /**
       * ⚠️ **종류만 보면 반대 방향으로 샌 것을 못 잡는다.** 예전엔 `nonLeague === 0` 만 봤는데,
       * 그러면 `kind=tournament` 필터가 깨져 **리그가 대회 탭에 섞여 들어와도** ✅ 가 된다
       * (샌 게 리그라서 `nonLeague` 는 여전히 0 이다). 위 주석이 *"빈 목록"* 이라고 약속해 놓고
       * 판정은 그걸 강제하지 않던 자리다 — **문장과 판정이 어긋나 있었다.**
       * 그래서 둘 다 본다: **개수 0**(주석이 약속한 것) + **리그 아닌 것 0**(원래 축).
       * `kind=tournament` 는 명시 필터라 기대 개수 0 이 표면 기본값과 무관하다.
       */
      항목: 'kind=tournament&status=draft',
      값: b.status === 200 ? `200 · ${b.items}건 ${JSON.stringify(b.kinds)}` : `HTTP ${b.status}`,
      기대: '빈 목록 (리그도 대회도 0)',
      판정:
        b.status !== 200
          ? `❌ HTTP ${b.status}`
          : b.items !== 0
            ? `❌ ${b.items}건 나왔다 ${JSON.stringify(b.kinds)} — 대회 탭에 draft 가 보인다`
            : nonLeague(b) === 0
              ? '✅'
              : `❌ 대회 draft 가 ${nonLeague(b)}건 샜다`,
    },
    {
      항목: 'status=draft (kind 없음)',
      값: c.status === 200 ? `200 · ${c.items}건 ${JSON.stringify(c.kinds)}` : `HTTP ${c.status}`,
      기대: '빈 목록 (기본 표면은 대회다)',
      판정:
        c.status !== 200
          ? `❌ HTTP ${c.status}`
          : c.items !== 0
            ? `❌ ${c.items}건 나왔다 ${JSON.stringify(c.kinds)} — 기본 표면이 바뀌었거나 draft 가 샜다`
            : nonLeague(c) === 0
              ? '✅'
              : `❌ 기본 surface 로 ${nonLeague(c)}건 샜다`,
    },
    {
      항목: '대조군 · status=in_progress',
      값: ctl.status === 200 ? `200 · ${ctl.items}건` : `HTTP ${ctl.status}`,
      기대: '200 · >0',
      판정: ctl.status === 200 && ctl.items > 0 ? '✅' : '❌ 종전 동작이 깨졌다',
    },
  ];
  console.table(rows);

  const after = await servingCommit();
  console.log(`서빙(후)  ${after}`);
  const headerMissing = before === '(헤더 없음)' || after === '(헤더 없음)';
  if (headerMissing) console.log('⚠️ 서빙 커밋 헤더를 못 읽었다 — 배포 창인지 rate limit 인지 못 가른다.');
  else if (before !== after) console.log('⚠️ 측정 도중 서빙본이 바뀌었다 — 버리고 다시 돌려라.');

  const failed = rows.filter((r) => String(r.판정).startsWith('❌')).length;
  if (failed > 0 || headerMissing || before !== after) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e instanceof Error ? (e.stack ?? e.message) : String(e));
  process.exitCode = 2;
});
