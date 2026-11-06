import type { CompetitionKind } from '@/components/v1-ui/competition-kind-segment';
import { COMPETITION_STAGE_LABEL, COMPETITION_STAGES, type CompetitionStage } from '@/lib/v1-status-labels';
import type { V1TournamentListItem, V1TournamentListPage } from '@/types/api';

export const DISCOVERY_FILTER_KEYS = ['stage', 'sportId', 'genderCategory', 'dateFrom', 'dateTo', 'format', 'feeMin', 'feeMax'] as const;
export const DISCOVERY_QUERY_KEYS = [...DISCOVERY_FILTER_KEYS, 'status'] as const;
export type CompetitionDiscoveryFilters = {
  kind: CompetitionKind;
  /** 카드 오른쪽 위 상태 배지와 1:1인 상태 필터. 목록 순서는 서버가 같은 상태 그룹으로 고정한다. */
  stage?: CompetitionStage;
  sportId?: string;
  genderCategory?: 'mixed' | 'male' | 'female';
  dateFrom?: string;
  dateTo?: string;
  format?: 'league' | 'knockout' | 'group_knockout' | 'league_knockouts';
  feeMin?: number;
  feeMax?: number;
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

/** 기존 status 링크를 상태 필터로 옮기고 알려진 입력만 서버에 전달한다. 옛 phase·registration·sort 값은 읽지 않는다. */
export function readCompetitionDiscovery(params: URLSearchParams, kind: CompetitionKind): CompetitionDiscoveryFilters {
  const tournamentCondition = choice(params.get('genderCategory'), ['male', 'female', 'mixed'] as const)
    || choice(params.get('format'), ['league', 'knockout', 'group_knockout', 'league_knockouts'] as const)
    || amount(params.get('feeMin')) !== undefined || amount(params.get('feeMax')) !== undefined;
  // 기존 전체 탭의 부문 공유 링크는 대회 탭으로 명확히 좁혀 조건을 보존한다.
  const effectiveKind = kind === 'all' && tournamentCondition ? 'tournament' : kind;
  const legacy = params.get('status');
  const legacyStage = legacy === 'draft' ? 'preparing' : legacy === 'open' ? 'recruiting' : legacy === 'closed' ? 'recruit_closed'
    : legacy === 'in_progress' ? 'ongoing' : legacy === 'completed' ? 'completed' : undefined;
  const stage = choice(params.get('stage'), COMPETITION_STAGES) ?? legacyStage;
  return {
    kind: effectiveKind,
    // 대회 초안은 공개하지 않으므로 대회 탭에는 '준비 중' 상태가 없다.
    stage: effectiveKind === 'tournament' && stage === 'preparing' ? undefined : stage,
    sportId: params.get('sportId') || undefined,
    dateFrom: date(params.get('dateFrom')),
    dateTo: date(params.get('dateTo')),
    ...(effectiveKind === 'tournament' ? {
      genderCategory: choice(params.get('genderCategory'), ['male', 'female', 'mixed'] as const),
      format: choice(params.get('format'), ['league', 'knockout', 'group_knockout', 'league_knockouts'] as const),
      feeMin: amount(params.get('feeMin')),
      feeMax: amount(params.get('feeMax')),
    } : {}),
  };
}

export function competitionDiscoveryHref(filters: CompetitionDiscoveryFilters, extras?: { filter?: boolean; cleared?: boolean; page?: number }): string {
  const params = new URLSearchParams();
  if (filters.kind !== 'all') params.set('kind', filters.kind);
  for (const key of DISCOVERY_FILTER_KEYS) {
    const value = filters[key];
    if (value !== undefined) params.set(key, String(value));
  }
  if (extras?.page && extras.page > 1) params.set('page', String(extras.page));
  if (extras?.filter) params.set('filter', '1');
  if (extras?.cleared) params.set('notice', 'type-filters-cleared');
  return `/tournaments${params.size ? `?${params}` : ''}`;
}

export function switchCompetitionKind(filters: CompetitionDiscoveryFilters, kind: CompetitionKind): CompetitionDiscoveryFilters {
  if (kind === 'tournament') return { ...filters, kind, stage: filters.stage === 'preparing' ? undefined : filters.stage };
  const { genderCategory: _gender, format: _format, feeMin: _min, feeMax: _max, ...common } = filters;
  return { ...common, kind };
}

/** 어느 칸의 범위가 틀렸는지 함께 돌려줘 시트가 그 칸 바로 밑에 안내를 띄운다. */
export function discoveryRangeError(filters: CompetitionDiscoveryFilters): { field: 'date' | 'fee'; message: string } | null {
  if (filters.dateFrom && filters.dateTo && filters.dateFrom > filters.dateTo) return { field: 'date', message: '종료 날짜는 시작 날짜 이후로 선택해 주세요.' };
  if (filters.feeMin !== undefined && filters.feeMax !== undefined && filters.feeMin > filters.feeMax) return { field: 'fee', message: '최대 참가비는 최소 참가비 이상으로 입력해 주세요.' };
  return null;
}


/** 서버 seed와 클라이언트가 같은 정규화된 필터로 첫 페이지를 요청한다(정렬은 서버가 상태 그룹으로 고정한다). */
export function competitionDiscoverySeedPath(filters: CompetitionDiscoveryFilters, sports: ReadonlyArray<{ id: string }>): string | null {
  if (filters.sportId && sports.length === 0) return null;
  const params = new URLSearchParams();
  params.set('kind', filters.kind);
  params.set('limit', '20');
  for (const key of DISCOVERY_FILTER_KEYS) {
    const value = filters[key];
    if (key === 'sportId' && !sports.some((sport) => sport.id === value)) continue;
    if (value !== undefined) params.set(key, String(value));
  }
  params.set('withTotal', 'true');
  return `/tournaments?${params}`;
}

/**
 * 필터 시트의 상태 두 줄 — 5개 상태를 모집 상태(신청 접수 중·접수 마감)와 진행 상태(준비 중·진행 중·종료)로 나눈다.
 * 두 줄은 따로 걸리는 필터가 아니라 하나의 선택이다(`stage` 하나). 한 줄에서 고르면 다른 줄은 '전체'로 돌아가므로
 * 안 나오는 조합이 없다. 대회 탭에는 '준비 중'이 없다(대회 초안은 비공개).
 */
export function competitionStageRows(kind: CompetitionKind): Array<{ title: string; options: Array<{ value: CompetitionStage; label: string }> }> {
  const option = (stage: CompetitionStage) => ({ value: stage, label: COMPETITION_STAGE_LABEL[stage] });
  return [
    { title: '모집 상태', options: (['recruiting', 'recruit_closed'] as const).map(option) },
    { title: '진행 상태', options: (['preparing', 'ongoing', 'completed'] as const).filter((stage) => !(kind === 'tournament' && stage === 'preparing')).map(option) },
  ];
}
