/**
 * 2026-09-04 감사 결함: /search/new 가 코드에 박힌 결과 카드 3장(죽은 /…/sample 링크)을 그렸고,
 * 결과 없음은 "검색 결과가 없어요." 한 줄에 다음 행동이 없었으며, "빠른 조건" 4개는 검색어만
 * 바꾸는 가짜 필터였다. 셋 다 되살아나면 여기서 잡는다.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { queryImageBySrc } from '@/test/next-image';
import { SearchExperience } from './search-experience';

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('@/lib/analytics', () => ({ trackEvent: vi.fn() }));

const apiMocks = vi.hoisted(() => ({
  matches: { items: [] as unknown[] },
  isError: false,
}));

vi.mock('@/hooks/use-v1-api', () => ({
  useV1RecentSearches: () => ({ data: { items: [] }, isLoading: false }),
  useV1RecordSearch: () => ({ mutate: vi.fn() }),
  useV1Matches: () => ({ data: apiMocks.matches, isLoading: false, isError: apiMocks.isError, refetch: vi.fn() }),
  useV1TeamMatches: () => ({ data: { items: [] }, isLoading: false, isError: false, refetch: vi.fn() }),
  useV1Teams: () => ({ data: { items: [] }, isLoading: false, isError: false, refetch: vi.fn() }),
  useV1LeagueMatches: () => ({ data: { items: [] }, isLoading: false, isError: false, refetch: vi.fn() }),
}));

describe('SearchExperience 상태 화면', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMocks.matches = { items: [] };
    apiMocks.isError = false;
  });

  it('신규 상태는 가짜 결과 카드도 빠른 조건도 없이 안내 EmptyState 만 그린다', () => {
    window.history.pushState({}, '', '/search/new');
    const { container } = render(<SearchExperience state="new" />);
    expect(container.querySelectorAll('.tm-search-result-card')).toHaveLength(0);
    expect(screen.queryByText('성수 저녁 풋살')).not.toBeInTheDocument();
    expect(screen.queryByText('빠른 조건')).not.toBeInTheDocument();
    expect(screen.queryByText('마감임박')).not.toBeInTheDocument();
    expect(screen.getByText('무엇을 찾고 있나요?')).toBeInTheDocument();
    expect(queryImageBySrc(container, '/illustrations/auth-notice-640.webp')).not.toBeNull();
  });

  it('결과 없음은 그래픽 + 다음 행동 CTA(전체 매치)를 준다', () => {
    window.history.pushState({}, '', '/search?q=zzqq');
    const { container } = render(<SearchExperience state="results" />);
    expect(screen.getByText('조건에 맞는 결과가 없어요')).toBeInTheDocument();
    expect(queryImageBySrc(container, '/illustrations/auth-notice-640.webp')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '전체 매치 둘러보기' }));
    expect(router.push).toHaveBeenCalledWith('/matches');
  });

  it('오류는 ErrorState 로 재시도 버튼을 준다', () => {
    window.history.pushState({}, '', '/search?q=zzqq');
    apiMocks.isError = true;
    render(<SearchExperience state="results" />);
    expect(screen.getByRole('alert')).toHaveTextContent('검색 결과를 불러오지 못했어요');
    expect(screen.getByRole('button', { name: '다시 불러오기' })).toBeInTheDocument();
  });
});
