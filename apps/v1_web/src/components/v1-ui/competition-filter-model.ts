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
  if (state === null || state === undefined || state === '') return null;
  // ⚠️ `in` 을 쓰면 **프로토타입 키가 통과한다** — `'toString' in M` 이 true 라
  // `?state=toString` 이 함수를 status 로 만든다. URL 은 사용자가 편집하는 입력이므로
  // 자기 키만 본다. ("모르는 값은 null" 이 원래 의도였고, 구현을 그 의도에 맞춘다.)
  return Object.hasOwn(LEAGUE_STATE_TO_LIST_STATUS, state)
    ? LEAGUE_STATE_TO_LIST_STATUS[state as LeagueState]
    : null;
}

/**
 * 사용자가 확정한 칩 넷. `null` 은 '전체'(파라미터 없음)다.
 *
 * ⚠️ **"준비 중"(draft)은 정규 리그에만 있는 상태다.** 대회의 `draft` 는 운영자 준비 중이라
 * 공개되지 않으므로, 대회 목록에서 이 칩을 고르면 **항상 0건**이다. 데이터가 새는 건
 * 아니지만(서버가 종류와 묶어서 건다) **고를 수 있는 것처럼 보이는 것**이 문제다 —
 * 사용자는 빈 목록을 "고장" 으로 읽는다.
 *
 * 그래서 **대회만 보는 탭에서는 이 칩을 그리지 않는다**(`statusFiltersFor`). 사용자 확정값
 * "칩 넷" 은 리그 맥락의 구성이었고, 대회 탭에서 draft 를 고르게 하라는 뜻이 아니었다.
 */
export const COMPETITION_STATUS_FILTERS: ReadonlyArray<{ value: string | null; label: string }> = [
  { value: null, label: '전체' },
  { value: 'in_progress', label: '진행 중' },
  { value: 'draft', label: '준비 중' },
  { value: 'completed', label: '종료' },
];

/**
 * 이 탭에서 **고를 수 있는** 상태 칩.
 *
 * `tournament` 탭은 리그를 담지 않으므로 `draft` 를 빼고, `all`·`league` 는 리그가 들어 있어
 * 그대로 둔다. 고를 수 없는 것을 안 보여주는 쪽이 빈 결과 화면을 설명하는 것보다 정직하다.
 */
export function statusFiltersFor(kind: string | null | undefined) {
  return kind === 'tournament'
    ? COMPETITION_STATUS_FILTERS.filter((option) => option.value !== 'draft')
    : COMPETITION_STATUS_FILTERS;
}

const FILTER_PARAM = 'filter';

/**
 * **URL 파라미터는 전부 사용자 입력이다.** 서버로 넘기기 전에 한 번 정규화한다 — 그러지
 * 않으면 주소 한 글자로 목록이 통째로 400 이 된다(빈 화면이 아니라 에러다).
 *
 * 지금까지 나온 세 사례가 **같은 규칙의 세 얼굴**이다:
 * ```
 * 빈 문자열   `?status=`   → null 로 접는다        (서버 400)
 * 모르는 상태  `?status=xx` → 넘기지 않는다          (서버 400)
 * 모르는 종목  `?sportId=abc` → 넘기지 않는다        (서버 400 — 실측)
 * ```
 * 파라미터가 늘어날 때마다 이 목록에 한 줄을 더한다. 세 곳이 각각 다른 이유로 고쳐졌지만
 * 뿌리는 하나다.
 */

/** 빈 문자열을 `null` 로 접는다 — 서버는 빈 값을 400 으로 거절한다(실측). */
function normalizeParam(value: string | null): string | null {
  return value === null || value === '' ? null : value;
}


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
  /* 빈 문자열은 **없는 것과 같게** 다룬다. `?status=` 같은 주소가 실제로 만들어지는데
     (사용자 편집·링크 조립 실수) 그대로 요청에 실으면 **서버가 400 을 내 목록이 통째로
     에러**가 된다(실측: `?status=` `?sportId=` `?kind=` 전부 400). 빈 상태 화면도 아니고
     에러다 — 그래서 화면 진입 지점에서 정규화한다. */
  const activeStatus = normalizeParam(params.get('status'));
  const activeSportId = normalizeParam(params.get('sportId'));

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

  const statusOptions: CompetitionFilterOption[] = statusFiltersFor(params.get('kind')).map((option) => ({
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


/**
 * URL 의 `sportId` 를 서버로 넘길지 정한다.
 *
 * 모양이 틀린 값(`abc`)은 서버가 **400** 을 내 목록이 통째로 죽는다(실측). 모양은 맞지만
 * 없는 값(임의 UUID)은 200·빈 결과라 덜 나쁘지만, 마스터 목록을 이미 들고 있으니 둘 다
 * 여기서 거른다.
 *
 * ## ⚠️ 목록이 아직 안 왔을 때는 **판단을 보류한다**
 * 로딩 중에 "모르는 값" 으로 취급하면 **링크로 공유받은 사람이 필터가 한 번 풀렸다 돌아오는
 * 깜빡임**을 본다 — 정상 링크마다 매번 생긴다. 반대로 그대로 넘기면 손상된 주소에서만
 * 잠깐 400 이 났다가 목록이 도착하며 스스로 낫는다.
 *
 * **정상 링크의 상시 깜빡임보다 손상 링크의 일시 오류가 낫다.** 그래서 보류를 택했다.
 */
export function resolveSportIdParam(input: {
  readonly raw: string | null;
  readonly sports: ReadonlyArray<{ id: string }>;
  /** 마스터 종목 목록이 **도착했는가**. 도착 전에는 판단하지 않는다. */
  readonly sportsLoaded: boolean;
}): string | undefined {
  const value = normalizeParam(input.raw);
  if (value === null) return undefined;
  if (!input.sportsLoaded) return value;
  return input.sports.some((sport) => sport.id === value) ? value : undefined;
}
