import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MATCH_DISCOVERY_FILTERS,
  buildMatchApiParams,
  buildMatchDiscoverySearchParams,
  countActiveMatchDiscoveryFilters,
  getTodayFilterDate,
  parseMatchDiscoveryFilters,
} from '../match-discovery';

describe('match discovery helpers', () => {
  it('parses search params with defaults', () => {
    const filters = parseMatchDiscoveryFilters(new URLSearchParams(''));

    expect(filters).toEqual(DEFAULT_MATCH_DISCOVERY_FILTERS);
  });

  it('parses search params with supported values', () => {
    const filters = parseMatchDiscoveryFilters(
      new URLSearchParams(
        'sport=futsal&q=%ED%92%8B%EC%82%B4&date=2026-04-12&city=%EC%84%9C%EC%9A%B8&level=beginner&fee=free&available=1&sort=deadline',
      ),
    );

    expect(filters).toEqual({
      sport: 'futsal',
      q: '풋살',
      date: '2026-04-12',
      city: '서울',
      level: 'beginner',
      fee: 'free',
      available: true,
      sort: 'deadline',
    });
  });

  it('serializes only non-default values', () => {
    const params = buildMatchDiscoverySearchParams({
      sport: 'futsal',
      q: '야간',
      date: '',
      city: '서울',
      level: 'all',
      fee: 'free',
      available: true,
      sort: 'latest',
    });

    expect(params.toString()).toBe(
      'sport=futsal&q=%EC%95%BC%EA%B0%84&city=%EC%84%9C%EC%9A%B8&fee=free&available=1&sort=latest',
    );
  });

  it('builds API params from discovery filters', () => {
    const params = buildMatchApiParams({
      sport: 'futsal',
      q: '강남',
      date: '2026-04-12',
      city: '서울',
      level: 'advanced',
      fee: 'free',
      available: true,
      sort: 'deadline',
    });

    expect(params).toEqual({
      sportType: 'futsal',
      q: '강남',
      date: '2026-04-12',
      city: '서울',
      levelMin: '4',
      levelMax: '5',
      freeOnly: 'true',
      availableOnly: 'true',
      sort: 'deadline',
    });
  });

  it('counts active filters', () => {
    const count = countActiveMatchDiscoveryFilters({
      sport: 'futsal',
      q: '',
      date: '',
      city: '서울',
      level: 'all',
      fee: 'free',
      available: true,
      sort: 'upcoming',
    });

    expect(count).toBe(4);
  });

  it('returns today date in local format', () => {
    expect(getTodayFilterDate(new Date('2026-04-08T08:00:00.000Z'))).toBe('2026-04-08');
  });
});
