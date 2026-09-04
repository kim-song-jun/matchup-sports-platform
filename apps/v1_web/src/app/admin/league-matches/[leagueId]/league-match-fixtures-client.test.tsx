import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Providers } from '@/app/providers';
import {
  useV1ActivePopup,
  useV1AddLeagueTeam,
  useV1AdminLeagueMatch,
  useV1AdminLeagueTeams,
  useV1AdminTeam,
  useV1CancelLeagueFixture,
  useV1GenerateLeagueFixtures,
  useV1PreviewLeagueFixtures,
  useV1RecordLeagueForfeit,
  useV1RegenerateLeagueFixtures,
  useV1RemoveLeagueTeam,
  useV1RevertLeagueCompletion,
  useV1Teams,
  useV1UpdateLeagueFixture,
} from '@/hooks/use-v1-api';
import LeagueMatchFixturesClient from './league-match-fixtures-client';

vi.mock('@/components/auth/pending-social-signup-gate', () => ({
  PendingSocialSignupGate: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('@/hooks/use-v1-api', () => ({
  useV1ActivePopup: vi.fn(),
  // 그룹 B 감사 결함 1: 참가팀 추가·제거. 대부분의 테스트는 로스터 조작을 다루지 않으므로
  // 무해한 기본값이면 충분하다.
  useV1AddLeagueTeam: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useV1AdminLeagueMatch: vi.fn(),
  // U1 확장: 득점자 선택 목록 — 기본은 빈 데이터(섹션 숨김). 필요한 테스트만 값을 채운다.
  useV1AdminLeagueTeams: vi.fn(),
  // R11(C-6): 몰수 모달이 열릴 때만 의미 있는 데이터를 쓴다 — 다른 테스트들은 모달을
  // 열지 않으므로 data: undefined인 기본값으로 충분하다.
  useV1AdminTeam: vi.fn(() => ({ data: undefined })),
  useV1CancelLeagueFixture: vi.fn(),
  // U1: 결과 입력·정정. 대부분의 테스트는 결과 처리를 다루지 않으므로 무해한 기본값.
  useV1GenerateLeagueFixtures: vi.fn(),
  // 그룹 B 감사 결함 3: 최초 생성·재생성 공용 미리보기. 미리보기 자체를 다루는 테스트가
  // 없으므로 무해한 기본값.
  useV1PreviewLeagueFixtures: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  useV1RecordLeagueForfeit: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useV1RegenerateLeagueFixtures: vi.fn(),
  useV1RemoveLeagueTeam: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  // R6/D-3: 종료 역전이. 대부분의 테스트는 state !== 'completed' 라 버튼 자체가 안 뜨므로
  // 기본값으로 충분하고, 역전이 테스트만 mutate 를 들여다본다.
  useV1RevertLeagueCompletion: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  // 팀 추가 EntityPicker의 검색 후보 — 빈 목록이면 아무것도 렌더하지 않아 무해하다.
  useV1Teams: vi.fn(() => ({ data: undefined, isFetching: false })),
  useV1UpdateLeagueFixture: vi.fn(),
  // Providers 안의 ThemeProvider가 전역으로 호출한다 — 이 테스트가 <Providers>로 렌더하는 한 필요.
  useV1Settings: vi.fn(() => ({ data: undefined, isError: false, refetch: vi.fn() })),
  useV1UpdateSettings: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}));

const useV1ActivePopupMock = vi.mocked(useV1ActivePopup, { partial: true });
const useV1AddLeagueTeamMock = vi.mocked(useV1AddLeagueTeam, { partial: true });
const useV1AdminLeagueMatchMock = vi.mocked(useV1AdminLeagueMatch, { partial: true });
const useV1AdminLeagueTeamsMock = vi.mocked(useV1AdminLeagueTeams, { partial: true });
const useV1AdminTeamMock = vi.mocked(useV1AdminTeam, { partial: true });
const useV1CancelLeagueFixtureMock = vi.mocked(useV1CancelLeagueFixture, { partial: true });
const useV1PreviewLeagueFixturesMock = vi.mocked(useV1PreviewLeagueFixtures, { partial: true });
const useV1RecordLeagueForfeitMock = vi.mocked(useV1RecordLeagueForfeit, { partial: true });
const useV1GenerateLeagueFixturesMock = vi.mocked(useV1GenerateLeagueFixtures, { partial: true });
const useV1RegenerateLeagueFixturesMock = vi.mocked(useV1RegenerateLeagueFixtures, { partial: true });
const useV1RemoveLeagueTeamMock = vi.mocked(useV1RemoveLeagueTeam, { partial: true });
const useV1UpdateLeagueFixtureMock = vi.mocked(useV1UpdateLeagueFixture, { partial: true });
const useV1RevertLeagueCompletionMock = vi.mocked(useV1RevertLeagueCompletion, { partial: true });
const useV1TeamsMock = vi.mocked(useV1Teams, { partial: true });

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

  // D6(2026-08-24 확정): '상태' 열과 별개로 '결과' 열을 둔다. 이 열이 없던 동안 운영자는
  // 어느 경기가 미입력이고 어느 경기가 상대팀 승인을 기다리는지 화면에서 알 수 없었다.
  // 두 열이 다시 하나로 합쳐지면(= 결과 단계가 대진 상태를 가리면) 이 단언이 깨진다.
  it('대진 표는 대진 상태와 결과 진행 단계를 각각의 열로 보여주고, 확정된 경기에는 스코어를 함께 싣는다', () => {
    useV1ActivePopupMock.mockReturnValue({ data: undefined, isPending: false } as never);
    useV1AdminLeagueMatchMock.mockReturnValue({
      data: {
        leagueId: 'league-1',
        title: '가을 풋살 리그',
        state: 'active',
        teamIds: ['t1', 't2'],
        startsOn: '2026-09-01T00:00:00.000Z',
        recentVenues: [],
        fixtures: [
          {
            teamMatchId: 'tm-official', title: '가을 풋살 리그 1주차', homeTeamId: 't1', awayTeamId: 't2',
            startAt: '2026-09-01T20:00:00.000Z', placeName: '장소 미정', status: 'matched',
            resultStage: 'official', homeScore: 3, awayScore: 1,
          },
          {
            teamMatchId: 'tm-waiting', title: '가을 풋살 리그 2주차', homeTeamId: 't2', awayTeamId: 't1',
            startAt: '2026-09-08T20:00:00.000Z', placeName: '장소 미정', status: 'matched',
            resultStage: 'awaiting_approval', homeScore: null, awayScore: null,
          },
          {
            teamMatchId: 'tm-empty', title: '가을 풋살 리그 3주차', homeTeamId: 't1', awayTeamId: 't2',
            startAt: '2026-09-15T20:00:00.000Z', placeName: '장소 미정', status: 'matched',
            resultStage: 'not_entered', homeScore: null, awayScore: null,
          },
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

    expect(screen.getByRole('columnheader', { name: '결과' })).toBeInTheDocument();
    // 상태 열이 사라지지 않았는지도 함께 고정한다 — 합치는 회귀를 잡는 게 이 테스트의 목적이다.
    expect(screen.getByRole('columnheader', { name: '상태' })).toBeInTheDocument();

    // 열 **순서**까지 고정한다. 처음엔 결과를 맨 끝(관리 앞)에 뒀는데, alpha 1440 실측에서
    // 표 스크롤러가 clientWidth 898 / scrollWidth 1201 이라 결과 열이 보이는 영역 밖으로
    // 밀려 가로 스크롤을 해야만 보였다 — 운영자가 한눈에 막힌 경기를 짚게 하려고 만든
    // 열이 기본 상태에서 안 보이면 기능이 성립하지 않는다. 그래서 '경기' 바로 뒤에 둔다.
    const headers = screen.getAllByRole('columnheader').map((cell) => cell.textContent?.trim());
    expect(headers.indexOf('결과')).toBe(headers.indexOf('경기') + 1);

    // AdminDataTable 은 같은 행을 데스크톱 표와 모바일 카드로 각각 렌더한다 —
    // 그래서 개수가 아니라 "존재"만 본다(getAllByText).
    expect(screen.getAllByText('확정').length).toBeGreaterThan(0);
    expect(screen.getAllByText('3 : 1').length).toBeGreaterThan(0);
    expect(screen.getAllByText('승인 대기').length).toBeGreaterThan(0);
    expect(screen.getAllByText('결과 미입력').length).toBeGreaterThan(0);
  });

  // 취소된 대진은 결과를 기다리지 않는다 — '미입력'으로 그리면 영원히 처리해야 할 일처럼 보인다.
  it('취소된 대진에는 결과 단계를 그리지 않는다', () => {
    useV1ActivePopupMock.mockReturnValue({ data: undefined, isPending: false } as never);
    useV1AdminLeagueMatchMock.mockReturnValue({
      data: {
        leagueId: 'league-1',
        title: '가을 풋살 리그',
        state: 'active',
        teamIds: ['t1', 't2'],
        startsOn: '2026-09-01T00:00:00.000Z',
        recentVenues: [],
        fixtures: [
          {
            teamMatchId: 'tm-cancelled', title: '가을 풋살 리그 1주차', homeTeamId: 't1', awayTeamId: 't2',
            startAt: '2026-09-01T20:00:00.000Z', placeName: '장소 미정', status: 'cancelled',
            resultStage: 'not_entered', homeScore: null, awayScore: null,
          },
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

    expect(screen.queryByText('결과 미입력')).not.toBeInTheDocument();
  });

  it('일시 입력 칸에 표시되는 값이 서버가 내려준 UTC 시각과 동일한 순간(instant)을 나타낸다 (로컬시간 미변환 시 9시간 어긋남 회귀 방지)', () => {
    useV1ActivePopupMock.mockReturnValue({ data: undefined, isPending: false } as never);
    useV1AdminLeagueMatchMock.mockReturnValue({
      data: {
        leagueId: 'league-1',
        title: '가을 풋살 리그',
        state: 'active',
        teamIds: ['t1', 't2'],
        startsOn: '2026-09-01T00:00:00.000Z',
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
        startsOn: '2026-09-01T00:00:00.000Z',
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

  // 감사 결함 1: title이 "N주차" 자동 생성이라 모든 행이 똑같이 보였다 — 표가 참가팀
  // 목록(teamsData)으로 id를 이름으로 바꿔 홈팀 vs 원정팀을 보여줘야 한다. 이 단언이
  // 없으면 title만 다시 렌더하는 회귀를 못 잡는다.
  it('대진 표는 자동생성 title 대신 홈팀 vs 원정팀 이름을 보여주고, 부전(bye) 행은 부전승으로 표시한다', () => {
    useV1ActivePopupMock.mockReturnValue({ data: undefined, isPending: false } as never);
    useV1AdminLeagueMatchMock.mockReturnValue({
      data: {
        leagueId: 'league-1',
        title: '가을 풋살 리그',
        state: 'active',
        teamIds: ['t1', 't2', 't3'],
        startsOn: '2026-09-01T00:00:00.000Z',
        fixtures: [
          { teamMatchId: 'tm-1', title: '가을 풋살 리그 1주차', homeTeamId: 't1', awayTeamId: 't2', startAt: '2026-09-01T20:00:00.000Z', placeName: '장소 미정', status: 'matched' },
          { teamMatchId: 'tm-2', title: '가을 풋살 리그 1주차', homeTeamId: 't3', awayTeamId: null, startAt: '2026-09-01T20:00:00.000Z', placeName: '장소 미정', status: 'matched' },
        ],
      },
      isPending: false,
    } as never);
    useV1AdminLeagueTeamsMock.mockReturnValue({
      data: {
        leagueId: 'league-1',
        teams: [
          { teamId: 't1', name: '독수리FC', status: 'active', memberCount: 5, logoUrl: null },
          { teamId: 't2', name: '호랑이FC', status: 'active', memberCount: 5, logoUrl: null },
          { teamId: 't3', name: '사자FC', status: 'active', memberCount: 5, logoUrl: null },
        ],
      },
    } as never);
    useV1GenerateLeagueFixturesMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
    useV1UpdateLeagueFixtureMock.mockReturnValue({ mutate: vi.fn() } as never);

    render(
      <Providers>
        <LeagueMatchFixturesClient leagueId="league-1" />
      </Providers>,
    );

    expect(screen.getAllByText('독수리FC vs 호랑이FC').length).toBeGreaterThan(0);
    expect(screen.getAllByText('사자FC 부전승').length).toBeGreaterThan(0);
  });

  it('대진이 없으면 요일/시각/장소를 선택하지 않아도 주차 수만으로 생성할 수 있다(기존 동작 보존)', async () => {
    useV1ActivePopupMock.mockReturnValue({ data: undefined, isPending: false } as never);
    useV1AdminLeagueMatchMock.mockReturnValue({
      data: { leagueId: 'league-1', title: '가을 풋살 리그', startsOn: '2026-09-01T00:00:00.000Z', state: 'draft', teamIds: ['t1', 't2'], fixtures: [] },
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

  it('리그 시작일이 응답에 없으면 대진 생성·미리보기를 잠그고 이유를 알린다 — 조용히 틀린 날짜로 만들지 않는다', async () => {
    // 화면은 요일을 **리그 시작일 기준**으로 날짜 목록으로 펼쳐 보낸다. 시작일이 없다고
    // 오늘 기준으로 떨어뜨리면 다음 달에 시작하는 리그가 이번 주부터 경기를 갖게 되고,
    // 서버는 그걸 막지 않는다(과거만 거부한다). 만들지 못하게 막는 쪽이 맞다.
    useV1ActivePopupMock.mockReturnValue({ data: undefined, isPending: false } as never);
    useV1AdminLeagueMatchMock.mockReturnValue({
      // startsOn 없음 — 구버전 API 를 보고 있는 상황.
      data: { leagueId: 'league-1', title: '가을 풋살 리그', state: 'draft', teamIds: ['t1', 't2'], fixtures: [] },
      isPending: false,
    } as never);
    const mutateAsync = vi.fn();
    const previewMutateAsync = vi.fn();
    useV1GenerateLeagueFixturesMock.mockReturnValue({ mutateAsync, isPending: false } as never);
    useV1PreviewLeagueFixturesMock.mockReturnValue({ mutateAsync: previewMutateAsync, isPending: false } as never);
    useV1UpdateLeagueFixtureMock.mockReturnValue({ mutate: vi.fn() } as never);

    render(
      <Providers>
        <LeagueMatchFixturesClient leagueId="league-1" />
      </Providers>,
    );

    // 표·참가팀 같은 나머지 화면은 그대로 떠 있어야 한다 — 흰 화면이 되면 안 된다.
    expect(screen.getByText('참가팀 관리')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('리그 시작일 정보를 불러오지 못했어요. 새로고침해 주세요.');

    const generateButton = screen.getByRole('button', { name: '라운드로빈 대진 생성' });
    const previewButton = screen.getByRole('button', { name: '미리보기' });
    expect(generateButton).toBeDisabled();
    expect(previewButton).toBeDisabled();

    fireEvent.click(generateButton);
    fireEvent.click(previewButton);
    expect(mutateAsync).not.toHaveBeenCalled();
    expect(previewMutateAsync).not.toHaveBeenCalled();
  });

  it('요일·시각·장소를 채우고 생성하면 schedule과 placeName을 함께 전달한다', async () => {
    useV1ActivePopupMock.mockReturnValue({ data: undefined, isPending: false } as never);
    useV1AdminLeagueMatchMock.mockReturnValue({
      data: { leagueId: 'league-1', title: '가을 풋살 리그', startsOn: '2026-09-01T00:00:00.000Z', state: 'draft', teamIds: ['t1', 't2'], fixtures: [] },
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
    fireEvent.change(screen.getByLabelText('시작 시각'), { target: { value: '19:30' } });
    fireEvent.change(screen.getByLabelText('기본 장소'), { target: { value: '상암 풋살파크' } });
    fireEvent.click(screen.getByRole('button', { name: '라운드로빈 대진 생성' }));

    // **서버는 요일을 모른다** — 화면이 날짜 목록으로 전개해 보내야 한다(Task 164 BE-2).
    // 정확한 날짜 계산은 시계를 주입하는 `lib/league-fixture-dates.test.ts` 가 고정하고,
    // 여기서는 **계약**을 지킨다: dates 배열이 오고 dayOfWeek 는 가지 않는다.
    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
    const payload = mutateAsync.mock.calls[0][0] as {
      weeksCount: number;
      schedule: { dates: string[]; time: string };
      placeName: string;
    };
    expect(payload.weeksCount).toBe(7);
    expect(payload.placeName).toBe('상암 풋살파크');
    expect(payload.schedule.time).toBe('19:30');
    expect(payload.schedule).not.toHaveProperty('dayOfWeek');
    // 주차 수만큼, 전부 토요일(KST), 전부 미래 — 서버가 거부하지 않는 값이어야 한다.
    expect(payload.schedule.dates).toHaveLength(7);
    // 기준 시각은 **루프 전에 한 번** 잡는다. 루프 안에서 매번 `Date.now()` 를 읽으면
    // 기준선이 반복마다 앞으로 가서, 첫 날짜가 지금 직후인 경계에서 간헐적으로 깨진다.
    // 서버의 과거 판정도 `startAt < now` 라 같은 순간은 통과한다 — 그래서 `>=` 다.
    const sentAt = Date.now();
    for (const date of payload.schedule.dates) {
      expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      const [y, m, d] = date.split('-').map(Number);
      expect(new Date(Date.UTC(y, m - 1, d)).getUTCDay()).toBe(6);
      expect(new Date(Date.UTC(y, m - 1, d, 19, 30) - 9 * 60 * 60 * 1000).getTime()).toBeGreaterThanOrEqual(sentAt);
    }
  });

  it('화면을 열어 둔 채 시각이 지나면 밀린 날짜를 보낸다 — 날짜는 렌더가 아니라 전송 시점에 계산한다', async () => {
    // 운영자가 금요일 17:59 에 폼을 채워 두고 18:05 에 [생성] 을 누르는 상황. 렌더 시점 값을
    // 들고 있으면 이미 지난 그 날짜를 보내 서버가 422 LEAGUE_SCHEDULE_DATE_PAST 로 거부한다 —
    // 운영자는 아무것도 안 바꿨는데 갑자기 실패한다.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      // 2026-09-04(금) 10:00 KST — 그날 18:00 은 아직 안 지났다.
      vi.setSystemTime(new Date('2026-09-04T01:00:00.000Z'));
      useV1ActivePopupMock.mockReturnValue({ data: undefined, isPending: false } as never);
      useV1AdminLeagueMatchMock.mockReturnValue({
        data: {
          leagueId: 'league-1', title: '가을 풋살 리그', startsOn: '2026-08-01T00:00:00.000Z',
          state: 'draft', teamIds: ['t1', 't2'], fixtures: [],
        },
        isPending: false,
      } as never);
      const mutateAsync = vi.fn().mockResolvedValue({ leagueId: 'league-1', createdCount: 1, teamMatchIds: [], warnings: [] });
      useV1GenerateLeagueFixturesMock.mockReturnValue({ mutateAsync, isPending: false } as never);
      useV1UpdateLeagueFixtureMock.mockReturnValue({ mutate: vi.fn() } as never);

      render(
        <Providers>
          <LeagueMatchFixturesClient leagueId="league-1" />
        </Providers>,
      );

      fireEvent.change(screen.getByLabelText('주차 수'), { target: { value: '1' } });
      fireEvent.change(screen.getByLabelText('요일'), { target: { value: '5' } });
      fireEvent.change(screen.getByLabelText('시작 시각'), { target: { value: '18:00' } });
      // 여기까지의 렌더 시점 계산이라면 첫 날은 2026-09-04 다.

      // 같은 날 20:00 KST — 18:00 이 지났다. 폼 값은 아무것도 바꾸지 않아 재렌더도 없다.
      vi.setSystemTime(new Date('2026-09-04T11:00:00.000Z'));
      fireEvent.click(screen.getByRole('button', { name: '라운드로빈 대진 생성' }));

      expect(mutateAsync).toHaveBeenCalledTimes(1);
      const payload = mutateAsync.mock.calls[0][0] as { schedule: { dates: string[] } };
      expect(payload.schedule.dates).toEqual(['2026-09-11']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('요일을 고르고 시각을 비우면 서버 400 대신 안내 토스트를 보여주고 제출하지 않는다', async () => {
    useV1ActivePopupMock.mockReturnValue({ data: undefined, isPending: false } as never);
    useV1AdminLeagueMatchMock.mockReturnValue({
      data: { leagueId: 'league-1', title: '가을 풋살 리그', startsOn: '2026-09-01T00:00:00.000Z', state: 'draft', teamIds: ['t1', 't2'], fixtures: [] },
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
    fireEvent.change(screen.getByLabelText('시작 시각'), { target: { value: '' } });
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
        startsOn: '2026-09-01T00:00:00.000Z',
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
        startsOn: '2026-09-01T00:00:00.000Z',
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
      data: { leagueId: 'league-1', title: '가을 풋살 리그', startsOn: '2026-09-01T00:00:00.000Z', state: 'draft', teamIds: ['t1', 't2'], fixtures: [], recentVenues: [] },
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
        startsOn: '2026-09-01T00:00:00.000Z',
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
    fireEvent.click(screen.getAllByRole('button', { name: '가을 풋살 리그 1주차 취소' })[0]);
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
        startsOn: '2026-09-01T00:00:00.000Z',
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

    fireEvent.click(screen.getAllByRole('button', { name: '가을 풋살 리그 1주차 취소' })[0]);
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
        startsOn: '2026-09-01T00:00:00.000Z',
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
        startsOn: '2026-09-01T00:00:00.000Z',
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
        startsOn: '2026-09-01T00:00:00.000Z',
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

  // 감사 결함 2: 서버는 이미 확정된 몰수를 "다른 팀"으로 정정하려는 요청을 DB에
  // 반영하지 않고 alreadyProcessed:true + requestMatchesStored:false 로 응답한다
  // (league-lifecycle-rules.ts). 화면이 alreadyProcessed만 보고 성공 토스트를 띄우면
  // 운영자는 정정이 반영된 줄 오인한다 — 실패로 분기하는지 검증한다.
  it('몰수 정정이 이미 다른 결과로 확정돼 반영되지 않으면(requestMatchesStored:false) 성공이 아니라 경고 토스트를 보여준다', async () => {
    useV1ActivePopupMock.mockReturnValue({ data: undefined, isPending: false } as never);
    useV1AdminLeagueMatchMock.mockReturnValue({
      data: {
        leagueId: 'league-1',
        title: '가을 풋살 리그',
        state: 'active',
        teamIds: ['t1', 't2'],
        startsOn: '2026-09-01T00:00:00.000Z',
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
    const mutate = vi.fn((_vars, opts) => {
      opts.onSuccess({
        teamMatchId: 'tm-1',
        leagueId: 'league-1',
        noShowTeamId: 't1',
        winningTeamId: 't2',
        homeScore: 0,
        awayScore: 1,
        resultRevisionId: 'rev-1',
        alreadyProcessed: true,
        requestMatchesStored: false,
      });
    });
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
    fireEvent.change(screen.getByLabelText(/^사유/), { target: { value: '반대 팀으로 정정 시도' } });
    fireEvent.click(screen.getByRole('button', { name: '확인' }));

    expect(await screen.findByText('이미 다른 결과로 확정돼 있어 반영되지 않았어요. 되돌린 뒤 다시 처리해 주세요.')).toBeInTheDocument();
    expect(screen.queryByText('몰수패로 처리했어요.')).not.toBeInTheDocument();
    expect(screen.queryByText('이미 몰수 처리된 대진이에요.')).not.toBeInTheDocument();
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
        startsOn: '2026-09-01T00:00:00.000Z',
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

  // U1(A안 "확정 다이얼로그") — '관리' 열 버튼은 결과 진행 단계에 따라 갈린다.
  // 감사 확인(A-league-void-stage): voided(무효화된 결과)도 백엔드가 신규 입력을 이미
  // 허용하므로 '결과 입력' 버튼이 떠야 한다 — 여기서 빠지면 무효 대진은 재입력 버튼
  // 자체가 사라져 그 시즌 승강 확정이 영구히 막힌다.
  it('결과 진행 단계에 따라 관리 버튼 레이블이 바뀐다 — 미확정 4단계(voided 포함)는 결과 입력, 확정이면 결과 정정, 승인대기 단계는 버튼이 없다', () => {
    useV1ActivePopupMock.mockReturnValue({ data: undefined, isPending: false } as never);
    useV1AdminLeagueMatchMock.mockReturnValue({
      data: {
        leagueId: 'league-1',
        title: '가을 풋살 리그',
        state: 'active',
        teamIds: ['t1', 't2'],
        startsOn: '2026-09-01T00:00:00.000Z',
        fixtures: [
          { teamMatchId: 'tm-not-entered', title: '1주차', homeTeamId: 't1', awayTeamId: 't2', startAt: '2026-09-01T20:00:00.000Z', placeName: '장소 미정', status: 'matched', resultStage: 'not_entered', homeScore: null, awayScore: null },
          { teamMatchId: 'tm-draft', title: '2주차', homeTeamId: 't1', awayTeamId: 't2', startAt: '2026-09-08T20:00:00.000Z', placeName: '장소 미정', status: 'matched', resultStage: 'draft', homeScore: null, awayScore: null },
          { teamMatchId: 'tm-change-requested', title: '3주차', homeTeamId: 't1', awayTeamId: 't2', startAt: '2026-09-15T20:00:00.000Z', placeName: '장소 미정', status: 'matched', resultStage: 'change_requested', homeScore: null, awayScore: null },
          { teamMatchId: 'tm-official', title: '4주차', homeTeamId: 't1', awayTeamId: 't2', startAt: '2026-09-22T20:00:00.000Z', placeName: '장소 미정', status: 'completed', resultStage: 'official', homeScore: 3, awayScore: 1 },
          { teamMatchId: 'tm-awaiting', title: '5주차', homeTeamId: 't1', awayTeamId: 't2', startAt: '2026-09-29T20:00:00.000Z', placeName: '장소 미정', status: 'matched', resultStage: 'awaiting_approval', homeScore: null, awayScore: null },
          { teamMatchId: 'tm-voided', title: '6주차', homeTeamId: 't1', awayTeamId: 't2', startAt: '2026-10-06T20:00:00.000Z', placeName: '장소 미정', status: 'matched', resultStage: 'voided', homeScore: null, awayScore: null },
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

    // Task 165 BE-3: 모달 버튼이 아니라 **콘솔 딥링크**다. 레이블 규칙은 그대로 두되
    // 링크가 어디로 가는지까지 본다 — 레이블만 보면 href 가 깨져도 통과한다.
    expect(screen.getAllByRole('link', { name: '1주차 결과 입력' })[0]).toHaveAttribute(
      'href',
      '/admin/live/league-1/result-review?fixtureId=tm-not-entered',
    );
    // 확정된 경기는 **정정 화면**으로 간다. `result-review` 는 *검토 대기* 목록이라
    // 확정된 경기가 거기 없어, 라벨은 "결과 정정" 인데 "검토할 결과가 없어요" 가 열리는
    // 데드엔드였다(alpha 실측). 라벨이 아니라 **href** 로 잰다 — 라벨만 보면 이 결함이
    // 그대로 통과한다.
    expect(screen.getAllByRole('link', { name: '4주차 결과 정정' })[0]).toHaveAttribute(
      'href',
      '/admin/live/league-1/records/corrections?fixtureId=tm-official',
    );
    expect(screen.getAllByRole('link', { name: '2주차 결과 입력' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: '3주차 결과 입력' }).length).toBeGreaterThan(0);
    // 승인대기(awaiting_approval)는 운영자 직접 입력 대상이 아니라 링크가 없다.
    expect(screen.queryAllByRole('link', { name: '5주차 결과 입력' })).toHaveLength(0);
    expect(screen.queryAllByRole('link', { name: '5주차 결과 정정' })).toHaveLength(0);
    // voided 는 '결과 정정'이 아니라 '결과 입력'으로 떠야 한다 — 무효화된 결과는 재입력
    // 대상이고, 정정 레이블이 뜨면 백엔드의 재입력 흐름과 어긋난다.
    expect(screen.getAllByRole('link', { name: '6주차 결과 입력' }).length).toBeGreaterThan(0);
    expect(screen.queryAllByRole('link', { name: '6주차 결과 정정' })).toHaveLength(0);
  });

  // U1: 요구사항 3 — 정정 모드는 확정 전 "전 → 후" 비교를 보여준다. 이게 이 안의 존재 이유라
  // 빼먹으면 안 된다.

  // U1: 요구사항 5 — mutation 훅은 다른 어드민 리그 훅들과 같은 패턴을 따른다. 여기서는
  // 엔드포인트·body가 서버 계약(RecordLeagueResultDto: homeScore/awayScore/reason)과
  // 정확히 맞는지 배선을 검증한다.

});

// 대진 timing(경기 시간·휴식·팀당 하루 경기 수) — C안(시간창 역산) + B안(계산기 카드·타임라인) 결합.
describe('LeagueMatchFixturesClient — 대진 timing 설정', () => {
  beforeEach(() => {
    useV1ActivePopupMock.mockReturnValue({ data: undefined, isPending: false } as never);
    useV1CancelLeagueFixtureMock.mockReturnValue({ mutate: vi.fn(), isPending: false } as never);
    useV1RegenerateLeagueFixturesMock.mockReturnValue({ mutate: vi.fn(), isPending: false } as never);
    useV1RevertLeagueCompletionMock.mockReturnValue({ mutate: vi.fn(), isPending: false } as never);
    useV1UpdateLeagueFixtureMock.mockReturnValue({ mutate: vi.fn() } as never);
    useV1AdminLeagueMatchMock.mockReturnValue({
      data: {
        leagueId: 'league-1',
        title: '심야 풋살 리그',
        state: 'draft',
        teamIds: ['t1', 't2', 't3', 't4'],
        startsOn: '2026-09-01T00:00:00.000Z',
        fixtures: [],
      },
      isPending: false,
    } as never);
    useV1AdminLeagueTeamsMock.mockReturnValue({
      data: {
        leagueId: 'league-1',
        teams: [
          { teamId: 't1', name: '독수리FC', status: 'active', memberCount: 5, logoUrl: null },
          { teamId: 't2', name: '호랑이FC', status: 'active', memberCount: 5, logoUrl: null },
          { teamId: 't3', name: '사자FC', status: 'active', memberCount: 5, logoUrl: null },
          { teamId: 't4', name: '표범FC', status: 'active', memberCount: 5, logoUrl: null },
        ],
      },
    } as never);
  });

  it('경기 시간·휴식·팀당 하루 경기를 채우고 생성하면 timing을 함께 전달한다', async () => {
    const mutateAsync = vi.fn().mockResolvedValue({ leagueId: 'league-1', createdCount: 6, teamMatchIds: [], warnings: [] });
    useV1GenerateLeagueFixturesMock.mockReturnValue({ mutateAsync, isPending: false } as never);

    render(
      <Providers>
        <LeagueMatchFixturesClient leagueId="league-1" />
      </Providers>,
    );

    fireEvent.change(screen.getByLabelText('요일'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('시작 시각'), { target: { value: '22:00' } });
    fireEvent.change(screen.getByLabelText('경기 시간(분)'), { target: { value: '15' } });
    fireEvent.change(screen.getByLabelText('휴식(분)'), { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText('팀당 하루 경기'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: '라운드로빈 대진 생성' }));

    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({
        weeksCount: 7,
        // 수요일 7개가 전개돼 온다(정확한 날짜는 lib/league-fixture-dates.test.ts 가 고정).
        schedule: { dates: expect.any(Array), time: '22:00' },
        timing: { gameDurationMinutes: 15, breakMinutes: 5, gamesPerTeamPerDay: 3 },
      }),
    );
  });

  it('이용 종료 시각까지 넣으면 팀당 경기 수를 역산 제안하고 "이대로 적용"이 값을 채운다', () => {
    useV1GenerateLeagueFixturesMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);

    render(
      <Providers>
        <LeagueMatchFixturesClient leagueId="league-1" />
      </Providers>,
    );

    fireEvent.change(screen.getByLabelText('요일'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('시작 시각'), { target: { value: '22:00' } });
    fireEvent.change(screen.getByLabelText('종료 시각'), { target: { value: '00:00' } });
    fireEvent.change(screen.getByLabelText('경기 시간(분)'), { target: { value: '15' } });
    fireEvent.change(screen.getByLabelText('휴식(분)'), { target: { value: '5' } });

    expect(screen.getByText(/팀당 3경기 · 하루 6경기/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '이대로 적용' }));
    expect((screen.getByLabelText('팀당 하루 경기') as HTMLInputElement).value).toBe('3');

    // B안 결합: 하루 운영 계산 카드가 종료 시각까지 보여준다.
    expect(screen.getByText('하루 운영 계산')).toBeInTheDocument();
    expect(screen.getAllByText(/23:55/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/1시간 55분/).length).toBeGreaterThan(0);
  });

  it('경기 시간 없이 팀당 하루 경기만 넣고 생성하면 안내 토스트를 띄우고 제출하지 않는다', async () => {
    const mutateAsync = vi.fn();
    useV1GenerateLeagueFixturesMock.mockReturnValue({ mutateAsync, isPending: false } as never);

    render(
      <Providers>
        <LeagueMatchFixturesClient leagueId="league-1" />
      </Providers>,
    );

    fireEvent.change(screen.getByLabelText('팀당 하루 경기'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: '라운드로빈 대진 생성' }));

    expect(await screen.findByText(/경기 시간\(분\)을 입력/)).toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it('경기 시간이 서버 허용 범위(5~240분)를 벗어나면 범위 안내 토스트를 띄우고 제출하지 않는다', async () => {
    const mutateAsync = vi.fn();
    useV1GenerateLeagueFixturesMock.mockReturnValue({ mutateAsync, isPending: false } as never);

    render(
      <Providers>
        <LeagueMatchFixturesClient leagueId="league-1" />
      </Providers>,
    );

    fireEvent.change(screen.getByLabelText('경기 시간(분)'), { target: { value: '300' } });
    fireEvent.click(screen.getByRole('button', { name: '라운드로빈 대진 생성' }));

    expect(await screen.findByText(/5~240분/)).toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it('참가팀이 2개 미만이면 "시간창" 경고를 띄우지 않는다(원인은 팀 부족이지 시간창이 아님)', () => {
    useV1AdminLeagueMatchMock.mockReturnValue({
      data: { leagueId: 'league-1', title: '외로운 리그', startsOn: '2026-09-01T00:00:00.000Z', state: 'draft', teamIds: ['t1'], fixtures: [] },
      isPending: false,
    } as never);
    useV1GenerateLeagueFixturesMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);

    render(
      <Providers>
        <LeagueMatchFixturesClient leagueId="league-1" />
      </Providers>,
    );

    fireEvent.change(screen.getByLabelText('요일'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('시작 시각'), { target: { value: '22:00' } });
    fireEvent.change(screen.getByLabelText('종료 시각'), { target: { value: '00:00' } });
    fireEvent.change(screen.getByLabelText('경기 시간(분)'), { target: { value: '15' } });

    expect(screen.queryByText(/한 라운드도 못 치러요/)).not.toBeInTheDocument();
  });

  it('휴식에 정수가 아닌 값이 있으면 계산 카드·역산 제안을 숨긴다(폴백 값으로 잘못 계산해 보여주지 않음)', () => {
    useV1GenerateLeagueFixturesMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);

    render(
      <Providers>
        <LeagueMatchFixturesClient leagueId="league-1" />
      </Providers>,
    );

    fireEvent.change(screen.getByLabelText('경기 시간(분)'), { target: { value: '15' } });
    expect(screen.getByText('하루 운영 계산')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('휴식(분)'), { target: { value: '5.5' } });
    expect(screen.queryByText('하루 운영 계산')).not.toBeInTheDocument();
  });

  it('경기 시간에 소수를 입력하면 정수 안내 토스트를 띄우고 제출하지 않는다', async () => {
    const mutateAsync = vi.fn();
    useV1GenerateLeagueFixturesMock.mockReturnValue({ mutateAsync, isPending: false } as never);

    render(
      <Providers>
        <LeagueMatchFixturesClient leagueId="league-1" />
      </Providers>,
    );

    fireEvent.change(screen.getByLabelText('경기 시간(분)'), { target: { value: '15.5' } });
    fireEvent.click(screen.getByRole('button', { name: '라운드로빈 대진 생성' }));

    expect(await screen.findByText(/정수로만 입력/)).toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it('재생성 확인 모달에서도 timing 선제 검증이 동작한다(경기 시간 없이 팀당만 입력하면 미호출)', async () => {
    useV1AdminLeagueMatchMock.mockReturnValue({
      data: {
        leagueId: 'league-1',
        title: '심야 풋살 리그',
        state: 'active',
        teamIds: ['t1', 't2'],
        startsOn: '2026-09-01T00:00:00.000Z',
        fixtures: [
          { teamMatchId: 'tm-1', title: '심야 풋살 리그 1주차', homeTeamId: 't1', awayTeamId: 't2', startAt: '2026-09-01T20:00:00.000Z', placeName: '장소 미정', status: 'matched' },
        ],
      },
      isPending: false,
    } as never);
    useV1GenerateLeagueFixturesMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
    const regenMutate = vi.fn();
    useV1RegenerateLeagueFixturesMock.mockReturnValue({ mutate: regenMutate, isPending: false } as never);

    render(
      <Providers>
        <LeagueMatchFixturesClient leagueId="league-1" />
      </Providers>,
    );

    fireEvent.change(screen.getByLabelText('팀당 하루 경기'), { target: { value: '3' } });
    fireEvent.click(screen.getAllByRole('button', { name: '대진 재생성' })[0]);
    fireEvent.change(
      screen.getByPlaceholderText('이 작업이 왜 필요한지 남겨 주세요. 감사 로그에 그대로 기록돼요.'),
      { target: { value: '테스트 재생성' } },
    );
    fireEvent.change(screen.getByPlaceholderText('재생성'), { target: { value: '재생성' } });
    fireEvent.click(screen.getAllByRole('button', { name: '대진 재생성' })[screen.getAllByRole('button', { name: '대진 재생성' }).length - 1]);

    expect(await screen.findByText(/경기 시간\(분\)을 입력/)).toBeInTheDocument();
    expect(regenMutate).not.toHaveBeenCalled();
  });

  it('timing 미리보기 응답은 매치데이 타임라인으로 렌더된다', async () => {
    useV1GenerateLeagueFixturesMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
    const previewMutateAsync = vi.fn().mockResolvedValue({
      leagueId: 'league-1',
      rounds: 3,
      matchdayCount: 1,
      fixtureCount: 6,
      placeName: '베이컨 풋살장',
      fixtures: [
        { round: 1, matchday: 1, orderInDay: 1, homeTeamId: 't1', awayTeamId: 't2', startAt: '2026-09-02T13:00:00.000Z', endAt: '2026-09-02T13:15:00.000Z' },
        { round: 1, matchday: 1, orderInDay: 2, homeTeamId: 't3', awayTeamId: 't4', startAt: '2026-09-02T13:20:00.000Z', endAt: '2026-09-02T13:35:00.000Z' },
      ],
      warnings: [],
    });
    useV1PreviewLeagueFixturesMock.mockReturnValue({ mutateAsync: previewMutateAsync, isPending: false } as never);

    render(
      <Providers>
        <LeagueMatchFixturesClient leagueId="league-1" />
      </Providers>,
    );

    fireEvent.click(screen.getByRole('button', { name: '미리보기' }));

    // KST(TZ 고정): 13:00Z = 22:00, 매치데이 헤더 + 경기별 시간 범위.
    expect(await screen.findByText(/1주 · 6경기/)).toBeInTheDocument();
    expect(screen.getByText(/1주차/)).toBeInTheDocument();
    expect(screen.getByText('22:00~22:15')).toBeInTheDocument();
    expect(screen.getByText('22:20~22:35')).toBeInTheDocument();
    expect(screen.getByText('독수리FC vs 호랑이FC')).toBeInTheDocument();
  });
});

/**
 * 마감이 `null` 인 것은 계약상 **기한 없이 열림**이지 "안 받음" 이 아니다. 마감 유무로
 * 받는지를 추론하면 이미 모집 중인 리그에 "마감을 정하면 신청할 수 있어요" 라고 반대로
 * 말한다 — 같은 실수가 신청 관리 화면에도 있었다(#1028 리뷰 2회).
 */
describe('참가 신청 요약 카드', () => {
  function renderWith(registrationOpen: boolean, registrationDeadlineAt: string | null) {
    useV1AdminLeagueMatchMock.mockReturnValue({
      data: {
        leagueId: 'league-1',
        title: '가을 풋살 리그',
        state: 'active',
        teamIds: ['t1', 't2'],
        startsOn: '2026-09-01T00:00:00.000Z',
        recentVenues: [],
        fixtures: [],
        registrationOpen,
        registrationDeadlineAt,
      },
      isPending: false,
    } as never);
    render(
      <Providers>
        <LeagueMatchFixturesClient leagueId="league-1" />
      </Providers>,
    );
  }

  it('마감이 있고 열려 있으면 언제까지 받는지 말한다', async () => {
    // 2026-09-04 사용자 확정 이후 판정자는 마감 하나다 — "열려 있는데 마감이 없는" 상태는
    // 더는 성립하지 않는다(정본 §6: 안 정하면 안 받는다). 앞선 PR 에서 내가 반대로 적었다.
    renderWith(true, '2026-09-30T02:00:00.000Z');
    expect(await screen.findByText('모집 중')).toBeInTheDocument();
    expect(screen.getByText(/까지 신청을 받아요\./)).toBeInTheDocument();
    expect(screen.queryByText(/신청 마감을 정하면/)).not.toBeInTheDocument();
  });

  it('안 받는 중이면 마감을 정하라고 안내한다', async () => {
    renderWith(false, null);
    expect(await screen.findByText('신청 안 받는 중')).toBeInTheDocument();
    expect(screen.getByText('신청 마감을 정하면 팀장이 리그 화면에서 바로 신청할 수 있어요.')).toBeInTheDocument();
  });
});
