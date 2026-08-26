import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render as rtlRender, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MyLeaguesPageClient } from './my-leagues-client';
import type { V1MyLeagueListItem } from '@/types/league-match';

const apiMocks = vi.hoisted(() => ({
  useV1MyLeagues: vi.fn(),
}));

vi.mock('@/hooks/use-v1-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/use-v1-api')>()),
  ...apiMocks,
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/my/leagues',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

function render(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return rtlRender(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

function baseItem(overrides: Partial<V1MyLeagueListItem> = {}): V1MyLeagueListItem {
  return {
    leagueId: 'league-1',
    title: '성수 풋살 리그',
    state: 'active',
    startsOn: '2026-08-01T00:00:00.000Z',
    endsOn: '2026-09-01T00:00:00.000Z',
    sport: { sportId: 'sport-1', code: 'futsal', name: '풋살' },
    region: { regionId: 'region-1', name: '성동구' },
    seriesId: null,
    tier: null,
    tierLabel: null,
    seasonNo: null,
    seriesTitle: null,
    teamCount: 8,
    myTeams: [{ teamId: 'team-1', name: '성수 러너스 FC', standing: null, nextFixture: null }],
    ...overrides,
  };
}

describe('MyLeaguesPageClient — 팀별 순위·다음 경기 노출', () => {
  it('standing 이 있으면 등수·승점·전적을 보여준다', () => {
    apiMocks.useV1MyLeagues.mockReturnValue({
      data: {
        items: [
          baseItem({
            myTeams: [
              {
                teamId: 'team-1',
                name: '성수 러너스 FC',
                standing: { position: 2, points: 14, played: 6, wins: 4, draws: 2, losses: 0, goalDifference: 9 },
                nextFixture: null,
              },
            ],
          }),
        ],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    render(<MyLeaguesPageClient />);

    expect(screen.getByText('2위 · 14점')).toBeInTheDocument();
    expect(screen.getByText('4승 2무 0패')).toBeInTheDocument();
  });

  it('draft 리그(standing=null)는 0등처럼 지어낸 값 대신 "순위 준비 중"을 보여준다', () => {
    apiMocks.useV1MyLeagues.mockReturnValue({
      data: { items: [baseItem({ state: 'draft' })] },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    render(<MyLeaguesPageClient />);

    expect(screen.getByText('순위 준비 중')).toBeInTheDocument();
    expect(screen.queryByText(/0위/)).not.toBeInTheDocument();
    expect(screen.queryByText(/0점/)).not.toBeInTheDocument();
  });

  it('nextFixture 가 있으면 리그 경기 상세로 가는 링크를 보여준다', () => {
    apiMocks.useV1MyLeagues.mockReturnValue({
      data: {
        items: [
          baseItem({
            myTeams: [
              {
                teamId: 'team-1',
                name: '성수 러너스 FC',
                standing: { position: 1, points: 18, played: 6, wins: 6, draws: 0, losses: 0, goalDifference: 15 },
                nextFixture: {
                  teamMatchId: 'tm-42',
                  startAt: '2026-08-30T10:00:00.000Z',
                  opponentTeamId: 'team-2',
                  opponentTeamName: '마포 유나이티드',
                },
              },
            ],
          }),
        ],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    render(<MyLeaguesPageClient />);

    const link = screen.getByRole('link', { name: '성수 러너스 FC 다음 경기 상세로 이동' });
    expect(link).toHaveAttribute('href', '/league-matches/league-1/fixtures/tm-42');
    expect(link).toHaveTextContent('마포 유나이티드');
  });

  it('nextFixture 가 없는(종료된) 리그는 다음 경기 링크를 렌더링하지 않는다', () => {
    apiMocks.useV1MyLeagues.mockReturnValue({
      data: {
        items: [
          baseItem({
            state: 'completed',
            myTeams: [
              {
                teamId: 'team-1',
                name: '성수 러너스 FC',
                standing: { position: 3, points: 10, played: 8, wins: 3, draws: 1, losses: 4, goalDifference: -2 },
                nextFixture: null,
              },
            ],
          }),
        ],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    render(<MyLeaguesPageClient />);

    expect(screen.queryByText(/다음 경기/)).not.toBeInTheDocument();
  });
});
