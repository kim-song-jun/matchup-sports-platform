import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { server } from '@/test/msw/server';
import { publicGameRecordsKeys } from '@/components/public-game-records/use-public-game-records';
import type { PublicScheduleEntry, PublicTournamentScheduleResponse } from '@/components/public-game-records/types';
import { LeagueProgressSummary, LeagueTeamFixturesDetail } from './league-inline-records';

beforeAll(() => {
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost/api/v1');
  server.listen({ onUnhandledRequest: 'bypass' });
});
afterEach(() => server.resetHandlers());
afterAll(() => { server.close(); vi.unstubAllEnvs(); });

function entry(overrides: Partial<PublicScheduleEntry> = {}): PublicScheduleEntry {
  return {
    fixtureId: 'fixture-1', round: '1주차', fixtureNumber: 1, legNumber: 1,
    groupId: null, groupName: null, scheduledAt: '2026-10-01T10:00:00.000Z',
    venue: null, fieldId: null, fieldName: null,
    home: { registrationId: 'r-home', teamId: 'team-1', teamName: '성수 FC' },
    away: { registrationId: 'r-away', teamId: 'team-2', teamName: '마포 FC' },
    homeSlotLabel: null, awaySlotLabel: null,
    visibilityMode: 'live', status: 'ended', resultState: 'official', scoreStatus: 'official',
    score: { home: 3, away: 1, penalties: null }, clock: null, periodBreak: null,
    scorers: [], cards: [], outcome: null, hasVideo: false, ...overrides,
  };
}

function page(items: PublicScheduleEntry[], nextCursor: string | null = null): PublicTournamentScheduleResponse {
  return { tournamentId: 'league-1', tournamentTitle: '테스트 리그', bracketPublished: true,
    items, unscheduled: [], standings: [], nextCursor };
}

function renderRecords(data: PublicTournamentScheduleResponse, teamId: string | null = 'team-1') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(publicGameRecordsKeys.schedule('league-1', {}), { pages: [data], pageParams: [null] });
  return render(<QueryClientProvider client={client}><LeagueTeamFixturesDetail tournamentId="league-1" teamId={teamId} /></QueryClientProvider>);
}

describe('리그 순위 전적', () => {
  it('홈·원정 기준 승패를 표시하고 다른 팀 경기 및 반복된 미정 경기 행을 제외한다', () => {
    const home = entry();
    const away = entry({ fixtureId: 'fixture-away', home: entry().away, away: entry().home });
    const unrelated = entry({ fixtureId: 'unrelated', home: entry().away, away: entry().away });
    renderRecords({ ...page([home, away, unrelated]), unscheduled: [home] });
    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('홈마포 FC 승 3-1');
    expect(rows[1]).toHaveTextContent('원정마포 FC 패 1-3');
  });

  it('확정 전·라이브·취소·무효·비공개 점수를 확정 전적처럼 표시하지 않는다', () => {
    renderRecords(page([
      entry({ fixtureId: 'pending', resultState: 'pending', scoreStatus: 'pending' }),
      entry({ fixtureId: 'live', status: 'live', resultState: 'pending', scoreStatus: 'live' }),
      entry({ fixtureId: 'cancelled', status: 'cancelled' }),
      entry({ fixtureId: 'void', resultState: 'void' }),
      entry({ fixtureId: 'hidden', scoreStatus: 'unavailable' }),
    ]));
    const rows = screen.getAllByRole('listitem');
    expect(rows[0]).toHaveTextContent('결과 대기 3-1');
    expect(rows[1]).toHaveTextContent('진행 중 3-1');
    expect(rows[2]).toHaveTextContent('취소');
    expect(rows[2]).not.toHaveTextContent('3-1');
    expect(rows[3]).toHaveTextContent('무효 처리');
    expect(rows[3]).not.toHaveTextContent('3-1');
    expect(rows[4]).not.toHaveTextContent('3-1');
    for (const row of rows) expect(row).not.toHaveTextContent('승 3-1');
  });

  it('현재 페이지에 팀 경기가 없으면 경기 없음 대신 더 보기를 제공하고 다음 페이지 전적을 표시한다', async () => {
    server.use(http.get('*/api/v1/tournaments/league-1/schedule', ({ request }) => {
      expect(new URL(request.url).searchParams.get('cursor')).toBe('next');
      return HttpResponse.json({ status: 'success', data: page([entry()]), timestamp: '' });
    }));
    renderRecords(page([], 'next'));
    expect(screen.queryByText('배정된 경기가 아직 없어요')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '경기 전적 더 보기' }));
    expect(await screen.findByRole('listitem')).toHaveTextContent('승 3-1');
    expect(screen.queryByRole('button', { name: '경기 전적 더 보기' })).not.toBeInTheDocument();
  });

  it('다음 페이지 실패를 숨기지 않고 재시도로 실제 전적을 표시한다', async () => {
    server.use(http.get('*/api/v1/tournaments/league-1/schedule', () => new HttpResponse(null, { status: 500 })));
    renderRecords(page([], 'next'));
    await userEvent.click(screen.getByRole('button', { name: '경기 전적 더 보기' }));
    const error = await screen.findByText('다음 경기 전적을 불러오지 못했어요.');
    expect(error).toBeInTheDocument();
    expect(screen.queryByText('배정된 경기가 아직 없어요')).not.toBeInTheDocument();
    server.use(http.get('*/api/v1/tournaments/league-1/schedule', () => HttpResponse.json({ status: 'success', data: page([entry()]), timestamp: '' })));
    await userEvent.click(screen.getByRole('button', { name: /다시|재시도/ }));
    expect(await screen.findByRole('listitem')).toHaveTextContent('승 3-1');
  });

  it('팀 ID가 비공개이면 서로 다른 비공개 팀 경기를 합치지 않는다', () => {
    renderRecords(page([entry({ home: { ...entry().home!, teamId: null, teamName: null } })]), null);
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
    expect(screen.getByText('배정된 경기가 아직 없어요')).toBeInTheDocument();
  });
});

describe('리그 순위 진행률', () => {
  it('상세의 전체 진행률 API를 표시하고 실패 시 재시도 후 올바른 값으로 복구한다', async () => {
    server.use(http.get('*/api/v1/tournaments/league-1/standings/overall', () => new HttpResponse(null, { status: 500 })));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><LeagueProgressSummary tournamentId="league-1" /></QueryClientProvider>);
    expect(await screen.findByText('진행률을 불러오지 못했어요.')).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    server.use(http.get('*/api/v1/tournaments/league-1/standings/overall', () => HttpResponse.json({ status: 'success', timestamp: '', data: {
      standings: [], progress: { total: 30, played: 21, remaining: 9, percent: 70 }, magicNumber: null, recalculatedAt: null, champions: [], tieBreakGroups: [],
    } })));
    await userEvent.click(screen.getByRole('button', { name: /다시|재시도/ }));
    const bar = await screen.findByRole('progressbar', { name: '전체 일정 진행률 21 / 30경기, 70%' });
    expect(bar).toHaveAttribute('aria-valuenow', '70');
    expect(within(bar).getByText('21 / 30 · 70%')).toBeVisible();
  });
});
