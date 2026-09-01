/**
 * `matches-ssr-list.test.tsx` 와 같은 계약 — 크롤러가 받는 HTML 에 실제 팀매치가 있어야 한다.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render as rtlRender, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { TeamMatchListSsrView } from './team-matches-ssr-list';
import type { V1Sport, V1TeamMatch } from '@/types/api';

// 카드 컴포넌트가 `useRouter()` 를 쓴다 — 실제 앱에서는 App Router 가 SSR 중에도 이 컨텍스트를
// 준다(team-matches-page.test.tsx 와 같은 mock).
vi.mock('next/navigation', () => ({
  usePathname: () => '/team-matches',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

function render(ui: ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return rtlRender(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

const FUTSAL = {
  id: 'sport-futsal-uuid',
  code: 'futsal',
  name: '풋살',
  levels: [],
} as unknown as V1Sport;

function teamMatch(overrides: Partial<V1TeamMatch> = {}): V1TeamMatch {
  return {
    id: 'tm-1',
    teamMatchId: 'tm-1',
    title: '주말 풋살 친선전 상대 구해요',
    sport: { id: 'sport-1', name: '풋살' },
    hostTeam: { id: 'team-1', name: '강남 유나이티드' },
    place: { id: 'place-1', name: '강남 풋살파크' },
    region: { id: 'region-1', name: '서울 강남구' },
    startsAt: '2026-10-03T02:00:00.000Z',
    status: 'recruiting',
    ...overrides,
  } as unknown as V1TeamMatch;
}

function detailHrefs(): string[] {
  return screen
    .queryAllByRole('link')
    .map((link) => link.getAttribute('href') ?? '')
    .filter((href) => href.startsWith('/team-matches/') && !href.startsWith('/team-matches/new'));
}

describe('TeamMatchListSsrView', () => {
  it('팀매치 제목·호스트 팀을 서버 렌더 마크업에 담고 상세로 링크한다', () => {
    render(<TeamMatchListSsrView matches={[teamMatch()]} />);

    expect(screen.getByText('주말 풋살 친선전 상대 구해요')).toBeInTheDocument();
    expect(screen.getAllByText(/강남 유나이티드/).length).toBeGreaterThan(0);
    expect(detailHrefs()).toContain('/team-matches/tm-1');
  });

  it('마스터 종목을 받으면 진짜 종목 ID 로 필터 링크를 만든다', () => {
    render(<TeamMatchListSsrView matches={[teamMatch()]} sports={[FUTSAL]} />);

    const hrefs = screen.queryAllByRole('link').map((link) => link.getAttribute('href') ?? '');
    expect(hrefs).toContain('/team-matches?sportId=sport-futsal-uuid');
  });

  it('마스터 종목 목록이 없는 서버 렌더에서 라벨을 sportId 로 쓰지 않는다', () => {
    render(<TeamMatchListSsrView matches={[teamMatch()]} />);

    const hrefs = screen.queryAllByRole('link').map((link) => link.getAttribute('href') ?? '');
    expect(hrefs.filter((href) => href.includes('sportId='))).toEqual([]);
  });

  it('요약 숫자에 목업 값이 섞이지 않는다', () => {
    // `...base.summary` 를 그대로 펼치면 목업 urgent 가 새어 나간다.
    render(<TeamMatchListSsrView matches={[]} />);

    expect(screen.queryByText('3')).not.toBeInTheDocument();
  });

  it('목록이 비어도 목업 팀매치를 대신 보여주지 않는다', () => {
    render(<TeamMatchListSsrView matches={[]} />);

    expect(screen.queryByText('주말 풋살 친선전 상대 구해요')).not.toBeInTheDocument();
    expect(detailHrefs()).toEqual([]);
  });
});
