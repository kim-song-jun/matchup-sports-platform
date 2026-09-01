/**
 * 이 화면의 존재 이유는 하나 — **자바스크립트를 실행하지 않는 크롤러가 실제 매치를 읽는 것**.
 * 그래서 테스트도 "렌더된 HTML 안에 매치의 제목·종목·장소가 실제로 있는가"만 본다.
 * (변경 전에는 `<Suspense fallback={null}>` 때문에 이 자리가 통째로 비어 있었다.)
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render as rtlRender, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';
import { MatchListSsrView } from './matches-ssr-list';
import type { V1Match } from '@/types/api';

// 목록 뷰 안의 알림 벨이 React Query 를 쓴다 — 실제 앱에서는 루트 레이아웃의 Providers 가
// 이 컨텍스트를 준다(teams-page.test.tsx 와 같은 래퍼).
function render(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return rtlRender(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

/** 매치 상세로 가는 링크만 — `/matches/new/...`(매치 만들기 CTA)는 상세가 아니다. */
function detailHrefs(): string[] {
  return screen
    .queryAllByRole('link')
    .map((link) => link.getAttribute('href') ?? '')
    .filter((href) => href.startsWith('/matches/') && !href.startsWith('/matches/new'));
}

function match(overrides: Partial<V1Match> = {}): V1Match {
  return {
    id: 'match-1',
    matchId: 'match-1',
    title: '금요일 저녁 풋살 한 판',
    sport: { id: 'sport-1', name: '풋살' },
    place: { id: 'place-1', name: '강남 풋살파크' },
    region: { id: 'region-1', name: '서울 강남구' },
    startsAt: '2026-10-02T10:00:00.000Z',
    endsAt: '2026-10-02T12:00:00.000Z',
    status: 'recruiting',
    participantCount: 6,
    capacity: 10,
    ...overrides,
  } as unknown as V1Match;
}

describe('MatchListSsrView', () => {
  it('매치의 제목·종목·장소를 서버 렌더 마크업에 담는다', () => {
    render(<MatchListSsrView matches={[match()]} />);

    expect(screen.getByText('금요일 저녁 풋살 한 판')).toBeInTheDocument();
    expect(screen.getAllByText(/풋살/).length).toBeGreaterThan(0);
    expect(screen.getByText(/강남 풋살파크/)).toBeInTheDocument();
  });

  it('매치마다 상세 페이지로 가는 링크를 낸다 — 크롤러가 상세를 발견하는 유일한 경로', () => {
    render(
      <MatchListSsrView
        matches={[match({ id: 'a', matchId: 'a', title: 'A 매치' }), match({ id: 'b', matchId: 'b', title: 'B 매치' })]}
      />,
    );

    const hrefs = screen.getAllByRole('link').map((link) => link.getAttribute('href'));
    expect(hrefs).toContain('/matches/a');
    expect(hrefs).toContain('/matches/b');
    expect(detailHrefs()).toEqual(['/matches/a', '/matches/b']);
  });

  it('목록이 비어도 목업 매치를 대신 보여주지 않는다', () => {
    // base 뷰모델에는 목업 매치가 들어 있다. 실수로 그것이 새어 나가면 크롤러와 사용자
    // 양쪽에 존재하지 않는 매치가 노출된다.
    render(<MatchListSsrView matches={[]} />);

    expect(screen.queryByText('금요일 저녁 풋살 한 판')).not.toBeInTheDocument();
    expect(detailHrefs()).toEqual([]);
  });
});
