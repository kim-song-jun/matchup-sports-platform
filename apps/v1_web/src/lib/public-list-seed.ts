import type { CompetitionKind } from '@/components/v1-ui/competition-kind-segment';
import { parseCompetitionKind } from '@/components/v1-ui/competition-kind-segment';
import { resolveSportIdParam, statusFiltersFor } from '@/components/v1-ui/competition-filter-model';
import { toLevelCodes } from '@/lib/v1-levels';
import type { CursorPage, V1Sport, V1TournamentListPage } from '@/types/api';
import type { V1TournamentCampaignList } from '@/types/tournament-campaign';

/*
 * 공개 목록의 서버 seed 와 클라이언트 첫 요청이 공유하는 쿼리 값.
 * 'use client' 파일에 두면 서버 컴포넌트가 받는 것은 값이 아니라 클라이언트 참조라 여기 둔다.
 */

export const TOURNAMENT_LIST_PAGE_SIZE = 20;
export const EVENT_CAMPAIGN_PAGE_SIZE = 30;

/** 서버가 받아 둔 대회 목록 첫 페이지와, 그것을 받은 유형. 다른 유형 화면에 쓰면 안 된다. */
export type TournamentListSeed = {
  readonly kind: CompetitionKind;
  readonly page: V1TournamentListPage;
  readonly query: string;
  readonly sports: V1Sport[];
};

export type EventCampaignSeed = V1TournamentCampaignList;

/** 매치·팀매치·팀 목록의 무필터 첫 페이지와 종목 칩용 마스터 종목. */
export type CursorListSeed<T> = {
  readonly page: CursorPage<T>;
  readonly sports: V1Sport[];
  /** Effective first-page request whose response is in `page`. */
  readonly query?: string;
};

export const TEAM_LIST_PAGE_SIZE = 20;

/*
 * 클라이언트 무필터 첫 요청과 같은 쿼리다. 매치·팀매치 목록은 파라미터 없이 부르고(서버 기본 20건),
 * 팀 목록은 limit 과 includeFacets 를 붙인다 — 목록 머리의 전체 건수를 첫 렌더부터 채우려면
 * useV1TeamPages 의 첫 페이지 요청과 같은 includeFacets 가 필요하다.
 */
export const MATCH_LIST_SEED_PATH = '/matches';
export const TEAM_MATCH_LIST_SEED_PATH = '/team-matches';
export const TEAM_LIST_SEED_PATH = teamListSeedPath();

/*
 * 목록 클라이언트가 필터로 읽는 파라미터. 하나라도 값이 있으면 화면이 무필터 첫 페이지와 달라지므로
 * ItemList 를 내지 않는다 — 클라이언트에 필터 파라미터를 더하면 여기에도 더한다.
 */
const COMMON_LIST_FILTER_PARAMS = ['sportId', 'sort', 'genderRule', 'levelCodes', 'levels', 'q'] as const;
export const MATCH_LIST_FILTER_PARAMS = [...COMMON_LIST_FILTER_PARAMS, 'view', 'regionId'] as const;
export const TEAM_MATCH_LIST_FILTER_PARAMS = [...COMMON_LIST_FILTER_PARAMS, 'view', 'kind'] as const;
export const TEAM_LIST_FILTER_PARAMS = [...COMMON_LIST_FILTER_PARAMS, 'regionId'] as const;
/** The team filters that the list client actually sends after parsing its URL state. */
export function teamListQueryFilters(params: Record<string, string | string[] | undefined>): {
  sportId?: string;
  query?: string;
  joinPolicy?: 'approval_required';
  sort?: 'recommended' | 'latest';
  genderRule?: string;
  levelCodes?: string;
  regionId?: string;
} {
  const filters: ReturnType<typeof teamListQueryFilters> = {};
  const sportId = firstSearchParam(params.sportId);
  if (sportId) filters.sportId = sportId;

  const query = firstSearchParam(params.q)?.trim();
  if (query) filters.query = query;

  const sort = firstSearchParam(params.sort);
  if (sort === 'deadline') filters.joinPolicy = 'approval_required';
  if (sort === 'latest' || sort === 'recommended') filters.sort = sort;

  const genderRule = firstSearchParam(params.genderRule);
  if (genderRule === '성별 무관' || genderRule === '남' || genderRule === '여') filters.genderRule = genderRule;

  // Match `get('levelCodes') ?? get('levels')`: an explicitly blank primary value still wins.
  const levelInput = rawFirstSearchParam(params.levelCodes) ?? rawFirstSearchParam(params.levels);
  const levelCodes = toLevelCodes(levelInput ?? null);
  if (levelCodes.length > 0) filters.levelCodes = levelCodes.join(',');

  const regionId = firstSearchParam(params.regionId);
  if (regionId) filters.regionId = regionId;
  return filters;
}

/** The client and the server use this exact first-page query, including team facets. */
export function teamListSeedPath(params: Record<string, string | string[] | undefined> = {}): string {
  const query = new URLSearchParams();
  const filters = teamListQueryFilters(params);
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined) query.set(key, value);
  }
  query.set('limit', String(TEAM_LIST_PAGE_SIZE));
  query.set('includeFacets', 'true');
  return `/teams?${query.toString()}`;
}

/** Client-equivalent filters for the first tournament page; null means sport validity is unknown. */
export function tournamentListSeedPath(
  rawKind: string | null,
  params: Record<string, string | string[] | undefined> = {},
  sports: ReadonlyArray<Pick<V1Sport, 'id'>> = [],
): string | null {
  const kind = parseCompetitionKind(firstSearchParam(params.kind) ?? rawKind, rawKind === null ? 'all' : parseCompetitionKind(rawKind, 'all'));
  const sportInput = firstSearchParam(params.sportId);
  if (sportInput !== null && sports.length === 0) return null;
  const sportId = resolveSportIdParam({ raw: sportInput, sports, sportsLoaded: true });
  const statusInput = firstSearchParam(params.status);
  const status = statusInput !== null && statusFiltersFor(kind).some((option) => option.value === statusInput)
    ? statusInput
    : undefined;
  const genderInput = firstSearchParam(params.genderCategory);
  const genderCategory = genderInput === 'mixed' || genderInput === 'male' || genderInput === 'female'
    ? genderInput
    : undefined;

  const query = new URLSearchParams({ limit: String(TOURNAMENT_LIST_PAGE_SIZE), kind });
  if (status) query.set('status', status);
  if (sportId) query.set('sportId', sportId);
  if (genderCategory) query.set('genderCategory', genderCategory);
  return `/tournaments?${query.toString()}`;
}

export function eventCampaignSeedPath(): string {
  return `/tournaments/campaigns?limit=${EVENT_CAMPAIGN_PAGE_SIZE}`;
}

/** `?status=` 처럼 값이 빈 파라미터는 없는 것과 같다(클라이언트 목록과 같은 규칙). */
export function firstSearchParam(value: string | string[] | undefined): string | null {
  const raw = rawFirstSearchParam(value);
  return raw === undefined || raw === '' ? null : raw;
}

function rawFirstSearchParam(value: string | string[] | undefined): string | null | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function hasListFilter(
  params: Record<string, string | string[] | undefined>,
  keys: readonly string[],
): boolean {
  return keys.some((key) => firstSearchParam(params[key]) !== null);
}
