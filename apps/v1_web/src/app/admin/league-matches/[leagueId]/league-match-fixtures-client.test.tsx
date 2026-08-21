import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Providers } from '@/app/providers';
import {
  useV1ActivePopup,
  useV1AdminLeagueMatch,
  useV1AdminLeagueTeams,
  useV1AdminTeam,
  useV1CancelLeagueFixture,
  useV1GenerateLeagueFixtures,
  useV1RecordLeagueForfeit,
  useV1RegenerateLeagueFixtures,
  useV1RevertLeagueCompletion,
  useV1UpdateLeagueFixture,
} from '@/hooks/use-v1-api';
import LeagueMatchFixturesClient from './league-match-fixtures-client';

vi.mock('@/components/auth/pending-social-signup-gate', () => ({
  PendingSocialSignupGate: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('@/hooks/use-v1-api', () => ({
  useV1ActivePopup: vi.fn(),
  useV1AdminLeagueMatch: vi.fn(),
  useV1AdminLeagueTeams: vi.fn(),
  // R11(C-6): 몰수 모달이 열릴 때만 의미 있는 데이터를 쓴다 — 다른 테스트들은 모달을
  // 열지 않으므로 data: undefined인 기본값으로 충분하다.
  useV1AdminTeam: vi.fn(() => ({ data: undefined })),
  useV1CancelLeagueFixture: vi.fn(),
  useV1GenerateLeagueFixtures: vi.fn(),
  useV1RecordLeagueForfeit: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useV1RegenerateLeagueFixtures: vi.fn(),
  // R6/D-3: 종료 역전이. 대부분의 테스트는 state !== 'completed' 라 버튼 자체가 안 뜨므로
  // 기본값으로 충분하고, 역전이 테스트만 mutate 를 들여다본다.
  useV1RevertLeagueCompletion: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useV1UpdateLeagueFixture: vi.fn(),
  // Providers 안의 ThemeProvider가 전역으로 호출한다 — 이 테스트가 <Providers>로 렌더하는 한 필요.
  useV1Settings: vi.fn(() => ({ data: undefined, isError: false, refetch: vi.fn() })),
  useV1UpdateSettings: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}));

const useV1ActivePopupMock = vi.mocked(useV1ActivePopup, { partial: true });
const useV1AdminLeagueMatchMock = vi.mocked(useV1AdminLeagueMatch, { partial: true });
const useV1AdminLeagueTeamsMock = vi.mocked(useV1AdminLeagueTeams, { partial: true });
const useV1AdminTeamMock = vi.mocked(useV1AdminTeam, { partial: true });
const useV1CancelLeagueFixtureMock = vi.mocked(useV1CancelLeagueFixture, { partial: true });
const useV1RecordLeagueForfeitMock = vi.mocked(useV1RecordLeagueForfeit, { partial: true });
const useV1GenerateLeagueFixturesMock = vi.mocked(useV1GenerateLeagueFixtures, { partial: true });
const useV1RegenerateLeagueFixturesMock = vi.mocked(useV1RegenerateLeagueFixtures, { partial: true });
const useV1UpdateLeagueFixtureMock = vi.mocked(useV1UpdateLeagueFixture, { partial: true });
const useV1RevertLeagueCompletionMock = vi.mocked(useV1RevertLeagueCompletion, { partial: true });

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

  // R12/R13: 기존 테스트는 이 두 훅을 전혀 참조하지 않으므로, 매 테스트 전에 무해한 기본값을
  // 채워둔다 — 안 채우면 컴포넌트가 undefined에서 .data/.mutate를 읽다 그 10개 테스트가 전부 깨진다.
  beforeEach(() => {
    useV1AdminLeagueTeamsMock.mockReturnValue({ data: undefined } as never);
    useV1CancelLeagueFixtureMock.mockReturnValue({ mutate: vi.fn(), isPending: false } as never);
    useV1RegenerateLeagueFixturesMock.mockReturnValue({ mutate: vi.fn(), isPending: false } as never);
    useV1RevertLeagueCompletionMock.mockReturnValue({ mutate: vi.fn(), isPending: false } as never);
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

  // R12
  it('취소 버튼을 누르면 확인 모달이 뜨고, 사유를 입력해 확인해야 취소 mutation을 호출한다', async () => {
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
    const cancelMutate = vi.fn();
    useV1CancelLeagueFixtureMock.mockReturnValue({ mutate: cancelMutate, isPending: false } as never);

    render(
      <Providers>
        <LeagueMatchFixturesClient leagueId="league-1" />
      </Providers>,
    );

    // AdminDataTable은 데스크톱 표 + 모바일 카드 리스트를 동시에 렌더한다(CSS로만 숨김) —
    // 같은 행이라 첫 번째 매치를 눌러도 대표성이 있다(기존 테스트 주석과 동일한 전제).
    fireEvent.click(screen.getAllByRole('button', { name: '취소' })[0]);
    expect(screen.getByText('대진을 취소할까요?')).toBeInTheDocument();
    expect(cancelMutate).not.toHaveBeenCalled();

    fireEvent.change(
      screen.getByPlaceholderText('이 작업이 왜 필요한지 남겨 주세요. 감사 로그에 그대로 기록돼요.'),
      { target: { value: '우천으로 인한 취소' } },
    );
    fireEvent.click(screen.getByRole('button', { name: '대진 취소' }));

    await waitFor(() =>
      expect(cancelMutate).toHaveBeenCalledWith(
        { teamMatchId: 'tm-1', body: { reason: '우천으로 인한 취소' } },
        expect.anything(),
      ),
    );
  });

  // R12
  it('사유 없이는 취소 확인 버튼이 비활성 상태라 취소 mutation이 호출되지 않는다', () => {
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
    const cancelMutate = vi.fn();
    useV1CancelLeagueFixtureMock.mockReturnValue({ mutate: cancelMutate, isPending: false } as never);

    render(
      <Providers>
        <LeagueMatchFixturesClient leagueId="league-1" />
      </Providers>,
    );

    fireEvent.click(screen.getAllByRole('button', { name: '취소' })[0]);
    fireEvent.click(screen.getByRole('button', { name: '대진 취소' }));

    expect(cancelMutate).not.toHaveBeenCalled();
  });

  // R13
  it('대진 재생성 버튼을 누르면 확인 모달이 뜨고, 재생성 문구를 정확히 입력해야 재생성 mutation을 호출한다', async () => {
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
    useV1AdminLeagueTeamsMock.mockReturnValue({
      data: {
        leagueId: 'league-1',
        teams: [
          { teamId: 't1', name: 'A팀', status: 'active', memberCount: 5, logoUrl: null },
          { teamId: 't2', name: 'B팀', status: 'active', memberCount: 5, logoUrl: null },
        ],
      },
    } as never);
    useV1GenerateLeagueFixturesMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
    useV1UpdateLeagueFixtureMock.mockReturnValue({ mutate: vi.fn() } as never);
    const regenMutate = vi.fn();
    useV1RegenerateLeagueFixturesMock.mockReturnValue({ mutate: regenMutate, isPending: false } as never);

    render(
      <Providers>
        <LeagueMatchFixturesClient leagueId="league-1" />
      </Providers>,
    );

    fireEvent.click(screen.getAllByRole('button', { name: '대진 재생성' })[0]);
    expect(screen.getByText('대진을 다시 만들까요?')).toBeInTheDocument();
    expect(screen.getByText('A팀, B팀', { exact: false })).toBeInTheDocument();

    fireEvent.change(
      screen.getByPlaceholderText('이 작업이 왜 필요한지 남겨 주세요. 감사 로그에 그대로 기록돼요.'),
      { target: { value: '팀 로스터 변경으로 재생성' } },
    );
    // 사유만 입력하고(재생성 문구 미입력) 제출 시도 — 버튼이 비활성이라 클릭해도 호출되지 않는다.
    const submitButtons = screen.getAllByRole('button', { name: '대진 재생성' });
    fireEvent.click(submitButtons[submitButtons.length - 1]);
    expect(regenMutate).not.toHaveBeenCalled();

    fireEvent.change(screen.getByPlaceholderText('재생성'), { target: { value: '재생성' } });
    fireEvent.click(screen.getAllByRole('button', { name: '대진 재생성' })[screen.getAllByRole('button', { name: '대진 재생성' }).length - 1]);

    await waitFor(() =>
      expect(regenMutate).toHaveBeenCalledWith({ weeksCount: 7, reason: '팀 로스터 변경으로 재생성' }, expect.anything()),
    );
  });

  // R13
  it('취소된 대진은 상태 배지가 빨간 톤이고 취소 버튼 대신 "취소됨" 텍스트를 보여준다', () => {
    useV1ActivePopupMock.mockReturnValue({ data: undefined, isPending: false } as never);
    useV1AdminLeagueMatchMock.mockReturnValue({
      data: {
        leagueId: 'league-1',
        title: '가을 풋살 리그',
        state: 'active',
        teamIds: ['t1', 't2'],
        fixtures: [
          { teamMatchId: 'tm-1', title: '가을 풋살 리그 1주차', homeTeamId: 't1', awayTeamId: 't2', startAt: '2026-09-01T20:00:00.000Z', placeName: '장소 미정', status: 'cancelled' },
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

    expect(screen.queryAllByRole('button', { name: '취소' })).toHaveLength(0);
    expect(screen.getAllByText('취소됨').length).toBeGreaterThan(0);
  });
  // R11(C-6): 몰수패 처리 버튼 -> 모달 -> 제출까지의 배선을 검증한다.
  it('몰수패 처리 버튼을 눌러 불참팀·사유를 입력하고 제출하면 forfeit mutation을 호출한다', async () => {
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
    useV1AdminTeamMock.mockImplementation(((teamId: string) => ({
      data: teamId === 't1' ? { name: '홈팀FC' } : teamId === 't2' ? { name: '원정팀FC' } : undefined,
    })) as never);
    const mutate = vi.fn();
    useV1RecordLeagueForfeitMock.mockReturnValue({ mutate, isPending: false } as never);

    render(
      <Providers>
        <LeagueMatchFixturesClient leagueId="league-1" />
      </Providers>,
    );

    const [forfeitButton] = screen.getAllByRole('button', { name: '가을 풋살 리그 1주차 몰수패 처리' });
    fireEvent.click(forfeitButton);

    expect(await screen.findByText('원정팀FC 불참')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('변경할 상태'), { target: { value: 't2' } });
    fireEvent.change(screen.getByLabelText(/^사유/), { target: { value: '원정팀이 경기 시작 30분 후에도 도착하지 않았어요.' } });
    fireEvent.click(screen.getByRole('button', { name: '확인' }));

    await waitFor(() => expect(mutate).toHaveBeenCalledWith(
      {
        teamMatchId: 'tm-1',
        body: { noShowTeamId: 't2', reason: '원정팀이 경기 시작 30분 후에도 도착하지 않았어요.' },
      },
      expect.anything(),
    ));
  });

  it('완료된 리그에만 "진행 중으로 되돌리기"가 뜨고, 확인하면 revert mutation을 호출한다', async () => {
    // R6/D-3: 전 대진 확정 시 리그는 자동으로 completed 가 된다. 결과를 정정하려면 되돌려야
    // 하는데 그동안 이 엔드포인트에 화면이 없어 API 를 직접 치지 않는 한 되돌릴 방법이
    // 없었다(2026-08-21 재감사).
    const detail = (state: string) => ({
      data: {
        leagueId: 'league-1',
        title: '가을 풋살 리그',
        state,
        teamIds: ['t1', 't2'],
        fixtures: [
          { teamMatchId: 'tm-1', title: '가을 풋살 리그 1주차', homeTeamId: 't1', awayTeamId: 't2', startAt: '2026-09-01T20:00:00.000Z', placeName: '장소 미정', status: 'completed' },
        ],
      },
      isPending: false,
    });
    useV1ActivePopupMock.mockReturnValue({ data: undefined, isPending: false } as never);
    useV1GenerateLeagueFixturesMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
    useV1UpdateLeagueFixtureMock.mockReturnValue({ mutate: vi.fn() } as never);

    // 진행 중일 때는 버튼이 없어야 한다 — 그 상태에서는 서버가 409 로 막는다.
    useV1AdminLeagueMatchMock.mockReturnValue(detail('active') as never);
    const active = render(
      <Providers>
        <LeagueMatchFixturesClient leagueId="league-1" />
      </Providers>,
    );
    expect(screen.queryByRole('button', { name: '진행 중으로 되돌리기' })).not.toBeInTheDocument();
    active.unmount();

    const revertMutate = vi.fn();
    useV1RevertLeagueCompletionMock.mockReturnValue({ mutate: revertMutate, isPending: false } as never);
    useV1AdminLeagueMatchMock.mockReturnValue(detail('completed') as never);
    render(
      <Providers>
        <LeagueMatchFixturesClient leagueId="league-1" />
      </Providers>,
    );

    fireEvent.click(screen.getByRole('button', { name: '진행 중으로 되돌리기' }));

    // GateConfirmModal 은 사유 입력 후 확인을 눌러야 onConfirm 이 돈다(취소·재생성과 동일).
    const reasonBox = await screen.findByLabelText(/^사유/);
    fireEvent.change(reasonBox, { target: { value: '오심 정정' } });
    fireEvent.click(screen.getByRole('button', { name: '되돌리기' }));

    await waitFor(() => expect(revertMutate).toHaveBeenCalledWith({ reason: '오심 정정' }, expect.anything()));
  });
});
