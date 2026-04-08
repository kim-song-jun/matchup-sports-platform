export type MatchDiscoveryLevel = 'all' | 'beginner' | 'intermediate' | 'advanced';
export type MatchDiscoveryFee = 'all' | 'free';
export type MatchDiscoverySort = 'upcoming' | 'latest' | 'deadline';

export interface MatchDiscoveryFilters {
  sport: string;
  q: string;
  date: string;
  city: string;
  level: MatchDiscoveryLevel;
  fee: MatchDiscoveryFee;
  available: boolean;
  sort: MatchDiscoverySort;
}

export const DEFAULT_MATCH_DISCOVERY_FILTERS: MatchDiscoveryFilters = {
  sport: '',
  q: '',
  date: '',
  city: '',
  level: 'all',
  fee: 'all',
  available: false,
  sort: 'upcoming',
};

const LEVEL_OPTIONS = new Set<MatchDiscoveryLevel>(['all', 'beginner', 'intermediate', 'advanced']);
const FEE_OPTIONS = new Set<MatchDiscoveryFee>(['all', 'free']);
const SORT_OPTIONS = new Set<MatchDiscoverySort>(['upcoming', 'latest', 'deadline']);

function normalizeBoolean(value: string | null): boolean {
  return value === '1' || value === 'true';
}

function normalizeString(value: string | null): string {
  return value?.trim() ?? '';
}

export function parseMatchDiscoveryFilters(
  searchParams: Pick<URLSearchParams, 'get'>,
): MatchDiscoveryFilters {
  const sport = normalizeString(searchParams.get('sport'));
  const q = normalizeString(searchParams.get('q'));
  const date = normalizeString(searchParams.get('date'));
  const city = normalizeString(searchParams.get('city'));
  const rawLevel = normalizeString(searchParams.get('level')) as MatchDiscoveryLevel;
  const rawFee = normalizeString(searchParams.get('fee')) as MatchDiscoveryFee;
  const rawSort = normalizeString(searchParams.get('sort')) as MatchDiscoverySort;

  return {
    sport,
    q,
    date,
    city,
    level: LEVEL_OPTIONS.has(rawLevel) ? rawLevel : 'all',
    fee: FEE_OPTIONS.has(rawFee) ? rawFee : 'all',
    available: normalizeBoolean(searchParams.get('available')),
    sort: SORT_OPTIONS.has(rawSort) ? rawSort : 'upcoming',
  };
}

export function buildMatchDiscoverySearchParams(filters: MatchDiscoveryFilters): URLSearchParams {
  const params = new URLSearchParams();

  if (filters.sport) params.set('sport', filters.sport);
  if (filters.q) params.set('q', filters.q);
  if (filters.date) params.set('date', filters.date);
  if (filters.city) params.set('city', filters.city);
  if (filters.level !== 'all') params.set('level', filters.level);
  if (filters.fee !== 'all') params.set('fee', filters.fee);
  if (filters.available) params.set('available', '1');
  if (filters.sort !== 'upcoming') params.set('sort', filters.sort);

  return params;
}

export function buildMatchApiParams(
  filters: MatchDiscoveryFilters,
): Record<string, string> | undefined {
  const params: Record<string, string> = {};

  if (filters.sport) params.sportType = filters.sport;
  if (filters.q) params.q = filters.q;
  if (filters.date) params.date = filters.date;
  if (filters.city) params.city = filters.city;

  if (filters.level === 'beginner') {
    params.levelMin = '1';
    params.levelMax = '2';
  } else if (filters.level === 'intermediate') {
    params.levelMin = '2';
    params.levelMax = '4';
  } else if (filters.level === 'advanced') {
    params.levelMin = '4';
    params.levelMax = '5';
  }

  if (filters.fee === 'free') {
    params.freeOnly = 'true';
  }

  if (filters.available) {
    params.availableOnly = 'true';
  }

  if (filters.sort !== 'upcoming') {
    params.sort = filters.sort;
  }

  return Object.keys(params).length > 0 ? params : undefined;
}

export function countActiveMatchDiscoveryFilters(filters: MatchDiscoveryFilters): number {
  let count = 0;

  if (filters.sport) count += 1;
  if (filters.q) count += 1;
  if (filters.date) count += 1;
  if (filters.city) count += 1;
  if (filters.level !== 'all') count += 1;
  if (filters.fee !== 'all') count += 1;
  if (filters.available) count += 1;
  if (filters.sort !== 'upcoming') count += 1;

  return count;
}

export function getTodayFilterDate(now = new Date()): string {
  const date = new Date(now);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}
