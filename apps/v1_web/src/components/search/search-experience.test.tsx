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

vi.mock('@/hooks/use-v1-api', () => ({
  useV1RecentSearches: () => ({ data: { items: [] }, isLoading: false }),
  useV1RecordSearch: () => ({ mutate: vi.fn() }),
  useV1Matches: () => ({ data: { items: [{ id: 'match-1', title: '성수 저녁 풋살' }] }, isLoading: false, isError: false }),
  useV1TeamMatches: () => ({ data: { items: [] }, isLoading: false, isError: false }),
  useV1Teams: () => ({ data: { items: [] }, isLoading: false, isError: false }),
}));

describe('SearchExperience GA events', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.pushState({}, '', '/search?q=futsal');
  });

  it('tracks a search event with the query length (not raw text) and combined result count once results resolve', async () => {
    // Given / When
    render(<SearchExperience state="results" />);

    // Then — 'futsal' 검색어 원문이 아니라 length(=6)만 전송해야 한다: 자유 입력 검색창은
    // 사용자가 이름/전화번호 등 PII를 입력할 수 있으므로 GA4에 원문을 보내지 않는다.
    await waitFor(() =>
      expect(analytics.trackEvent).toHaveBeenCalledWith('search', { queryLength: 6, resultCount: 1, domain: 'all' }),
    );
    // 결과가 안정된 뒤 재렌더링되어도 같은 검색어로 중복 발화하지 않는다.
    expect(analytics.trackEvent).toHaveBeenCalledTimes(1);

    // trackEvent 로 전달된 params 어디에도 원문 검색어 문자열이 실려서는 안 된다.
    const [, params] = analytics.trackEvent.mock.calls[0];
    expect(JSON.stringify(params)).not.toContain('futsal');
  });
});
