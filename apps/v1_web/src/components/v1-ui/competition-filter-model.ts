import type { CompetitionFilterOption, CompetitionFilterSheetModel } from './competition-filter-sheet';

/**
 * 대회 목록 필터의 **URL ↔ 화면** 변환. 순수 함수라 화면 없이 검증된다.
 *
 * ## 상태값이 축마다 다르다 — 여기서 한 번만 옮긴다
 * ```
 * 리그 축(V1LeagueState)   draft · active · completed
 * 대회 축(목록 status)      draft · open · closed · in_progress · completed
 * ```
 * `/league-matches` 리다이렉트가 고른 상태를 넘길 때 `active` 를 그대로 주면 **서버가 400**
 * 이다. 그래서 매핑을 이 파일에 상수로 두고 **단방향으로만** 쓴다 — 역방향은 필요 없고,
 * 만들어 두면 누군가 쓴다.
 */
export const LEAGUE_STATE_TO_LIST_STATUS = {
  draft: 'draft',
  active: 'in_progress',
  completed: 'completed',
} as const;

export type LeagueState = keyof typeof LEAGUE_STATE_TO_LIST_STATUS;

/**
 * 리그 축 상태를 목록 status 로 옮긴다. **모르는 값은 `null`** — 조용히 통과시키지 않는다.
 * 통과시키면 서버에서 400 이 나고, 그때는 원인이 URL 인지 화면인지 구분이 안 된다.
 */
export function leagueStateToListStatus(state: string | null | undefined): string | null {
  if (state === null || state === undefined) return null;
  return state in LEAGUE_STATE_TO_LIST_STATUS
    ? LEAGUE_STATE_TO_LIST_STATUS[state as LeagueState]
    : null;
}

/** 사용자가 확정한 칩 넷. `null` 은 '전체'(파라미터 없음)다. */
export const COMPETITION_STATUS_FILTERS: ReadonlyArray<{ value: string | null; label: string }> = [
  { value: null, label: '전체' },
  { value: 'in_progress', label: '진행 중' },
  { value: 'draft', label: '준비 중' },
  { value: 'completed', label: '종료' },
];

const FILTER_PARAM = 'filter';

/** 현재 URL 을 유지하면서 파라미터 하나만 바꾼 링크. 시트가 URL 로 동작하니 전부 링크다. */
function hrefWith(
  base: string,
  current: URLSearchParams,
  changes: Record<string, string | null>,
): string {
  const next = new URLSearchParams(current);
  for (const [key, value] of Object.entries(changes)) {
    if (value === null) next.delete(key);
    else next.set(key, value);
  }
  const query = next.toString();
  return query.length > 0 ? `${base}?${query}` : base;
}

export function buildCompetitionFilterModel(input: {
  readonly basePath: string;
  readonly params: URLSearchParams;
  readonly sports: ReadonlyArray<{ id: string; label: string }>;
}): CompetitionFilterSheetModel {
  const { basePath, params, sports } = input;
  const activeStatus = params.get('status');
  const activeSportId = params.get('sportId');

  // 시트를 여닫는 것도 URL 이다 — `?filter=1` 이 열림이고, 지우면 닫힌다.
  const openHref = hrefWith(basePath, params, { [FILTER_PARAM]: '1' });
  const closeHref = hrefWith(basePath, params, { [FILTER_PARAM]: null });
  // 초기화는 **필터만** 지운다. `kind`(유형 세그먼트)는 남긴다 — 그건 "어느 목록을 보는가"
  // 라서 필터가 아니라 목록의 정체다. 함께 지우면 리그 탭에서 초기화했는데 대회로 튄다.
  const resetHref = hrefWith(basePath, params, {
    status: null,
    sportId: null,
    [FILTER_PARAM]: null,
  });

  const statusOptions: CompetitionFilterOption[] = COMPETITION_STATUS_FILTERS.map((option) => ({
    label: option.label,
    value: option.value ?? 'all',
    href: hrefWith(basePath, params, { status: option.value }),
    active: (activeStatus ?? null) === option.value,
  }));

  const sportOptions: CompetitionFilterOption[] = [
    {
      label: '전체',
      value: 'all',
      href: hrefWith(basePath, params, { sportId: null }),
      active: activeSportId === null,
    },
    ...sports.map((sport) => ({
      label: sport.label,
      value: sport.id,
      href: hrefWith(basePath, params, { sportId: sport.id }),
      active: activeSportId === sport.id,
    })),
  ];

  const statusLabel = COMPETITION_STATUS_FILTERS.find(
    (option) => option.value === (activeStatus ?? null),
  )?.label;
  const sportLabel = activeSportId
    ? sports.find((sport) => sport.id === activeSportId)?.label
    : undefined;

  // 요약 문구 — 고른 것만 적는다. 둘 다 기본이면 '전체'.
  // ⚠️ `activeStatus` 가 우리가 모르는 값이면 `statusLabel` 이 undefined 다. 그때 그 값을
  // 그대로 적으면 URL 문자열이 화면에 새므로, 라벨이 있는 것만 싣는다.
  const parts = [statusLabel && statusLabel !== '전체' ? statusLabel : null, sportLabel ?? null]
    .filter((part): part is string => part !== null && part.length > 0);

  return {
    openHref,
    closeHref,
    resetHref,
    statusOptions,
    sportOptions,
    summary: parts.length > 0 ? parts.join(' · ') : '전체',
    activeCount: parts.length,
  };
}
