import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
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
  // datetime-local 표시값 검증은 UTC와 오프셋이 있는 타임존에서만 회귀를 잡는다
  // (예: CI가 UTC로 돌면 slice(0,16) 버그가 우연히 통과함) — 그래서 TZ를 명시 고정한다.
  let originalTz: string | undefined;
  beforeAll(() => {
    originalTz = process.env.TZ;
    process.env.TZ = 'Asia/Seoul';
  });
  afterAll(() => {
    process.env.TZ = originalTz;
  });

  it('일시 입력 칸에 표시되는 값이 서버가 내려준 UTC 시각과 동일한 순간(instant)을 나타낸다 (로컬시간 미변환 시 9시간 어긋남 회귀 방지)', () => {
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
    useV1UpdateSeriesFixtureMock.mockReturnValue({ mutate: vi.fn() } as never);

    render(
      <Providers>
        <TeamMatchSeriesFixturesClient seriesId="series-1" />
      </Providers>,
    );

    const [startInput] = screen.getAllByLabelText('가을 풋살 리그 1주차 일시') as HTMLInputElement[];
    // 표시값을 다시 Date로 파싱했을 때(브라우저가 datetime-local을 해석하는 방식과 동일)
    // 원본 UTC instant와 정확히 같은 시각이어야 한다. slice(0,16)로 만든 값은
    // KST(+9)에서 이 값과 9시간 어긋난다.
    expect(new Date(startInput.value).getTime()).toBe(new Date('2026-09-01T20:00:00.000Z').getTime());
  });

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
