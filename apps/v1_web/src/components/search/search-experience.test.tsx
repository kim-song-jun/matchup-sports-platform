import { render, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SearchExperience } from './search-experience';

const router = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
}));

const analytics = vi.hoisted(() => ({
  trackEvent: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => router,
}));

vi.mock('@/lib/analytics', () => ({
  trackEvent: analytics.trackEvent,
}));

// AppChrome(desktop nav, bottom nav, notification bell)은 검색 계측과 무관한 무거운
// 셸이라 children만 통과시키는 얇은 대역으로 대체한다 — 실제 검증 대상은 SearchExperience 로직.
vi.mock('@/components/v1-ui/shell', () => ({
  AppChrome: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

const apiMocks = vi.hoisted(() => ({
  matches: { items: [{ id: 'match-1', title: '성수 저녁 풋살' }] } as { items: unknown[] },
  teamMatches: { items: [] } as { items: unknown[] },
  teams: { items: [] } as { items: unknown[] },
}));

vi.mock('@/hooks/use-v1-api', () => ({
  useV1RecentSearches: () => ({ data: { items: [] }, isLoading: false }),
  useV1RecordSearch: () => ({ mutate: vi.fn() }),
  useV1Matches: () => ({ data: apiMocks.matches, isLoading: false, isError: false }),
  useV1TeamMatches: () => ({ data: apiMocks.teamMatches, isLoading: false, isError: false }),
  useV1Teams: () => ({ data: apiMocks.teams, isLoading: false, isError: false }),
}));

describe('SearchExperience GA events', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.pushState({}, '', '/search?q=futsal');
    apiMocks.matches = { items: [{ id: 'match-1', title: '성수 저녁 풋살' }] };
    apiMocks.teamMatches = { items: [] };
    apiMocks.teams = { items: [] };
  });

  it('tracks a search event with the query length (not raw text) and the domain that actually returned results', async () => {
    // Given: only the match domain returns a result (teamMatch/team empty)
    // When
    render(<SearchExperience state="results" />);

    // Then — 'futsal' 검색어 원문이 아니라 length(=6)만 전송해야 한다: 자유 입력 검색창은
    // 사용자가 이름/전화번호 등 PII를 입력할 수 있으므로 GA4에 원문을 보내지 않는다.
    // domain은 하드코딩된 'all'이 아니라 실제로 결과를 낳은 도메인만 반영해야 한다.
    await waitFor(() =>
      expect(analytics.trackEvent).toHaveBeenCalledWith('search', { queryLength: 6, resultCount: 1, domain: 'match' }),
    );
    // 결과가 안정된 뒤 재렌더링되어도 같은 검색어로 중복 발화하지 않는다.
    expect(analytics.trackEvent).toHaveBeenCalledTimes(1);

    // trackEvent 로 전달된 params 어디에도 원문 검색어 문자열이 실려서는 안 된다.
    const [, params] = analytics.trackEvent.mock.calls[0];
    expect(JSON.stringify(params)).not.toContain('futsal');
  });

  it('comma-joins multiple responding domains when more than one domain returns results', async () => {
    // Given: match and team both return results, teamMatch stays empty
    apiMocks.matches = { items: [{ id: 'match-1', title: '성수 저녁 풋살' }] };
    apiMocks.teamMatches = { items: [] };
    apiMocks.teams = { items: [{ id: 'team-1', name: '성수 러너스 FC' }] };

    // When
    render(<SearchExperience state="results" />);

    // Then
    await waitFor(() =>
      expect(analytics.trackEvent).toHaveBeenCalledWith('search', { queryLength: 6, resultCount: 2, domain: 'match,team' }),
    );
  });

  it('reports an empty domain string when no domain returns results', async () => {
    // Given: all three domains are empty
    apiMocks.matches = { items: [] };
    apiMocks.teamMatches = { items: [] };
    apiMocks.teams = { items: [] };

    // When
    render(<SearchExperience state="results" />);

    // Then
    await waitFor(() =>
      expect(analytics.trackEvent).toHaveBeenCalledWith('search', { queryLength: 6, resultCount: 0, domain: '' }),
    );
  });
});
