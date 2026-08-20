import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Providers } from '@/app/providers';
import {
  useV1ActivePopup,
  useV1AdminLeagueMatch,
  useV1GenerateLeagueFixtures,
  useV1UpdateLeagueFixture,
} from '@/hooks/use-v1-api';
import LeagueMatchFixturesClient from './league-match-fixtures-client';

vi.mock('@/components/auth/pending-social-signup-gate', () => ({
  PendingSocialSignupGate: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('@/hooks/use-v1-api', () => ({
  useV1ActivePopup: vi.fn(),
  useV1AdminLeagueMatch: vi.fn(),
  useV1GenerateLeagueFixtures: vi.fn(),
  useV1UpdateLeagueFixture: vi.fn(),
  // Providers 안의 ThemeProvider가 전역으로 호출한다 — 이 테스트가 <Providers>로 렌더하는 한 필요.
  useV1Settings: vi.fn(() => ({ data: undefined, isError: false, refetch: vi.fn() })),
  useV1UpdateSettings: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}));

const useV1ActivePopupMock = vi.mocked(useV1ActivePopup, { partial: true });
const useV1AdminLeagueMatchMock = vi.mocked(useV1AdminLeagueMatch, { partial: true });
const useV1GenerateLeagueFixturesMock = vi.mocked(useV1GenerateLeagueFixtures, { partial: true });
const useV1UpdateLeagueFixtureMock = vi.mocked(useV1UpdateLeagueFixture, { partial: true });

describe('LeagueMatchFixturesClient', () => {
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
    useV1AdminLeagueMatchMock.mockReturnValue({
      data: {
        leagueId: 'league-1',
        title: '가을 풋살 리그',
        state: 'active',
        teamIds: ['t1', 't2'],
        fixtures: [
          { teamMatchId: 'tm-1', title: '가을 풋살 리그 1주차', homeTeamId: 't1', awayTeamId: 't2', startAt: '2026-09-01T20:00:00.000Z', placeName: '장소 미정', status: 'matched' },
        ],
      },
      isPending: false,
    } as never);
    useV1GenerateLeagueFixturesMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
    useV1UpdateLeagueFixtureMock.mockReturnValue({ mutate: vi.fn() } as never);

    render(
      <Providers>
        <LeagueMatchFixturesClient leagueId="league-1" />
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
    useV1AdminLeagueMatchMock.mockReturnValue({
      data: {
        leagueId: 'league-1',
        title: '가을 풋살 리그',
        state: 'active',
        teamIds: ['t1', 't2'],
        fixtures: [
          { teamMatchId: 'tm-1', title: '가을 풋살 리그 1주차', homeTeamId: 't1', awayTeamId: 't2', startAt: '2026-09-01T20:00:00.000Z', placeName: '장소 미정', status: 'matched' },
        ],
      },
      isPending: false,
    } as never);
    useV1GenerateLeagueFixturesMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
    const mutate = vi.fn();
    useV1UpdateLeagueFixtureMock.mockReturnValue({ mutate } as never);

    render(
      <Providers>
        <LeagueMatchFixturesClient leagueId="league-1" />
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

  it('대진이 없으면 요일/시각/장소를 선택하지 않아도 주차 수만으로 생성할 수 있다(기존 동작 보존)', async () => {
    useV1ActivePopupMock.mockReturnValue({ data: undefined, isPending: false } as never);
    useV1AdminLeagueMatchMock.mockReturnValue({
      data: { leagueId: 'league-1', title: '가을 풋살 리그', state: 'draft', teamIds: ['t1', 't2'], fixtures: [] },
      isPending: false,
    } as never);
    const mutateAsync = vi.fn().mockResolvedValue({ leagueId: 'league-1', createdCount: 7, teamMatchIds: [] });
    useV1GenerateLeagueFixturesMock.mockReturnValue({ mutateAsync, isPending: false } as never);
    useV1UpdateLeagueFixtureMock.mockReturnValue({ mutate: vi.fn() } as never);

    render(
      <Providers>
        <LeagueMatchFixturesClient leagueId="league-1" />
      </Providers>,
    );

    fireEvent.click(screen.getByRole('button', { name: '라운드로빈 대진 생성' }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith({ weeksCount: 7 }));
  });

  it('요일·시각·장소를 채우고 생성하면 schedule과 placeName을 함께 전달한다', async () => {
    useV1ActivePopupMock.mockReturnValue({ data: undefined, isPending: false } as never);
    useV1AdminLeagueMatchMock.mockReturnValue({
      data: { leagueId: 'league-1', title: '가을 풋살 리그', state: 'draft', teamIds: ['t1', 't2'], fixtures: [] },
      isPending: false,
    } as never);
    const mutateAsync = vi.fn().mockResolvedValue({ leagueId: 'league-1', createdCount: 7, teamMatchIds: [] });
    useV1GenerateLeagueFixturesMock.mockReturnValue({ mutateAsync, isPending: false } as never);
    useV1UpdateLeagueFixtureMock.mockReturnValue({ mutate: vi.fn() } as never);

    render(
      <Providers>
        <LeagueMatchFixturesClient leagueId="league-1" />
      </Providers>,
    );

    fireEvent.change(screen.getByLabelText('요일'), { target: { value: '6' } });
    fireEvent.change(screen.getByLabelText('시각'), { target: { value: '19:30' } });
    fireEvent.change(screen.getByLabelText('기본 장소'), { target: { value: '상암 풋살파크' } });
    fireEvent.click(screen.getByRole('button', { name: '라운드로빈 대진 생성' }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith({
      weeksCount: 7,
      schedule: { dayOfWeek: 6, time: '19:30' },
      placeName: '상암 풋살파크',
    }));
  });

  it('요일을 고르고 시각을 비우면 서버 400 대신 안내 토스트를 보여주고 제출하지 않는다', async () => {
    useV1ActivePopupMock.mockReturnValue({ data: undefined, isPending: false } as never);
    useV1AdminLeagueMatchMock.mockReturnValue({
      data: { leagueId: 'league-1', title: '가을 풋살 리그', state: 'draft', teamIds: ['t1', 't2'], fixtures: [] },
      isPending: false,
    } as never);
    const mutateAsync = vi.fn().mockResolvedValue({ leagueId: 'league-1', createdCount: 7, teamMatchIds: [] });
    useV1GenerateLeagueFixturesMock.mockReturnValue({ mutateAsync, isPending: false } as never);
    useV1UpdateLeagueFixtureMock.mockReturnValue({ mutate: vi.fn() } as never);

    render(
      <Providers>
        <LeagueMatchFixturesClient leagueId="league-1" />
      </Providers>,
    );

    fireEvent.change(screen.getByLabelText('요일'), { target: { value: '6' } });
    fireEvent.change(screen.getByLabelText('시각'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: '라운드로빈 대진 생성' }));

    await waitFor(() => expect(screen.getByText('요일을 골랐으면 시각도 입력해 주세요.')).toBeInTheDocument());
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it('최근 사용한 장소 칩을 누르면 기본 장소 입력에 그 값이 채워진다', async () => {
    useV1ActivePopupMock.mockReturnValue({ data: undefined, isPending: false } as never);
    useV1AdminLeagueMatchMock.mockReturnValue({
      data: {
        leagueId: 'league-1',
        title: '가을 풋살 리그',
        state: 'draft',
        teamIds: ['t1', 't2'],
        fixtures: [],
        recentVenues: ['상암 풋살파크', '잠실 종합운동장'],
      },
      isPending: false,
    } as never);
    const mutateAsync = vi.fn().mockResolvedValue({ leagueId: 'league-1', createdCount: 7, teamMatchIds: [] });
    useV1GenerateLeagueFixturesMock.mockReturnValue({ mutateAsync, isPending: false } as never);
    useV1UpdateLeagueFixtureMock.mockReturnValue({ mutate: vi.fn() } as never);

    render(
      <Providers>
        <LeagueMatchFixturesClient leagueId="league-1" />
      </Providers>,
    );

    fireEvent.click(screen.getByRole('button', { name: '잠실 종합운동장' }));
    fireEvent.click(screen.getByRole('button', { name: '라운드로빈 대진 생성' }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith({
      weeksCount: 7,
      placeName: '잠실 종합운동장',
    }));
  });

  it('조회가 실패하면 에러 메시지와 재시도 버튼을 보여주고, 버튼을 누르면 refetch를 호출한다', () => {
    useV1ActivePopupMock.mockReturnValue({ data: undefined, isPending: false } as never);
    const refetch = vi.fn();
    useV1AdminLeagueMatchMock.mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
      error: new Error('리그를 찾을 수 없어요.'),
      refetch,
    } as never);
    useV1GenerateLeagueFixturesMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
    useV1UpdateLeagueFixtureMock.mockReturnValue({ mutate: vi.fn() } as never);

    render(
      <Providers>
        <LeagueMatchFixturesClient leagueId="league-1" />
      </Providers>,
    );

    expect(screen.getByText('리그를 찾을 수 없어요.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '다시 시도하기' }));
    expect(refetch).toHaveBeenCalled();
  });

  it('로딩 중에는 빈 화면 대신 로딩 표시를 렌더링한다', () => {
    useV1ActivePopupMock.mockReturnValue({ data: undefined, isPending: false } as never);
    useV1AdminLeagueMatchMock.mockReturnValue({ data: undefined, isPending: true } as never);
    useV1GenerateLeagueFixturesMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
    useV1UpdateLeagueFixtureMock.mockReturnValue({ mutate: vi.fn() } as never);

    const { container } = render(
      <Providers>
        <LeagueMatchFixturesClient leagueId="league-1" />
      </Providers>,
    );

    // 로딩 중 완전 빈 화면(null 렌더) 회귀를 잡는다 — 스켈레톤이 시각적으로 존재해야 한다.
    expect(container.querySelector('.animate-pulse')).not.toBeNull();
  });

  it('일시·구장 입력을 값 변경 없이 blur만 하면 PATCH를 호출하지 않는다', () => {
    useV1ActivePopupMock.mockReturnValue({ data: undefined, isPending: false } as never);
    useV1AdminLeagueMatchMock.mockReturnValue({
      data: {
        leagueId: 'league-1',
        title: '가을 풋살 리그',
        state: 'active',
        teamIds: ['t1', 't2'],
        fixtures: [
          { teamMatchId: 'tm-1', title: '가을 풋살 리그 1주차', homeTeamId: 't1', awayTeamId: 't2', startAt: '2026-09-01T20:00:00.000Z', placeName: '장소 미정', status: 'matched' },
        ],
      },
      isPending: false,
    } as never);
    useV1GenerateLeagueFixturesMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
    const mutate = vi.fn();
    useV1UpdateLeagueFixtureMock.mockReturnValue({ mutate } as never);

    render(
      <Providers>
        <LeagueMatchFixturesClient leagueId="league-1" />
      </Providers>,
    );

    // 표를 탭으로 지나가는 상황: 값은 그대로인데 blur 만 발생 → 쓰기(PATCH)가 발생하면 안 된다.
    const [startInput] = screen.getAllByLabelText('가을 풋살 리그 1주차 일시');
    fireEvent.blur(startInput);
    const [placeInput] = screen.getAllByLabelText('가을 풋살 리그 1주차 구장');
    fireEvent.blur(placeInput);

    expect(mutate).not.toHaveBeenCalled();
  });

  it('최근 사용한 장소가 없으면 칩 영역을 렌더링하지 않는다', () => {
    useV1ActivePopupMock.mockReturnValue({ data: undefined, isPending: false } as never);
    useV1AdminLeagueMatchMock.mockReturnValue({
      data: { leagueId: 'league-1', title: '가을 풋살 리그', state: 'draft', teamIds: ['t1', 't2'], fixtures: [], recentVenues: [] },
      isPending: false,
    } as never);
    useV1GenerateLeagueFixturesMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
    useV1UpdateLeagueFixtureMock.mockReturnValue({ mutate: vi.fn() } as never);

    render(
      <Providers>
        <LeagueMatchFixturesClient leagueId="league-1" />
      </Providers>,
    );

    expect(screen.queryByText('최근 사용한 장소')).not.toBeInTheDocument();
  });
});
