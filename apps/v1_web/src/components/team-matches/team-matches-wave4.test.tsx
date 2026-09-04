/**
 * 웨이브4(2026-09-04 감사): matches-wave3.test.tsx 와 같은 결함군을 team-matches 에서 못박는다.
 * 사진 없는 팀매치에 목업 사진이 붙던 폴백, 재시도 없는 오류 화면, 위저드 bare 라우트 크롬
 * 누락, 죽은 /team-matches/new/complete 라우트.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { queryImageBySrc } from '@/test/next-image';
import { sportIllustration } from '@/components/matches/matches.card-model';
import { toTeamMatch } from './team-matches.card-model';
import { getTeamMatchListViewModel, getTeamMatchStateViewModel } from './team-matches.view-model';
import { TeamMatchListPageView, TeamMatchStatePageView } from './team-matches-page';
import { resolveRouteChrome } from '@/lib/route-chrome';
import type { V1TeamMatch } from '@/types/api';

vi.mock('next/navigation', () => ({
  usePathname: () => '/team-matches',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

function renderPage(ui: ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

const base = getTeamMatchListViewModel();
const apiTeamMatch = {
  teamMatchId: 'tm1',
  title: '실제 팀매치',
  imageUrl: null,
  sport: { name: '풋살' },
  startsAt: '2026-09-09T04:16:00.000Z',
  status: 'open',
} as unknown as V1TeamMatch;

describe('사진 없는 팀매치', () => {
  it('toTeamMatch 는 imageUrl 이 없으면 목업 사진으로 메우지 않고 null 을 준다', () => {
    expect(toTeamMatch(apiTeamMatch, base.matches[0]).imageUrl).toBeNull();
    expect(base.matches[0].imageUrl).toBeTruthy();
  });

  it('목록 카드는 사진 대신 종목 그래픽을 그린다', () => {
    const model = { ...base, matches: [{ ...toTeamMatch(apiTeamMatch, base.matches[0]) }], isLoading: false };
    const { container } = renderPage(<TeamMatchListPageView model={model} />);
    expect(container.querySelector('.tm-team-match-vs-sport')).not.toBeNull();
    expect(queryImageBySrc(container, `/illustrations/${sportIllustration('풋살')}-640.webp`)).not.toBeNull();
  });
});

describe('오류 화면', () => {
  it('ErrorState + 재시도 버튼을 그리고 retry 를 호출한다', () => {
    const retry = vi.fn();
    renderPage(<TeamMatchStatePageView model={{ ...getTeamMatchStateViewModel('error'), retry }} />);
    expect(screen.getByRole('alert')).toHaveTextContent(getTeamMatchStateViewModel('error').title);
    fireEvent.click(screen.getByRole('button', { name: '다시 불러오기' }));
    expect(retry).toHaveBeenCalledTimes(1);
  });
});

describe('빈 상태 CTA', () => {
  it('필터가 걸려 있을 때만 "전체 팀매치 보기" 링크를 준다', () => {
    const filtered = { ...base, matches: [], isLoading: false, filterCount: 1 };
    const { container, unmount } = renderPage(<TeamMatchListPageView model={filtered} />);
    expect(container.querySelector('a.tm-btn-primary[href="/team-matches"]')).not.toBeNull();
    unmount();
    const plain = { ...base, matches: [], isLoading: false, filterCount: 0, sports: base.sports.map((s) => ({ ...s, active: s.label === '전체' })) };
    const r2 = renderPage(<TeamMatchListPageView model={plain} />);
    expect(r2.container.querySelector('a.tm-btn-primary[href="/team-matches"]')).toBeNull();
  });
});

describe('위저드 크롬', () => {
  it('/team-matches/new 는 상세(/team-matches/:id)가 아니라 팀매치 만들기 크롬을 받는다', () => {
    const resolved = resolveRouteChrome('/team-matches/new');
    expect(resolved?.chrome.title).toBe('팀매치 만들기');
    expect(resolved?.chrome.backHref).toBe('/team-matches');
  });

  it('죽은 라우트 /team-matches/new/complete 는 더 이상 완료 화면 크롬을 받지 않는다', () => {
    expect(resolveRouteChrome('/team-matches/new/complete')?.chrome.title).not.toBe('팀매치 만들기 완료');
  });
});
