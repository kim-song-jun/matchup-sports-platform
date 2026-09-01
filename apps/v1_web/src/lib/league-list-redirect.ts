import { leagueStateToListStatus } from '@/components/v1-ui/competition-filter-model';
import { isUuid } from '@/lib/uuid';

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
 *
 * 이 원칙은 **두 축 모두**에 걸린다. `state` 만 거르고 `sportId` 를 그냥 넘기면 같은 400 이
 * 종목 쪽으로 남는다 — 서버 DTO 가 `@IsUUID()` 라 UUID 가 아닌 값은 전부 400 이다.
 */
export function buildLeagueListRedirect(params: {
  readonly state?: string | string[] | null;
  readonly sportId?: string | string[] | null;
}): string {
  const query = new URLSearchParams({ kind: 'league' });

  /* 매핑도 **가드도** 한 곳에 둔다. 여기서 `Object.hasOwn` 을 다시 쓰면 표는 공유해도
     **프로토타입 방어가 두 벌**이 되어, 가드를 손보거나 리그 상태가 늘 때 한쪽만 고쳐진다. */
  const status = leagueStateToListStatus(firstValue(params.state));
  if (status !== null) query.set('status', status);

  /* 종목은 이름도 값도 같아 옮기기만 하면 되지만, 형태는 서버와 맞춰야 한다 — DTO 가
     `@IsUUID()` 라 빈 문자열뿐 아니라 **UUID 아닌 값 전부**가 400 이다. 판정은 서버 규칙을
     그대로 미러한 `isUuid` 에 맡긴다(더 엄격하면 멀쩡한 종목이 조용히 사라진다). */
  const sportId = firstValue(params.sportId);
  if (isUuid(sportId)) query.set('sportId', sportId);

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
