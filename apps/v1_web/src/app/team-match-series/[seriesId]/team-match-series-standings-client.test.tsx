import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Providers } from '@/app/providers';
import { useV1ActivePopup, useV1TeamMatchSeries, useV1TeamMatchSeriesPlayerRecords, useV1TeamMatchSeriesStandings } from '@/hooks/use-v1-api';
import TeamMatchSeriesStandingsClient from './team-match-series-standings-client';

vi.mock('@/components/auth/pending-social-signup-gate', () => ({
  PendingSocialSignupGate: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('@/hooks/use-v1-api', () => ({
  useV1ActivePopup: vi.fn(),
  useV1TeamMatchSeries: vi.fn(),
  useV1TeamMatchSeriesStandings: vi.fn(),
  useV1TeamMatchSeriesPlayerRecords: vi.fn(),
  // Providers 안의 ThemeProvider가 전역으로 호출한다 — 이 테스트가 <Providers>로 렌더하는 한 필요.
  useV1Settings: vi.fn(() => ({ data: undefined, isError: false, refetch: vi.fn() })),
  useV1UpdateSettings: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}));

const useV1ActivePopupMock = vi.mocked(useV1ActivePopup, { partial: true });
const useV1TeamMatchSeriesMock = vi.mocked(useV1TeamMatchSeries, { partial: true });
const useV1TeamMatchSeriesStandingsMock = vi.mocked(useV1TeamMatchSeriesStandings, { partial: true });
const useV1TeamMatchSeriesPlayerRecordsMock = vi.mocked(useV1TeamMatchSeriesPlayerRecords, { partial: true });

describe('TeamMatchSeriesStandingsClient', () => {
  it('순위표에서 저장된 팀 로고를 표시한다', async () => {
    useV1ActivePopupMock.mockReturnValue({ data: undefined, isPending: false } as never);
    useV1TeamMatchSeriesMock.mockReturnValue({
      data: { seriesId: 'series-1', title: '가을 리그', state: 'active', startsOn: '2026-09-01T00:00:00.000Z', endsOn: '2026-10-20T00:00:00.000Z', teamIds: ['t1'], fixtures: [] },
    } as never);
    useV1TeamMatchSeriesStandingsMock.mockReturnValue({
      data: {
        seriesId: 'series-1',
        tieBreakOrder: ['points'],
        standings: [{ teamId: 't1', teamName: '성수 FC', teamLogoUrl: '/uploads/teams/seongsu.png', position: 1, played: 1, wins: 1, draws: 0, losses: 0, goalsFor: 2, goalsAgainst: 0, points: 3 }],
        pendingFixtures: [],
      },
    } as never);
    useV1TeamMatchSeriesPlayerRecordsMock.mockReturnValue({ data: { seriesId: 'series-1', goals: [], assists: [] } } as never);

    const { container } = render(
      <Providers>
        <TeamMatchSeriesStandingsClient seriesId="series-1" />
      </Providers>,
    );

    await waitFor(() => expect(container.querySelector('img[src="/uploads/teams/seongsu.png"]')).toBeInTheDocument());
  });

  it('미확정 경기가 있으면 순위표 대신 확인 중 안내를 보여준다', async () => {
    useV1ActivePopupMock.mockReturnValue({ data: undefined, isPending: false } as never);
    useV1TeamMatchSeriesMock.mockReturnValue({
      data: { seriesId: 'series-1', title: '가을 리그', state: 'active', startsOn: '2026-09-01T00:00:00.000Z', endsOn: '2026-10-20T00:00:00.000Z', teamIds: ['t1', 't2'], fixtures: [] },
    } as never);
    useV1TeamMatchSeriesStandingsMock.mockReturnValue({
      data: { seriesId: 'series-1', tieBreakOrder: ['points'], standings: [], pendingFixtures: [{ teamMatchId: 'tm-1', homeTeamId: 't1', awayTeamId: 't2', startAt: '2026-09-01T20:00:00.000Z' }] },
    } as never);
    useV1TeamMatchSeriesPlayerRecordsMock.mockReturnValue({ data: { seriesId: 'series-1', goals: [], assists: [] } } as never);

    render(
      <Providers>
        <TeamMatchSeriesStandingsClient seriesId="series-1" />
      </Providers>,
    );

    await waitFor(() => expect(screen.getByText('확인 중')).toBeInTheDocument());
  });
});
