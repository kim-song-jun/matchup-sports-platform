import type { CompetitionKind } from '@/components/v1-ui/competition-kind-segment';
import type { V1TournamentListItem, V1TournamentListPage } from '@/types/api';

export const DISCOVERY_FILTER_KEYS = ['phase', 'registration', 'sportId', 'genderCategory', 'dateFrom', 'dateTo', 'format', 'feeMin', 'feeMax'] as const;
export const DISCOVERY_QUERY_KEYS = [...DISCOVERY_FILTER_KEYS, 'status', 'sort'] as const;
export const COMPETITION_SORTS = [
  { value: 'latest', label: '최신 등록순' },
  { value: 'deadline', label: '마감 가까운 순' },
  { value: 'scheduled', label: '개최 가까운 순' },
] as const;
export type CompetitionSort = typeof COMPETITION_SORTS[number]['value'];
export type CompetitionDiscoveryFilters = {
  kind: CompetitionKind;
  phase?: 'upcoming' | 'ongoing' | 'completed';
  registration?: 'open' | 'closed';
  sportId?: string;
  genderCategory?: 'mixed' | 'male' | 'female' | 'unspecified';
  dateFrom?: string;
  dateTo?: string;
  format?: 'league' | 'knockout' | 'group_knockout';
  feeMin?: number;
  feeMax?: number;
  sort?: CompetitionSort;
};
export type CompetitionDiscoveryItem = V1TournamentListItem & { registrationOpen?: boolean };
export type CompetitionDiscoveryPage = Omit<V1TournamentListPage, 'items'> & { items: CompetitionDiscoveryItem[] };

function choice<T extends string>(raw: string | null, values: readonly T[]): T | undefined {
  return values.includes(raw as T) ? raw as T : undefined;
}
function date(raw: string | null): string | undefined {
  if (!raw || !/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(raw)) return undefined;
  const parsed = new Date(`${raw}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === raw ? raw : undefined;
}
function amount(raw: string | null): number | undefined {
  return raw !== null && /^\d+$/.test(raw) && Number(raw) <= 2147483647 ? Number(raw) : undefined;
}

/** 기존 status 링크를 진행·모집 축으로 옮기고 알려진 입력만 서버에 전달한다. */
export function readCompetitionDiscovery(params: URLSearchParams, kind: CompetitionKind): CompetitionDiscoveryFilters {
  const tournamentCondition = choice(params.get('genderCategory'), ['male', 'female', 'mixed', 'unspecified'] as const)
    || choice(params.get('format'), ['league', 'knockout', 'group_knockout'] as const)
    || amount(params.get('feeMin')) !== undefined || amount(params.get('feeMax')) !== undefined;
  // 기존 전체 탭의 부문 공유 링크는 대회 탭으로 명확히 좁혀 조건을 보존한다.
  const effectiveKind = kind === 'all' && tournamentCondition ? 'tournament' : kind;
  const sort = choice(params.get('sort'), ['latest', 'deadline', 'scheduled'] as const);
  const legacy = params.get('status');
  const legacyPhase = legacy === 'draft' ? 'upcoming' : legacy === 'in_progress' ? 'ongoing' : legacy === 'completed' ? 'completed' : undefined;
  const legacyRegistration = legacy === 'open' ? 'open' : legacy === 'closed' ? 'closed' : undefined;
  return {
    kind: effectiveKind,
    phase: choice(params.get('phase'), ['upcoming', 'ongoing', 'completed'] as const) ?? legacyPhase,
    registration: sort === 'deadline' ? 'open' : choice(params.get('registration'), ['open', 'closed'] as const) ?? legacyRegistration,
    sportId: params.get('sportId') || undefined,
    sort,
    dateFrom: date(params.get('dateFrom')),
    dateTo: date(params.get('dateTo')),
    ...(effectiveKind === 'tournament' ? {
      genderCategory: choice(params.get('genderCategory'), ['male', 'female', 'mixed', 'unspecified'] as const),
      format: choice(params.get('format'), ['league', 'knockout', 'group_knockout'] as const),
      feeMin: amount(params.get('feeMin')),
      feeMax: amount(params.get('feeMax')),
    } : {}),
  };
}

export function competitionDiscoveryHref(filters: CompetitionDiscoveryFilters, extras?: { filter?: boolean; cleared?: boolean; page?: number }): string {
  const params = new URLSearchParams();
  if (filters.kind !== 'all') params.set('kind', filters.kind);
  for (const key of [...DISCOVERY_FILTER_KEYS, 'sort'] as const) {
    const value = filters[key];
    if (value !== undefined && !(key === 'sort' && value === 'latest')) params.set(key, String(value));
  }
  if (extras?.page && extras.page > 1) params.set('page', String(extras.page));
  if (extras?.filter) params.set('filter', '1');
  if (extras?.cleared) params.set('notice', 'type-filters-cleared');
  return `/tournaments${params.size ? `?${params}` : ''}`;
}

export function switchCompetitionKind(filters: CompetitionDiscoveryFilters, kind: CompetitionKind): CompetitionDiscoveryFilters {
  if (kind === 'tournament') return { ...filters, kind };
  const { genderCategory: _gender, format: _format, feeMin: _min, feeMax: _max, ...common } = filters;
  return { ...common, kind };
}

/** 어느 칸의 범위가 틀렸는지 함께 돌려줘 시트가 그 칸 바로 밑에 안내를 띄운다. */
export function discoveryRangeError(filters: CompetitionDiscoveryFilters): { field: 'date' | 'fee'; message: string } | null {
  if (filters.dateFrom && filters.dateTo && filters.dateFrom > filters.dateTo) return { field: 'date', message: '종료 날짜는 시작 날짜 이후로 선택해 주세요.' };
  if (filters.feeMin !== undefined && filters.feeMax !== undefined && filters.feeMin > filters.feeMax) return { field: 'fee', message: '최대 참가비는 최소 참가비 이상으로 입력해 주세요.' };
  return null;
}


/** 서버 seed와 클라이언트가 같은 정규화된 필터·정렬로 첫 페이지를 요청한다. */
export function competitionDiscoverySeedPath(filters: CompetitionDiscoveryFilters, sports: ReadonlyArray<{ id: string }>): string | null {
  if (filters.sportId && sports.length === 0) return null;
  const params = new URLSearchParams();
  params.set('kind', filters.kind);
  params.set('limit', '20');
  for (const key of [...DISCOVERY_FILTER_KEYS, 'sort'] as const) {
    const value = filters[key];
    if (key === 'sportId' && !sports.some((sport) => sport.id === value)) continue;
    if (value !== undefined) params.set(key, String(value));
  }
  params.set('sort', filters.sort ?? 'latest');
  params.set('withTotal', 'true');
  return `/tournaments?${params}`;
}
