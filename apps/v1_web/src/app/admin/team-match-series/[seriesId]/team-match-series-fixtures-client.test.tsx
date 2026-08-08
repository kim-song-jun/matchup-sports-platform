import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Providers } from '@/app/providers';
import {
  useV1ActivePopup,
  useV1AdminTeamMatchSeries,
  useV1GenerateSeriesFixtures,
  useV1UpdateSeriesFixture,
} from '@/hooks/use-v1-api';
import TeamMatchSeriesFixturesClient from './team-match-series-fixtures-client';

vi.mock('@/components/auth/pending-social-signup-gate', () => ({
  PendingSocialSignupGate: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('@/hooks/use-v1-api', () => ({
  useV1ActivePopup: vi.fn(),
  useV1AdminTeamMatchSeries: vi.fn(),
  useV1GenerateSeriesFixtures: vi.fn(),
  useV1UpdateSeriesFixture: vi.fn(),
}));

const useV1ActivePopupMock = vi.mocked(useV1ActivePopup, { partial: true });
const useV1AdminTeamMatchSeriesMock = vi.mocked(useV1AdminTeamMatchSeries, { partial: true });
const useV1GenerateSeriesFixturesMock = vi.mocked(useV1GenerateSeriesFixtures, { partial: true });
const useV1UpdateSeriesFixtureMock = vi.mocked(useV1UpdateSeriesFixture, { partial: true });

describe('TeamMatchSeriesFixturesClient', () => {
  it('일시 입력 칸을 blur하면 시작 시각을 ISO로 변환해 PATCH mutation을 호출한다', async () => {
    useV1ActivePopupMock.mockReturnValue({ data: undefined, isPending: false } as never);
    useV1AdminTeamMatchSeriesMock.mockReturnValue({
      data: {
        seriesId: 'series-1',
        title: '가을 풋살 리그',
        state: 'active',
        teamIds: ['t1', 't2'],
        fixtures: [
          { teamMatchId: 'tm-1', title: '가을 풋살 리그 1주차', homeTeamId: 't1', awayTeamId: 't2', startAt: '2026-09-01T20:00:00.000Z', placeName: '장소 미정', status: 'matched' },
        ],
      },
      isPending: false,
    } as never);
    useV1GenerateSeriesFixturesMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
    const mutate = vi.fn();
    useV1UpdateSeriesFixtureMock.mockReturnValue({ mutate } as never);

    render(
      <Providers>
        <TeamMatchSeriesFixturesClient seriesId="series-1" />
      </Providers>,
    );

    // AdminDataTable renders both a desktop <table> and a stacked mobile <ul>
    // for the same rows (CSS-only breakpoint hiding — both exist in jsdom at
    // once), so every cell's aria-label matches twice. They wrap the same
    // underlying fixture, so acting on the first match is representative.
    const [startInput] = screen.getAllByLabelText('가을 풋살 리그 1주차 일시');
    fireEvent.change(startInput, { target: { value: '2026-09-01T21:00' } });
    fireEvent.blur(startInput);

    await waitFor(() => expect(mutate).toHaveBeenCalledWith(
      { teamMatchId: 'tm-1', body: { startsAt: new Date('2026-09-01T21:00').toISOString() } },
      expect.anything(),
    ));
  });
});
