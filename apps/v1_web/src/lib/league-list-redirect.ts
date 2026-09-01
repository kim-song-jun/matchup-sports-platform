import { LEAGUE_STATE_TO_LIST_STATUS } from '@/components/v1-ui/competition-filter-model';

/**
 * `/league-matches`(리그 전용 목록) → `/tournaments?kind=league` 로 보낼 주소를 만든다.
 *
 * 사용자 확정(2026-09-01): *"목록을 넘길 때 **고른 상태도 함께** 넘겨줘 — 진행 중을 보던
 * 사람은 넘어가서도 진행 중"*. 그래서 쿼리를 버리지 않고 **옮긴다.**
 *
 * ## 축마다 이름이 다르다
 * ```
 * 리그 축   state=active      draft      completed
 * 목록 축   status=in_progress draft      completed
 * ```
 * `active` 를 그대로 넘기면 서버가 **400** 이다. 매핑은 이미 한 곳에 있으므로
 * (`LEAGUE_STATE_TO_LIST_STATUS`) 여기서 새로 만들지 않고 그것을 쓴다 — 두 벌이 되면
 * 한쪽만 고쳐지는 날이 온다.
 *
 * ## 모르는 값은 **버린다**
 * 주소는 사용자가 편집할 수 있고, 옛 링크에 없어진 상태가 남아 있을 수도 있다. 그대로
 * 옮기면 넘어간 화면이 400 이 되는데 — **리다이렉트 직후의 에러는 원인이 가장 안 보인다**
 * (사용자는 자기가 누른 링크가 깨졌다고 생각한다). 모르는 값은 조용히 떨어뜨리고 목록은
 * 열리게 한다.
 */
export function buildLeagueListRedirect(params: {
  readonly state?: string | string[] | null;
  readonly sportId?: string | string[] | null;
}): string {
  const query = new URLSearchParams({ kind: 'league' });

  const state = firstValue(params.state);
  if (state !== null && Object.hasOwn(LEAGUE_STATE_TO_LIST_STATUS, state)) {
    query.set('status', LEAGUE_STATE_TO_LIST_STATUS[state as keyof typeof LEAGUE_STATE_TO_LIST_STATUS]);
  }

  // 종목은 이름도 값도 같아 그대로 옮긴다. 다만 **빈 문자열은 버린다** — 서버가 400 이다.
  const sportId = firstValue(params.sportId);
  if (sportId !== null) query.set('sportId', sportId);

  return `/tournaments?${query.toString()}`;
}

/**
 * Next 의 `searchParams` 는 같은 키가 두 번 오면 배열을 준다(`?state=a&state=b`).
 * 그때 배열을 문자열로 만들면 `"a,b"` 가 되어 **아무 매핑에도 안 맞는 값**이 된다 —
 * 조용히 첫 값을 쓰는 편이 링크를 살린다.
 */
function firstValue(value: string | string[] | null | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === undefined || raw === null || raw === '' ? null : raw;
}
