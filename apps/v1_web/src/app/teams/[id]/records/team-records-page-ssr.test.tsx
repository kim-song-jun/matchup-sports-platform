import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PublicTeamRecordsResponse } from '@/components/public-game-records/types';
import { fetchPublicV1 } from '@/lib/seo';
import TeamRecordsPage from './page';
import { TeamRecordsPageClient } from './team-records-page-client';

const navigation = vi.hoisted(() => ({ search: '' }));
const api = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => { throw new Error('NEXT_NOT_FOUND'); }),
  useSearchParams: () => new URLSearchParams(navigation.search),
}));
vi.mock('next/link', () => ({ default: ({ href, children, ...props }: Record<string, unknown>) => <a href={href as string} {...props}>{children as ReactNode}</a> }));
vi.mock('@/lib/seo', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/seo')>();
  return { ...actual, fetchPublicV1: vi.fn() };
});
vi.mock('@/lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-client')>();
  return { ...actual, v1Get: api.get };
});
vi.mock('@/components/v1-ui/shell-override', () => ({ useShellOverride: vi.fn() }));

const summary = (played: number, won: number, drawn: number, lost: number, goalsFor: number, goalsAgainst: number) => ({
  played, won, drawn, lost, goalsFor, goalsAgainst,
  byType: {
    league: { played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0 },
    tournament: { played, won, drawn, lost, goalsFor, goalsAgainst },
    friendly: { played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0 },
  },
});

function records(overrides: Partial<PublicTeamRecordsResponse> = {}): PublicTeamRecordsResponse {
  return {
    teamId: 'team-real-2041',
    teamName: 'LAW OB',
    teamLogoUrl: null,
    summary: summary(1, 1, 0, 0, 2, 1),
    availableSeasons: ['2026', '2025'],
    items: [{
      gameId: 'game-real-1', teamMatchId: null, tournamentId: 'cup-1', tournamentTitle: '실제 풋살컵',
      leagueId: null, leagueTitle: null, type: 'tournament', opponentTeamId: 'team-away',
      opponentTeamName: '부산 FC', opponentTeamLogoUrl: null, result: 'WON', goalsFor: 2, goalsAgainst: 1,
      penalties: null, isForfeit: false, events: [], playedAt: '2026-08-10T02:00:00.000Z',
    }],
    nextCursor: null,
    ...overrides,
  };
}

async function renderPage(searchParams?: { type: string; season: string }) {
  navigation.search = searchParams ? `?type=${searchParams.type}&season=${searchParams.season}` : '';
  const page = await TeamRecordsPage({
    params: Promise.resolve({ id: 'team-real-2041' }),
    ...(searchParams ? { searchParams: Promise.resolve(searchParams) } : {}),
  } as never);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderToStaticMarkup(<QueryClientProvider client={queryClient}>{page}</QueryClientProvider>);
}

describe('TeamRecordsPage first HTML', () => {
  const allRecords = records();
  const filteredTournamentRecords = records({
    teamName: 'LAW OB 대회 기록',
    summary: summary(1, 0, 1, 0, 1, 1),
    items: [{
      gameId: 'filtered-game-2026', teamMatchId: null, tournamentId: 'cup-2026', tournamentTitle: '2026 풋살컵',
      leagueId: null, leagueTitle: null, type: 'tournament', opponentTeamId: 'filtered-away',
      opponentTeamName: '수원 FC', opponentTeamLogoUrl: null, result: 'DRAWN', goalsFor: 1, goalsAgainst: 1,
      penalties: null, isForfeit: false, events: [], playedAt: '2026-09-10T02:00:00.000Z',
    }],
  });

  beforeEach(() => {
    navigation.search = '';
    api.get.mockReset();
    vi.mocked(fetchPublicV1).mockReset();
  });

  it('renders server-fetched public totals and a real record row before client hydration', async () => {
    const response = allRecords;
    vi.mocked(fetchPublicV1).mockResolvedValue(response as never);
    api.get.mockResolvedValue(response);

    const html = await renderPage();

    expect(html).toContain('LAW OB');
    expect(html).toContain('1·0·0');
    expect(html).toContain('실제 풋살컵');
    expect(html).toContain('2 : 1');
    expect(html).not.toContain('tm-skeleton');
  });

  it('seeds first HTML from the exact filtered public response requested by URL', async () => {
    navigation.search = '?type=tournament&season=2026';
    vi.mocked(fetchPublicV1).mockImplementation(async (path) => {
      return (path.includes('type=tournament') && path.includes('season=2026')
        ? filteredTournamentRecords
        : allRecords) as never;
    });
    api.get.mockImplementation(async (path: string, params?: Record<string, string>) => (
      path === '/teams/team-real-2041/records' && params?.type === 'tournament' && params.season === '2026'
        ? filteredTournamentRecords
        : allRecords
    ));

    const html = await renderPage({ type: 'tournament', season: '2026' });

    expect(vi.mocked(fetchPublicV1)).toHaveBeenCalledWith(expect.stringContaining('type=tournament'));
    expect(vi.mocked(fetchPublicV1)).toHaveBeenCalledWith(expect.stringContaining('season=2026'));
    expect(html).toContain('LAW OB 대회 기록');
    expect(html).toContain('0·1·0');
    expect(html).toContain('2026 풋살컵');
    expect(html).not.toContain('실제 풋살컵');
    expect(html).not.toContain('tm-skeleton');
  });

  it('renders the real zero-record response as an empty state with zero totals', async () => {
    const emptyRecords = records({
      summary: summary(0, 0, 0, 0, 0, 0),
      items: [],
    });
    navigation.search = '?type=tournament&season=2026';
    vi.mocked(fetchPublicV1).mockImplementation(async (path) => (
      path.includes('type=tournament') && path.includes('season=2026') ? emptyRecords : allRecords
    ) as never);
    api.get.mockImplementation(async (_path: string, params?: Record<string, string>) => (
      params?.type === 'tournament' && params.season === '2026' ? emptyRecords : allRecords
    ));

    const html = await renderPage({ type: 'tournament', season: '2026' });

    expect(html).toContain('0·0·0');
    expect(html).toContain('아직 대회 경기가 없어요');
    expect(html).not.toContain('tm-skeleton');
  });

  it('does not render a server seed belonging to another team while the current team query loads', async () => {
    navigation.search = '';
    const wrongTeamSeed = records({ teamId: 'team-a', teamName: '오염 팀 A' });
    const currentTeamResponse = records({ teamId: 'team-b', teamName: '정상 팀 B' });
    api.get.mockResolvedValue(currentTeamResponse);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={queryClient}>
        <TeamRecordsPageClient teamId="team-b" seed={wrongTeamSeed} />
      </QueryClientProvider>,
    );

    expect(screen.queryByText('오염 팀 A')).toBeNull();
    expect(await screen.findByText('정상 팀 B')).toBeInTheDocument();
  });
});
