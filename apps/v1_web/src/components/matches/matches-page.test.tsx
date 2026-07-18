import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render as rtlRender, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MatchDetailPageView, MatchListPageView } from './matches-page';
import { getMatchDetailViewModel, getMatchListViewModel } from './matches.view-model';

vi.mock('next/navigation', () => ({
  usePathname: () => '/matches/match-4',
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
}));

function render(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return rtlRender(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('MatchDetailPageView — closed mode (참가한 적 없는 뷰어가 마감류 매치를 볼 때)', () => {
  it('참가 확정 배너/문구를 보여주지 않는다', () => {
    const model = getMatchDetailViewModel('closed');
    render(<MatchDetailPageView model={model} />);

    expect(screen.queryByText('참가를 확정했어요. 경기 당일 늦지 않게 도착해 주세요.')).not.toBeInTheDocument();
  });

  it('채팅 CTA를 보여주지 않는다', () => {
    const model = getMatchDetailViewModel('closed');
    render(<MatchDetailPageView model={model} />);

    expect(screen.queryByRole('button', { name: /채팅/ })).not.toBeInTheDocument();
  });

  it('중립(회색) 마감 안내 배너를 보여준다', () => {
    const model = getMatchDetailViewModel('closed');
    render(<MatchDetailPageView model={model} />);

    expect(screen.getAllByText('모집 완료').length).toBeGreaterThan(0);
    expect(screen.getAllByText('이 매치는 신청이 마감됐어요. 다른 매치를 둘러봐 주세요.').length).toBeGreaterThan(0);
  });
});

describe('MatchDetailPageView — approved mode (실제 참가 확정자)', () => {
  it('참가 확정 배너를 정상적으로 보여준다', () => {
    const model = getMatchDetailViewModel('approved');
    render(<MatchDetailPageView model={model} />);

    expect(screen.getAllByText('참가를 확정했어요. 경기 당일 늦지 않게 도착해 주세요.').length).toBeGreaterThan(0);
  });
});

describe('MatchListPageView — 매치 카드 종목 배지', () => {
  it('실제 추천 로직 없이 첫 카드에도 가짜 "추천" 배지를 붙이지 않고 실제 종목명을 보여준다', () => {
    const model = getMatchListViewModel();
    render(<MatchListPageView model={model} />);

    // 첫 번째 매치 카드(match-1)는 풋살 — index===0이라는 이유만으로 "추천"으로 덮이면 안 된다.
    expect(screen.queryByText('추천')).not.toBeInTheDocument();
    expect(screen.getAllByText('풋살').length).toBeGreaterThan(0);
  });
});
