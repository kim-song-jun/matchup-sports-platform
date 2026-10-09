import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
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

const adminCanWrite = vi.hoisted(() => ({ value: true }));
vi.mock('@/hooks/use-admin-can-write', () => ({ useAdminCanWrite: () => adminCanWrite.value }));

const canvasMocks = vi.hoisted(() => ({ applyTemplate: vi.fn() }));
vi.mock('@/hooks/use-v1-bracket-canvas', () => ({
  useV1ApplyLeagueTemplate: () => ({ mutateAsync: canvasMocks.applyTemplate, isPending: false }),
  useV1AssignTournamentSlot: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useV1RandomFillSlots: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

// 트레이·패널 내부는 PR-3 와 Task 6 테스트가 지킨다. 여기서는 보드가 부모의 일정 수정·취소 모달로 이어지는 배선만 본다.
vi.mock('@/components/admin/bracket-canvas/bracket-team-tray', () => ({
  BracketTeamTray: () => <div data-testid="tray" />,
}));
vi.mock('@/components/admin/bracket-canvas/league-fixture-panel', () => ({
  LeagueFixturePanel: ({ node, onEditSchedule, onCancelFixture }: {
    node: { home: { label: string }; away: { label: string } };
    onEditSchedule: () => void;
    onCancelFixture: () => void;
  }) => (
    <div role="dialog" aria-label="경기 패널">
      {`${node.home.label} vs ${node.away.label}`}
      <button type="button" onClick={onEditSchedule}>일정 수정</button>
      <button type="button" onClick={onCancelFixture}>경기 취소</button>
    </div>
  ),
}));

// League period settings: undefined data by default (editor shows its loading state); tests set a value.
const { periodSettingsMock, updatePeriodsMutateMock } = vi.hoisted(() => ({
  periodSettingsMock: vi.fn(),
  updatePeriodsMutateMock: vi.fn(),
}));
vi.mock('@/hooks/use-tournament-period-settings', () => ({
  useTournamentPeriodSettings: periodSettingsMock,
  useUpdateTournamentPeriodSettings: () => ({ mutate: updatePeriodsMutateMock, isPending: false, error: null }),
}));

function periodSettingsOf(minutes: number[]) {
  return {
    data: {
      tournamentId: 'league-1',
      competitionConfigVersionId: 'cfg-1',
      expectedVersion: 'v-1',
      periods: minutes.map((durationMinutes, i) => ({ code: `P${i}`, label: `${i + 1}`, durationMinutes, extraTime: false })),
      legacyPeriodCount: null,
      requiresDurationInput: false,
    },
    isPending: false,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
  };
}

vi.mock('@/hooks/use-v1-api', () => ({
  useV1ActivePopup: vi.fn(),
  // 그룹 B 감사 결함 1: 참가팀 추가·제거. 대부분의 테스트는 로스터 조작을 다루지 않으므로
  // 무해한 기본값이면 충분하다.
  useV1AddLeagueTeam: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useV1AdminLeagueMatch: vi.fn(),
  // U1 확장: 득점자 선택 목록 — 기본은 빈 데이터(섹션 숨김). 필요한 테스트만 값을 채운다.
  useV1AdminLeagueTeams: vi.fn(),
  useV1AdminTournamentRegistrations: vi.fn(() => ({ data: { items: [], truncated: false }, isError: false, refetch: vi.fn() })),
  useV1CreateManualLeagueFixture: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
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
  useV1HoldLeague: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useV1ResumeLeague: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useV1CloseLeagueRegistration: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useV1UpdateLeagueCoverImage: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useV1UploadImages: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  // 팀 추가 EntityPicker의 검색 후보 — 빈 목록이면 아무것도 렌더하지 않아 무해하다.
  useV1Teams: vi.fn(() => ({ data: undefined, isFetching: false })),
  useV1UpdateLeagueFixture: vi.fn(),
  useV1UpdateLeagueVisibility: vi.fn(() => ({ mutate: vi.fn(), isError: false, isPending: false, isSuccess: false })),
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

/** 만든 대진은 지울 수 없어 생성은 확인 창을 거친다(F42) — 누르고 확인까지 한 번에. */
/** 표에서 그 제목(주차 라벨)의 행을 찾아 ⋯ 시트를 열고 dialog 를 돌려준다. ⋯ 의 이름은 매치업·일시다. */
function openRowMenu(fixtureTitle = '가을 풋살 리그 1주차') {
  const row = within(screen.getByRole('table')).getByText(`${fixtureTitle} · `, { exact: false }).closest('tr');
  fireEvent.click(within(row as HTMLElement).getByRole('button', { name: /더보기$/ }));
  return screen.getByRole('dialog');
}

async function generateAndConfirm() {
  fireEvent.click(screen.getByRole('button', { name: '라운드로빈 대진 생성' }));
  const dialog = await screen.findByRole('dialog', { name: '라운드로빈 대진을 만들까요?' });
  fireEvent.click(within(dialog).getByRole('button', { name: '대진 만들기' }));
}

/** 대진이 이미 있는 리그의 "참가 신청 · 참가팀 · 대진 관리" 접이식을 연다(F51) — 기본은 접혀 있다. */
function openFixtureManage() {
  const trigger = screen.getByRole('button', { name: /^참가 신청 · 참가팀 · 대진 관리/ });
  if (trigger.getAttribute('aria-expanded') !== 'true') fireEvent.click(trigger);
}

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
    periodSettingsMock.mockReturnValue({ data: undefined, isPending: true, isError: false, isFetching: false, refetch: vi.fn() });
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
        isPublic: true,
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
        <LeagueMatchFixturesClient leagueId="league-1" initialView="list" />
      </Providers>,
    );

    expect(screen.getByRole('link', { name: '후기 관리' })).toHaveAttribute('href', '/admin/league-matches/league-1/reviews');
    expect(screen.getByRole('columnheader', { name: '결과' })).toBeInTheDocument();
    // 표는 일정 위주로 줄었다 — 경기 · 결과 · 일시 · 운영. 구장·주소는 '경기' 열의 보조 줄로,
    // 수정은 행의 ⋯ 로 물러났다. 상태(취소)는 결과 열이 대신 그린다(아래 취소 대진 테스트).
    expect(screen.getAllByRole('columnheader').map((cell) => cell.textContent?.trim())).toEqual([
      '경기',
      '결과',
      '일시',
      '운영',
    ]);

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

  // alpha 1440 실측: AdminDataTable 의 기본 캡(max-w-[900px])이 카드를 898px 로 묶어 구장·주소·
  // 상태 열이 가로 스크롤 밖으로 밀렸다. 캡이 다시 살아나면 카드가 위 카드들보다 좁아진다.
  it('대진 표 카드는 기본 폭 캡에 묶이지 않고, 구장은 경기 열 보조 줄에 주소는 title 로 읽힌다', () => {
    useV1ActivePopupMock.mockReturnValue({ data: undefined, isPending: false } as never);
    useV1AdminLeagueMatchMock.mockReturnValue({
      data: {
        leagueId: 'league-1',
        isPublic: true,
        title: '가을 풋살 리그',
        state: 'active',
        teamIds: ['t1', 't2'],
        startsOn: '2026-09-01T00:00:00.000Z',
        recentVenues: [],
        fixtures: [
          {
            teamMatchId: 'tm-1', title: '가을 풋살 리그 1주차', homeTeamId: 't1', awayTeamId: 't2',
            startAt: '2026-09-01T20:00:00.000Z', placeName: '탄천종합운동장 보조구장',
            placeAddress: '경기 성남시 수정구 탄천로 215 보조구장 옆 주차장 입구', status: 'matched',
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
        <LeagueMatchFixturesClient leagueId="league-1" initialView="list" />
      </Providers>,
    );

    const table = screen.getByRole('table');
    // 표 → 스크롤 상자 → 카드. 카드가 캡을 갖지 않아야 메인 폭을 다 쓴다.
    const card = table.parentElement?.parentElement;
    expect(card).toHaveClass('max-w-none');
    expect(card).not.toHaveClass('max-w-[900px]');

    const venueLine = within(table).getByText(/탄천종합운동장 보조구장/);
    expect(venueLine).toHaveTextContent('가을 풋살 리그 1주차 · 탄천종합운동장 보조구장');
    expect(venueLine).toHaveAttribute('title', '경기 성남시 수정구 탄천로 215 보조구장 옆 주차장 입구');
  });

  // 취소된 대진은 결과를 기다리지 않는다 — '미입력'으로 그리면 영원히 처리해야 할 일처럼 보인다.
  it('취소된 대진에는 결과 단계를 그리지 않는다', () => {
    useV1ActivePopupMock.mockReturnValue({ data: undefined, isPending: false } as never);
    useV1AdminLeagueMatchMock.mockReturnValue({
      data: {
        leagueId: 'league-1',
        isPublic: true,
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
        <LeagueMatchFixturesClient leagueId="league-1" initialView="list" />
      </Providers>,
    );

    expect(screen.queryByText('결과 미입력')).not.toBeInTheDocument();
    // 결과 열은 결과 단계 대신 취소 상태를 그리고, 열 수 있는 콘솔도 ⋯ 도 없다.
    expect(within(screen.getByRole('table')).getAllByText('취소됨').length).toBeGreaterThan(0);
    expect(screen.queryByRole('link', { name: /콘솔 열기/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /더보기/ })).toBeNull();
    // 대회 상세의 "대회 목록으로"와 같은 복귀 링크.
    expect(screen.getByRole('link', { name: '리그 목록으로' })).toHaveAttribute('href', '/admin/league-matches');
  });

  // W6-V4: 결과가 아직 없는 대진은 경기 단계로 그린다. 진행 중 경기가 '결과 미입력'으로 읽히면 같은 화면의
  // "지금 할 일"("경기가 진행 중이에요")과 말이 엇갈린다. 끝났는데 결과가 없는 경기만 '결과 미입력'이다.
  it('결과 열은 진행 중·예정 경기에 경기 단계를, 끝났지만 결과가 없는 경기에만 결과 미입력을 그린다', () => {
    useV1ActivePopupMock.mockReturnValue({ data: undefined, isPending: false } as never);
    useV1AdminLeagueMatchMock.mockReturnValue({
      data: {
        leagueId: 'league-1',
        isPublic: true,
        title: '가을 풋살 리그',
        state: 'active',
        teamIds: ['t1', 't2'],
        startsOn: '2026-09-01T00:00:00.000Z',
        recentVenues: [],
        fixtures: [
          {
            teamMatchId: 'tm-ended', title: '가을 풋살 리그 1주차', homeTeamId: 't1', awayTeamId: 't2',
            startAt: '2026-09-01T20:00:00.000Z', placeName: '장소 미정', status: 'matched',
            resultStage: 'not_entered', gameState: 'ENDED', homeScore: null, awayScore: null,
          },
          {
            // 예정 시각보다 일찍 시작한 경기 — 킥오프 시각만 보면 아직 '예정'이다.
            teamMatchId: 'tm-live', title: '가을 풋살 리그 2주차', homeTeamId: 't2', awayTeamId: 't1',
            startAt: '2099-09-08T20:00:00.000Z', placeName: '장소 미정', status: 'matched',
            resultStage: 'not_entered', gameState: 'LIVE', homeScore: null, awayScore: null,
          },
          {
            teamMatchId: 'tm-scheduled', title: '가을 풋살 리그 3주차', homeTeamId: 't1', awayTeamId: 't2',
            startAt: '2099-09-15T20:00:00.000Z', placeName: '장소 미정', status: 'matched',
            resultStage: 'not_entered', gameState: 'SCHEDULED', homeScore: null, awayScore: null,
          },
        ],
      },
      isPending: false,
    } as never);
    useV1GenerateLeagueFixturesMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
    useV1UpdateLeagueFixtureMock.mockReturnValue({ mutate: vi.fn() } as never);

    render(
      <Providers>
        <LeagueMatchFixturesClient leagueId="league-1" initialView="list" />
      </Providers>,
    );

    const table = screen.getByRole('table');
    const resultCellOf = (fixtureTitle: string) => {
      const row = within(table).getByText(`${fixtureTitle} · `, { exact: false }).closest('tr') as HTMLElement;
      return within(row).getAllByRole('cell')[1];
    };
    expect(resultCellOf('가을 풋살 리그 1주차')).toHaveTextContent(/^결과 미입력$/);
    expect(resultCellOf('가을 풋살 리그 2주차')).toHaveTextContent(/^진행 중$/);
    expect(resultCellOf('가을 풋살 리그 3주차')).toHaveTextContent(/^예정$/);
  });

  it('일정 수정 모달의 일시 값이 서버가 내려준 UTC 시각과 동일한 순간(instant)을 나타낸다 (로컬시간 미변환 시 9시간 어긋남 회귀 방지)', () => {
    useV1ActivePopupMock.mockReturnValue({ data: undefined, isPending: false } as never);
    useV1AdminLeagueMatchMock.mockReturnValue({
      data: {
        leagueId: 'league-1',
        isPublic: true,
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
        <LeagueMatchFixturesClient leagueId="league-1" initialView="list" />
      </Providers>,
    );

    fireEvent.click(within(openRowMenu()).getByRole('button', { name: /^일정 수정/ }));
    const startInput = within(screen.getByRole('dialog', { name: '일정 수정' })).getByLabelText('일시') as HTMLInputElement;
    // 표시값을 다시 Date로 파싱했을 때(브라우저가 datetime-local을 해석하는 방식과 동일)
    // 원본 UTC instant와 정확히 같은 시각이어야 한다. slice(0,16)로 만든 값은
    // KST(+9)에서 이 값과 9시간 어긋난다.
    expect(new Date(startInput.value).getTime()).toBe(new Date('2026-09-01T20:00:00.000Z').getTime());
  });

  it('일정 수정 모달에서 일시를 바꿔 저장하면 시작 시각을 ISO로 변환해 바뀐 필드만 PATCH mutation으로 보낸다', async () => {
    useV1ActivePopupMock.mockReturnValue({ data: undefined, isPending: false } as never);
    useV1AdminLeagueMatchMock.mockReturnValue({
      data: {
        leagueId: 'league-1',
        isPublic: true,
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
        <LeagueMatchFixturesClient leagueId="league-1" initialView="list" />
      </Providers>,
    );

    // AdminDataTable renders both a desktop <table> and a stacked mobile <ul>
    // for the same rows (CSS-only breakpoint hiding — both exist in jsdom at
    // once), so the ⋯ button exists twice. They wrap the same fixture.
    fireEvent.click(within(openRowMenu()).getByRole('button', { name: /^일정 수정/ }));
    const modal = screen.getByRole('dialog', { name: '일정 수정' });
    fireEvent.change(within(modal).getByLabelText('일시'), { target: { value: '2026-09-01T21:00' } });
    fireEvent.click(within(modal).getByRole('button', { name: '저장' }));

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
        isPublic: true,
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
          { teamId: 't1', name: '독수리FC', status: 'active', memberCount: 5, logoUrl: null, registrationId: 'r-t1' },
          { teamId: 't2', name: '호랑이FC', status: 'active', memberCount: 5, logoUrl: null, registrationId: 'r-t2' },
          { teamId: 't3', name: '사자FC', status: 'active', memberCount: 5, logoUrl: null, registrationId: 'r-t3' },
        ],
      },
    } as never);
    useV1GenerateLeagueFixturesMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
    useV1UpdateLeagueFixtureMock.mockReturnValue({ mutate: vi.fn() } as never);

    render(
      <Providers>
        <LeagueMatchFixturesClient leagueId="league-1" initialView="list" />
      </Providers>,
    );

    expect(screen.getAllByText('독수리FC vs 호랑이FC').length).toBeGreaterThan(0);
    expect(screen.getAllByText('사자FC 부전승').length).toBeGreaterThan(0);
  });

  it('대진이 없으면 요일/시각/장소 없이 팀 수로 제안한 주차 수(2팀 → 단일 1주)만으로 생성할 수 있다', async () => {
    useV1ActivePopupMock.mockReturnValue({ data: undefined, isPending: false } as never);
    useV1AdminLeagueMatchMock.mockReturnValue({
      data: { leagueId: 'league-1', isPublic: true, title: '가을 풋살 리그', startsOn: '2026-09-01T00:00:00.000Z', state: 'draft', teamIds: ['t1', 't2'], fixtures: [] },
      isPending: false,
    } as never);
    const mutateAsync = vi.fn().mockResolvedValue({ leagueId: 'league-1', createdCount: 7, teamMatchIds: [] });
    useV1GenerateLeagueFixturesMock.mockReturnValue({ mutateAsync, isPending: false } as never);
    useV1UpdateLeagueFixtureMock.mockReturnValue({ mutate: vi.fn() } as never);

    render(
      <Providers>
        <LeagueMatchFixturesClient leagueId="league-1" initialView="list" />
      </Providers>,
    );

    await generateAndConfirm();

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith({ weeksCount: 1 }));
  });

  it('F40: 주차 수는 팀 수로 제안한다 — 2팀은 단일 1주(기본)·홈앤어웨이 2주 칩, 요약이 경기 수를 말한다', async () => {
    useV1ActivePopupMock.mockReturnValue({ data: undefined, isPending: false } as never);
    useV1AdminLeagueMatchMock.mockReturnValue({
      data: { leagueId: 'league-1', isPublic: true, title: '가을 풋살 리그', startsOn: '2026-09-01T00:00:00.000Z', state: 'draft', teamIds: ['t1', 't2'], fixtures: [] },
      isPending: false,
    } as never);
    const mutateAsync = vi.fn().mockResolvedValue({ leagueId: 'league-1', createdCount: 2, teamMatchIds: [] });
    useV1GenerateLeagueFixturesMock.mockReturnValue({ mutateAsync, isPending: false } as never);
    useV1UpdateLeagueFixtureMock.mockReturnValue({ mutate: vi.fn() } as never);

    render(
      <Providers>
        <LeagueMatchFixturesClient leagueId="league-1" initialView="list" />
      </Providers>,
    );

    expect(screen.getByText('2팀 · 단일 라운드로빈')).toBeInTheDocument();
    expect(screen.getByText(/1주차 · 1경기가 만들어져요/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '단일 1주' })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByRole('button', { name: '홈앤어웨이 2주' }));
    expect(screen.getByLabelText('주차 수')).toHaveValue(2);
    expect(screen.getByText(/2주차 · 2경기가 만들어져요/)).toBeInTheDocument();

    await generateAndConfirm();
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith({ weeksCount: 2 }));
  });

  it('F41: 시작 시각이 잠겨 있으면 여는 방법을 적고, 요일을 고르면 풀리며 안내가 사라진다', () => {
    useV1ActivePopupMock.mockReturnValue({ data: undefined, isPending: false } as never);
    useV1AdminLeagueMatchMock.mockReturnValue({
      data: { leagueId: 'league-1', isPublic: true, title: '가을 풋살 리그', startsOn: '2026-09-01T00:00:00.000Z', state: 'draft', teamIds: ['t1', 't2'], fixtures: [] },
      isPending: false,
    } as never);
    useV1GenerateLeagueFixturesMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
    useV1UpdateLeagueFixtureMock.mockReturnValue({ mutate: vi.fn() } as never);

    render(
      <Providers>
        <LeagueMatchFixturesClient leagueId="league-1" initialView="list" />
      </Providers>,
    );

    const time = screen.getByLabelText('시작 시각');
    expect(time).toBeDisabled();
    expect(time).toHaveAccessibleDescription('요일이나 경기 날짜를 먼저 고르면 바꿀 수 있어요.');

    fireEvent.change(screen.getByLabelText('요일'), { target: { value: '3' } });
    expect(screen.getByLabelText('시작 시각')).toBeEnabled();
    expect(screen.queryByText('요일이나 경기 날짜를 먼저 고르면 바꿀 수 있어요.')).toBeNull();
  });

  it('1434: 생성 폼 입력칸은 같은 grid 열 폭을 채우고, 장소는 한 행 전체를 쓰며, 미리보기·생성 버튼은 한 묶음이다', () => {
    useV1ActivePopupMock.mockReturnValue({ data: undefined, isPending: false } as never);
    useV1AdminLeagueMatchMock.mockReturnValue({
      data: { leagueId: 'league-1', isPublic: true, title: '가을 풋살 리그', startsOn: '2026-09-01T00:00:00.000Z', state: 'draft', teamIds: ['t1', 't2'], fixtures: [] },
      isPending: false,
    } as never);
    useV1GenerateLeagueFixturesMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
    useV1UpdateLeagueFixtureMock.mockReturnValue({ mutate: vi.fn() } as never);

    render(
      <Providers>
        <LeagueMatchFixturesClient leagueId="league-1" initialView="list" />
      </Providers>,
    );

    const grid = screen.getByLabelText('시작 시각').parentElement!.parentElement!;
    expect(grid.className).toContain('grid-cols-2');
    for (const label of ['주차 수', '요일', '시작 시각', '종료 시각', '경기 시간(분)', '휴식(분)', '팀당 하루 경기']) {
      const input = screen.getByLabelText(label);
      expect(input.className).toContain('w-full');
      expect(input.parentElement!.parentElement).toBe(grid);
    }
    const place = screen.getByLabelText('기본 장소');
    expect(place.className).toContain('w-full');
    expect(place.parentElement!.className).toContain('col-span-full');
    expect(screen.getByRole('button', { name: '미리보기' }).parentElement).toBe(
      screen.getByRole('button', { name: '라운드로빈 대진 생성' }).parentElement,
    );
  });

  it('리그 시작일이 응답에 없으면 대진 생성·미리보기를 잠그고 이유를 알린다 — 조용히 틀린 날짜로 만들지 않는다', async () => {
    // 화면은 요일을 **리그 시작일 기준**으로 날짜 목록으로 펼쳐 보낸다. 시작일이 없다고
    // 오늘 기준으로 떨어뜨리면 다음 달에 시작하는 리그가 이번 주부터 경기를 갖게 되고,
    // 서버는 그걸 막지 않는다(과거만 거부한다). 만들지 못하게 막는 쪽이 맞다.
    useV1ActivePopupMock.mockReturnValue({ data: undefined, isPending: false } as never);
    useV1AdminLeagueMatchMock.mockReturnValue({
      // startsOn 없음 — 구버전 API 를 보고 있는 상황.
      data: { leagueId: 'league-1', isPublic: true, title: '가을 풋살 리그', state: 'draft', teamIds: ['t1', 't2'], fixtures: [] },
      isPending: false,
    } as never);
    const mutateAsync = vi.fn();
    const previewMutateAsync = vi.fn();
    useV1GenerateLeagueFixturesMock.mockReturnValue({ mutateAsync, isPending: false } as never);
    useV1PreviewLeagueFixturesMock.mockReturnValue({ mutateAsync: previewMutateAsync, isPending: false } as never);
    useV1UpdateLeagueFixtureMock.mockReturnValue({ mutate: vi.fn() } as never);

    render(
      <Providers>
        <LeagueMatchFixturesClient leagueId="league-1" initialView="list" />
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
      data: { leagueId: 'league-1', isPublic: true, title: '가을 풋살 리그', startsOn: '2026-09-01T00:00:00.000Z', state: 'draft', teamIds: ['t1', 't2'], fixtures: [] },
      isPending: false,
    } as never);
    const mutateAsync = vi.fn().mockResolvedValue({ leagueId: 'league-1', createdCount: 7, teamMatchIds: [] });
    useV1GenerateLeagueFixturesMock.mockReturnValue({ mutateAsync, isPending: false } as never);
    useV1UpdateLeagueFixtureMock.mockReturnValue({ mutate: vi.fn() } as never);

    render(
      <Providers>
        <LeagueMatchFixturesClient leagueId="league-1" initialView="list" />
      </Providers>,
    );

    // 직접 입력한 주차 수(7)는 제안값을 덮는다 — 요일 전개가 그 수만큼 날짜를 만든다.
    fireEvent.change(screen.getByLabelText('주차 수'), { target: { value: '7' } });
    fireEvent.change(screen.getByLabelText('요일'), { target: { value: '6' } });
    fireEvent.change(screen.getByLabelText('시작 시각'), { target: { value: '19:30' } });
    fireEvent.change(screen.getByLabelText('기본 장소'), { target: { value: '상암 풋살파크' } });
    await generateAndConfirm();

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
          leagueId: 'league-1', isPublic: true, title: '가을 풋살 리그', startsOn: '2026-08-01T00:00:00.000Z',
          state: 'draft', teamIds: ['t1', 't2'], fixtures: [],
        },
        isPending: false,
      } as never);
      const mutateAsync = vi.fn().mockResolvedValue({ leagueId: 'league-1', createdCount: 1, teamMatchIds: [], warnings: [] });
      useV1GenerateLeagueFixturesMock.mockReturnValue({ mutateAsync, isPending: false } as never);
      useV1UpdateLeagueFixtureMock.mockReturnValue({ mutate: vi.fn() } as never);

      render(
        <Providers>
          <LeagueMatchFixturesClient leagueId="league-1" initialView="list" />
        </Providers>,
      );

      fireEvent.change(screen.getByLabelText('주차 수'), { target: { value: '1' } });
      fireEvent.change(screen.getByLabelText('요일'), { target: { value: '5' } });
      fireEvent.change(screen.getByLabelText('시작 시각'), { target: { value: '18:00' } });
      // 여기까지의 렌더 시점 계산이라면 첫 날은 2026-09-04 다.

      // 같은 날 20:00 KST — 18:00 이 지났다. 폼 값은 아무것도 바꾸지 않아 재렌더도 없다.
      vi.setSystemTime(new Date('2026-09-04T11:00:00.000Z'));
      await generateAndConfirm();

      await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
      const payload = mutateAsync.mock.calls[0][0] as { schedule: { dates: string[] } };
      expect(payload.schedule.dates).toEqual(['2026-09-11']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('요일을 고르고 시각을 비우면 서버 400 대신 안내 토스트를 보여주고 제출하지 않는다', async () => {
    useV1ActivePopupMock.mockReturnValue({ data: undefined, isPending: false } as never);
    useV1AdminLeagueMatchMock.mockReturnValue({
      data: { leagueId: 'league-1', isPublic: true, title: '가을 풋살 리그', startsOn: '2026-09-01T00:00:00.000Z', state: 'draft', teamIds: ['t1', 't2'], fixtures: [] },
      isPending: false,
    } as never);
    const mutateAsync = vi.fn().mockResolvedValue({ leagueId: 'league-1', createdCount: 7, teamMatchIds: [] });
    useV1GenerateLeagueFixturesMock.mockReturnValue({ mutateAsync, isPending: false } as never);
    useV1UpdateLeagueFixtureMock.mockReturnValue({ mutate: vi.fn() } as never);

    render(
      <Providers>
        <LeagueMatchFixturesClient leagueId="league-1" initialView="list" />
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
        isPublic: true,
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
        <LeagueMatchFixturesClient leagueId="league-1" initialView="list" />
      </Providers>,
    );

    fireEvent.click(screen.getByRole('button', { name: '잠실 종합운동장' }));
    await generateAndConfirm();

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith({
      weeksCount: 1,
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
        <LeagueMatchFixturesClient leagueId="league-1" initialView="list" />
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
        <LeagueMatchFixturesClient leagueId="league-1" initialView="list" />
      </Providers>,
    );

    // 로딩 중 완전 빈 화면(null 렌더) 회귀를 잡는다 — 스켈레톤이 시각적으로 존재해야 한다.
    expect(container.querySelector('.animate-pulse')).not.toBeNull();
  });

  it('일정 수정 모달은 값이 그대로면 저장을 막아 불필요한 PATCH를 보내지 않는다', () => {
    useV1ActivePopupMock.mockReturnValue({ data: undefined, isPending: false } as never);
    useV1AdminLeagueMatchMock.mockReturnValue({
      data: {
        leagueId: 'league-1',
        isPublic: true,
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
        <LeagueMatchFixturesClient leagueId="league-1" initialView="list" />
      </Providers>,
    );

    fireEvent.click(within(openRowMenu()).getByRole('button', { name: /^일정 수정/ }));
    const modal = screen.getByRole('dialog', { name: '일정 수정' });
    const save = within(modal).getByRole('button', { name: '저장' });
    expect(save).toBeDisabled();
    fireEvent.click(save);

    expect(mutate).not.toHaveBeenCalled();
  });

  describe('일정 수정 모달', () => {
    function renderOneFixture(mutate: ReturnType<typeof vi.fn>) {
      useV1ActivePopupMock.mockReturnValue({ data: undefined, isPending: false } as never);
      useV1AdminLeagueMatchMock.mockReturnValue({
        data: {
          leagueId: 'league-1', isPublic: true, title: '가을 풋살 리그', state: 'active', teamIds: ['t1', 't2'],
          startsOn: '2026-09-01T00:00:00.000Z',
          fixtures: [
            { teamMatchId: 'tm-1', title: '가을 풋살 리그 1주차', homeTeamId: 't1', awayTeamId: 't2', startAt: '2026-09-01T20:00:00.000Z', placeName: '탄천 보조구장', placeAddress: '성남시 탄천로 1', status: 'matched' },
          ],
        },
        isPending: false,
      } as never);
      useV1GenerateLeagueFixturesMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
      useV1UpdateLeagueFixtureMock.mockReturnValue({ mutate, isPending: false } as never);
      render(
        <Providers>
          <LeagueMatchFixturesClient leagueId="league-1" initialView="list" />
        </Providers>,
      );
      fireEvent.click(within(openRowMenu()).getByRole('button', { name: /^일정 수정/ }));
      return screen.getByRole('dialog', { name: '일정 수정' });
    }

    it('현재 구장·주소를 채워 열고, 구장만 바꾸면 그 필드만 보낸다', async () => {
      const mutate = vi.fn();
      const modal = renderOneFixture(mutate);

      expect(within(modal).getByLabelText('구장')).toHaveValue('탄천 보조구장');
      expect(within(modal).getByLabelText(/^주소/)).toHaveValue('성남시 탄천로 1');
      fireEvent.change(within(modal).getByLabelText('구장'), { target: { value: '잠실 보조구장' } });
      fireEvent.click(within(modal).getByRole('button', { name: '저장' }));

      await waitFor(() =>
        expect(mutate).toHaveBeenCalledWith({ teamMatchId: 'tm-1', body: { placeName: '잠실 보조구장' } }, expect.anything()),
      );
    });

    it('저장에 성공하면 닫히고 토스트로 알린다', async () => {
      const mutate = vi.fn((_vars, opts) => opts.onSuccess({}));
      const modal = renderOneFixture(mutate);

      fireEvent.change(within(modal).getByLabelText('구장'), { target: { value: '잠실 보조구장' } });
      fireEvent.click(within(modal).getByRole('button', { name: '저장' }));

      expect(await screen.findByText('일정을 저장했어요.')).toBeInTheDocument();
      await waitFor(() => expect(screen.queryByRole('dialog', { name: '일정 수정' })).toBeNull());
    });

    it('저장에 실패하면 모달이 열린 채 서버 메시지를 보여주고 입력을 잃지 않는다', async () => {
      const mutate = vi.fn((_vars, opts) => opts.onError(new Error('서버가 거부했어요')));
      const modal = renderOneFixture(mutate);

      fireEvent.change(within(modal).getByLabelText('구장'), { target: { value: '잠실 보조구장' } });
      fireEvent.click(within(modal).getByRole('button', { name: '저장' }));

      expect(await within(modal).findByRole('alert')).toBeInTheDocument();
      expect(screen.getByRole('dialog', { name: '일정 수정' })).toBeInTheDocument();
      expect(within(modal).getByLabelText('구장')).toHaveValue('잠실 보조구장');
    });
  });

  it('최근 사용한 장소가 없으면 칩 영역을 렌더링하지 않는다', () => {
    useV1ActivePopupMock.mockReturnValue({ data: undefined, isPending: false } as never);
    useV1AdminLeagueMatchMock.mockReturnValue({
      data: { leagueId: 'league-1', isPublic: true, title: '가을 풋살 리그', startsOn: '2026-09-01T00:00:00.000Z', state: 'draft', teamIds: ['t1', 't2'], fixtures: [], recentVenues: [] },
      isPending: false,
    } as never);
    useV1GenerateLeagueFixturesMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
    useV1UpdateLeagueFixtureMock.mockReturnValue({ mutate: vi.fn() } as never);

    render(
      <Providers>
        <LeagueMatchFixturesClient leagueId="league-1" initialView="list" />
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
        isPublic: true,
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
        <LeagueMatchFixturesClient leagueId="league-1" initialView="list" />
      </Providers>,
    );

    // AdminDataTable은 데스크톱 표 + 모바일 카드 리스트를 동시에 렌더한다(CSS로만 숨김) —
    // 같은 행이라 첫 번째 매치를 눌러도 대표성이 있다(기존 테스트 주석과 동일한 전제).
    fireEvent.click(within(openRowMenu()).getByRole('button', { name: /^대진 취소/ }));
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
        isPublic: true,
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
        <LeagueMatchFixturesClient leagueId="league-1" initialView="list" />
      </Providers>,
    );

    fireEvent.click(within(openRowMenu()).getByRole('button', { name: /^대진 취소/ }));
    fireEvent.click(screen.getByRole('button', { name: '대진 취소' }));

    expect(cancelMutate).not.toHaveBeenCalled();
  });

  // R13
  it('대진 재생성 버튼을 누르면 확인 모달이 뜨고, 재생성 문구를 정확히 입력해야 재생성 mutation을 호출한다', async () => {
    useV1ActivePopupMock.mockReturnValue({ data: undefined, isPending: false } as never);
    useV1AdminLeagueMatchMock.mockReturnValue({
      data: {
        leagueId: 'league-1',
        isPublic: true,
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
          { teamId: 't1', name: 'A팀', status: 'active', memberCount: 5, logoUrl: null, registrationId: 'r-t1' },
          { teamId: 't2', name: 'B팀', status: 'active', memberCount: 5, logoUrl: null, registrationId: 'r-t2' },
        ],
      },
    } as never);
    useV1GenerateLeagueFixturesMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
    useV1UpdateLeagueFixtureMock.mockReturnValue({ mutate: vi.fn() } as never);
    const regenMutate = vi.fn();
    useV1RegenerateLeagueFixturesMock.mockReturnValue({ mutate: regenMutate, isPending: false } as never);

    render(
      <Providers>
        <LeagueMatchFixturesClient leagueId="league-1" initialView="list" />
      </Providers>,
    );

    openFixtureManage();
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
      expect(regenMutate).toHaveBeenCalledWith({ weeksCount: 1, reason: '팀 로스터 변경으로 재생성' }, expect.anything()),
    );
  });

  // Task 180 G6(F42) — 만든 대진은 지울 수 없다(FIXTURE_NOT_DELETABLE). 확인 없이 만들지 않는다.
  describe('라운드로빈 대진 생성 확인', () => {
    function renderEmptyLeague() {
      useV1ActivePopupMock.mockReturnValue({ data: undefined, isPending: false } as never);
      useV1AdminLeagueMatchMock.mockReturnValue({
        data: { leagueId: 'league-1', isPublic: true, title: '가을 풋살 리그', startsOn: '2026-09-01T00:00:00.000Z', state: 'draft', teamIds: ['t1', 't2'], fixtures: [] },
        isPending: false,
      } as never);
      const mutateAsync = vi.fn().mockResolvedValue({ leagueId: 'league-1', createdCount: 7, teamMatchIds: [], warnings: [] });
      useV1GenerateLeagueFixturesMock.mockReturnValue({ mutateAsync, isPending: false } as never);
      useV1UpdateLeagueFixtureMock.mockReturnValue({ mutate: vi.fn() } as never);
      render(
        <Providers>
          <LeagueMatchFixturesClient leagueId="league-1" initialView="list" />
        </Providers>,
      );
      return mutateAsync;
    }

    it('누르면 확인 창이 먼저 뜨고, 지울 수 없다는 사실을 알리며, 확인 전에는 아무것도 만들지 않는다', async () => {
      const mutateAsync = renderEmptyLeague();

      fireEvent.click(screen.getByRole('button', { name: '라운드로빈 대진 생성' }));

      const dialog = await screen.findByRole('dialog', { name: '라운드로빈 대진을 만들까요?' });
      expect(dialog).toHaveTextContent('지울 수 없고 취소만 할 수 있어요');
      expect(mutateAsync).not.toHaveBeenCalled();
    });

    it('확인 창에서 취소하면 대진을 만들지 않는다', async () => {
      const mutateAsync = renderEmptyLeague();

      fireEvent.click(screen.getByRole('button', { name: '라운드로빈 대진 생성' }));
      const dialog = await screen.findByRole('dialog', { name: '라운드로빈 대진을 만들까요?' });
      fireEvent.click(within(dialog).getByRole('button', { name: '취소' }));

      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      expect(mutateAsync).not.toHaveBeenCalled();
    });

    it('입력이 잘못됐으면 확인 창을 띄우지 않고 검증 안내를 먼저 보인다', async () => {
      const mutateAsync = renderEmptyLeague();

      fireEvent.change(screen.getByLabelText('팀당 하루 경기'), { target: { value: '11' } });
      fireEvent.click(screen.getByRole('button', { name: '라운드로빈 대진 생성' }));

      expect(await screen.findByText(/팀당 하루 경기는 1~10 사이/)).toBeInTheDocument();
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(mutateAsync).not.toHaveBeenCalled();
    });
  });

  // Task 180 G6(F51) — 거의 안 쓰는 파괴적 조작(재생성)이 대진 목록 위에서 가장 눈에 띄던 것을
  // 표 아래 접이식으로 내렸다.
  describe('참가 신청 · 참가팀 · 대진 관리 접이식', () => {
    function renderWithFixtures() {
      useV1ActivePopupMock.mockReturnValue({ data: undefined, isPending: false } as never);
      useV1AdminLeagueMatchMock.mockReturnValue({
        data: {
          leagueId: 'league-1', isPublic: true, title: '가을 풋살 리그', state: 'active', teamIds: ['t1', 't2'],
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
          <LeagueMatchFixturesClient leagueId="league-1" initialView="list" />
        </Providers>,
      );
    }

    it('기본은 접혀 있어 재생성 버튼이 화면에 없고, 열면 나타난다', () => {
      renderWithFixtures();

      const trigger = screen.getByRole('button', { name: /^참가 신청 · 참가팀 · 대진 관리/ });
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
      // 접혀 있는 동안은 재생성뿐 아니라 참가팀 관리·경기 하나 추가도 화면에 없다.
      expect(screen.queryByRole('button', { name: '대진 재생성' })).toBeNull();
      expect(screen.queryByLabelText('주차 수')).toBeNull();
      expect(screen.queryByText('참가팀 관리')).toBeNull();
      expect(screen.queryByRole('button', { name: '경기 하나 추가' })).toBeNull();

      fireEvent.click(trigger);
      expect(trigger).toHaveAttribute('aria-expanded', 'true');
      expect(screen.getByRole('button', { name: '대진 재생성' })).toBeInTheDocument();
      expect(screen.getByText('참가팀 관리')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '경기 하나 추가' })).toBeInTheDocument();

      fireEvent.click(trigger);
      expect(screen.queryByRole('button', { name: '대진 재생성' })).toBeNull();
    });

    it('접이식은 대진 표 아래에 있다', () => {
      renderWithFixtures();

      const table = screen.getAllByRole('table')[0];
      const trigger = screen.getByRole('button', { name: /^참가 신청 · 참가팀 · 대진 관리/ });
      expect(table.compareDocumentPosition(trigger) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });
  });

  // R13
  it('취소된 대진은 상태 배지가 빨간 톤이고 취소 버튼 대신 "취소됨" 텍스트를 보여준다', () => {
    useV1ActivePopupMock.mockReturnValue({ data: undefined, isPending: false } as never);
    useV1AdminLeagueMatchMock.mockReturnValue({
      data: {
        leagueId: 'league-1',
        isPublic: true,
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
        <LeagueMatchFixturesClient leagueId="league-1" initialView="list" />
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
        isPublic: true,
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
        <LeagueMatchFixturesClient leagueId="league-1" initialView="list" />
      </Providers>,
    );

    fireEvent.click(within(openRowMenu()).getByRole('button', { name: /^몰수패 처리/ }));

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
        isPublic: true,
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
        <LeagueMatchFixturesClient leagueId="league-1" initialView="list" />
      </Providers>,
    );

    fireEvent.click(within(openRowMenu()).getByRole('button', { name: /^몰수패 처리/ }));
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
        isPublic: true,
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
        <LeagueMatchFixturesClient leagueId="league-1" initialView="list" />
      </Providers>,
    );
    expect(screen.queryByRole('button', { name: '진행 중으로 되돌리기' })).not.toBeInTheDocument();
    active.unmount();

    const revertMutate = vi.fn();
    useV1RevertLeagueCompletionMock.mockReturnValue({ mutate: revertMutate, isPending: false } as never);
    useV1AdminLeagueMatchMock.mockReturnValue(detail('completed') as never);
    render(
      <Providers>
        <LeagueMatchFixturesClient leagueId="league-1" initialView="list" />
      </Providers>,
    );

    fireEvent.click(screen.getByRole('button', { name: '진행 중으로 되돌리기' }));

    // GateConfirmModal 은 사유 입력 후 확인을 눌러야 onConfirm 이 돈다(취소·재생성과 동일).
    const reasonBox = await screen.findByLabelText(/^사유/);
    fireEvent.change(reasonBox, { target: { value: '오심 정정' } });
    fireEvent.click(screen.getByRole('button', { name: '되돌리기' }));

    await waitFor(() => expect(revertMutate).toHaveBeenCalledWith({ reason: '오심 정정' }, expect.anything()));
  });

  // U1(A안 "확정 다이얼로그") — 행 ⋯ 시트의 결과 항목은 결과 진행 단계에 따라 갈린다.
  // 감사 확인(A-league-void-stage): voided(무효화된 결과)도 백엔드가 신규 입력을 이미
  // 허용하므로 '결과 입력' 버튼이 떠야 한다 — 여기서 빠지면 무효 대진은 재입력 버튼
  // 자체가 사라져 그 시즌 승강 확정이 영구히 막힌다.
  it('결과 진행 단계에 따라 ⋯ 시트의 결과 항목이 갈린다 — 결과 없음은 항목 없음, 확정은 결과 정정, 그 밖에는 결과 검토', () => {
    useV1ActivePopupMock.mockReturnValue({ data: undefined, isPending: false } as never);
    useV1AdminLeagueMatchMock.mockReturnValue({
      data: {
        leagueId: 'league-1',
        isPublic: true,
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
        <LeagueMatchFixturesClient leagueId="league-1" initialView="list" />
      </Providers>,
    );

    // 결과 항목은 ⋯ 시트 안에 있고, **결과가 있는 경기에만** 둔다(F55). 링크가 어디로 가는지까지 본다 —
    // 레이블만 보면 href 가 깨져도 통과한다.
    const sheetFor = (title: string) => {
      const sheet = openRowMenu(title);
      const close = () => fireEvent.click(within(sheet).getByRole('button', { name: '닫기' }));
      return { sheet, close };
    };
    const results = new Map<string, { label: string; href: string } | null>();
    for (const title of ['1주차', '2주차', '3주차', '4주차', '5주차', '6주차']) {
      const { sheet, close } = sheetFor(title);
      const link = within(sheet).queryByRole('link', { name: /^결과 (정정|검토)/ });
      results.set(title, link === null ? null : { label: link.textContent ?? '', href: link.getAttribute('href') ?? '' });
      close();
    }
    // 아직 결과가 없는 경기에는 항목이 없다 — 눌러도 빈 화면인 "결과 정정"을 두지 않는다.
    expect(results.get('1주차')).toBeNull();
    // 제출·초안·정정 요청·무효는 결과 검토 화면으로 간다.
    for (const title of ['2주차', '3주차', '5주차', '6주차']) {
      expect(results.get(title)?.label).toMatch(/^결과 검토/);
      expect(results.get(title)?.href).toMatch(/^\/admin\/live\/league-1\/result-review\?fixtureId=tm-/);
    }
    // 확정된 경기는 **정정 화면**으로 간다. `result-review` 는 *검토 대기* 목록이라 확정된 경기가 거기
    // 없어, 라벨은 "결과 정정" 인데 "검토할 결과가 없어요" 가 열리는 데드엔드였다(alpha 실측).
    // 라벨이 아니라 **href** 로 잰다.
    expect(results.get('4주차')?.label).toMatch(/^결과 정정/);
    expect(results.get('4주차')?.href).toBe('/admin/live/league-1/records/corrections?fixtureId=tm-official');
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
    periodSettingsMock.mockReturnValue({ data: undefined, isPending: true, isError: false, isFetching: false, refetch: vi.fn() });
    useV1ActivePopupMock.mockReturnValue({ data: undefined, isPending: false } as never);
    useV1CancelLeagueFixtureMock.mockReturnValue({ mutate: vi.fn(), isPending: false } as never);
    useV1RegenerateLeagueFixturesMock.mockReturnValue({ mutate: vi.fn(), isPending: false } as never);
    useV1RevertLeagueCompletionMock.mockReturnValue({ mutate: vi.fn(), isPending: false } as never);
    useV1UpdateLeagueFixtureMock.mockReturnValue({ mutate: vi.fn() } as never);
    useV1AdminLeagueMatchMock.mockReturnValue({
      data: {
        leagueId: 'league-1',
        isPublic: true,
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
          { teamId: 't1', name: '독수리FC', status: 'active', memberCount: 5, logoUrl: null, registrationId: 'r-t1' },
          { teamId: 't2', name: '호랑이FC', status: 'active', memberCount: 5, logoUrl: null, registrationId: 'r-t2' },
          { teamId: 't3', name: '사자FC', status: 'active', memberCount: 5, logoUrl: null, registrationId: 'r-t3' },
          { teamId: 't4', name: '표범FC', status: 'active', memberCount: 5, logoUrl: null, registrationId: 'r-t4' },
        ],
      },
    } as never);
  });

  it('경기 시간·휴식·팀당 하루 경기를 채우고 생성하면 timing을 함께 전달한다', async () => {
    const mutateAsync = vi.fn().mockResolvedValue({ leagueId: 'league-1', createdCount: 6, teamMatchIds: [], warnings: [] });
    useV1GenerateLeagueFixturesMock.mockReturnValue({ mutateAsync, isPending: false } as never);

    render(
      <Providers>
        <LeagueMatchFixturesClient leagueId="league-1" initialView="list" />
      </Providers>,
    );

    fireEvent.change(screen.getByLabelText('요일'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('시작 시각'), { target: { value: '22:00' } });
    fireEvent.change(screen.getByLabelText('경기 시간(분)'), { target: { value: '15' } });
    fireEvent.change(screen.getByLabelText('휴식(분)'), { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText('팀당 하루 경기'), { target: { value: '3' } });
    await generateAndConfirm();

    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({
        // 4팀 단일 3라운드 ÷ 팀당 하루 3경기 = 1주 — 수요일 1개가 전개돼 온다(날짜는 lib/league-fixture-dates.test.ts 가 고정).
        weeksCount: 1,
        schedule: { dates: expect.any(Array), time: '22:00' },
        timing: { gameDurationMinutes: 15, breakMinutes: 5, gamesPerTeamPerDay: 3 },
      }),
    );
  });

  it('F40: 라운드가 주차에 안 나눠지면 요약이 마지막 주에 다시 열리는 라운드를 알린다', () => {
    useV1GenerateLeagueFixturesMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
    const REPEAT = /첫 라운드 대진이 한 번 더 열려요/;

    render(
      <Providers>
        <LeagueMatchFixturesClient leagueId="league-1" initialView="list" />
      </Providers>,
    );

    // 4팀 단일 3라운드 · 하루 2경기 → 2주 4라운드: 서버는 1라운드 대진을 한 번 더 만든다.
    fireEvent.change(screen.getByLabelText('팀당 하루 경기'), { target: { value: '2' } });
    expect(screen.getByText(/2주차 · 8경기가 만들어져요/)).toBeInTheDocument();
    expect(screen.getByText(REPEAT)).toBeInTheDocument();

    // 대조군: 하루 3경기면 1주에 3라운드가 딱 들어가 다시 여는 라운드가 없다.
    fireEvent.change(screen.getByLabelText('팀당 하루 경기'), { target: { value: '3' } });
    expect(screen.getByText(/1주차 · 6경기가 만들어져요/)).toBeInTheDocument();
    expect(screen.queryByText(/한 번 더 열려요/)).not.toBeInTheDocument();
  });

  it('이용 종료 시각까지 넣으면 팀당 경기 수를 역산 제안하고 "이대로 적용"이 값을 채운다', () => {
    useV1GenerateLeagueFixturesMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);

    render(
      <Providers>
        <LeagueMatchFixturesClient leagueId="league-1" initialView="list" />
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

  it('경기 시간을 비우고 팀당 하루 경기만 넣으면 경기 시간 없이 timing을 보내 서버 기본값(경기 설정 시간)을 쓴다', async () => {
    const mutateAsync = vi.fn().mockResolvedValue({ leagueId: 'league-1', createdCount: 6, teamMatchIds: [], warnings: [] });
    useV1GenerateLeagueFixturesMock.mockReturnValue({ mutateAsync, isPending: false } as never);

    render(
      <Providers>
        <LeagueMatchFixturesClient leagueId="league-1" initialView="list" />
      </Providers>,
    );

    expect(screen.getByLabelText('경기 시간(분)')).toHaveAccessibleDescription(/비우면 경기 설정 시간/);
    fireEvent.change(screen.getByLabelText('팀당 하루 경기'), { target: { value: '3' } });
    await generateAndConfirm();

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ timing: { gamesPerTeamPerDay: 3 } })));
    expect(screen.queryByText(/경기 시간\(분\)을 입력/)).not.toBeInTheDocument();
  });

  it('경기 시간이 서버 허용 범위(5~240분)를 벗어나면 범위 안내 토스트를 띄우고 제출하지 않는다', async () => {
    const mutateAsync = vi.fn();
    useV1GenerateLeagueFixturesMock.mockReturnValue({ mutateAsync, isPending: false } as never);

    render(
      <Providers>
        <LeagueMatchFixturesClient leagueId="league-1" initialView="list" />
      </Providers>,
    );

    fireEvent.change(screen.getByLabelText('경기 시간(분)'), { target: { value: '300' } });
    fireEvent.click(screen.getByRole('button', { name: '라운드로빈 대진 생성' }));

    expect(await screen.findByText(/5~240분/)).toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it('참가팀이 2개 미만이면 "시간창" 경고를 띄우지 않는다(원인은 팀 부족이지 시간창이 아님)', () => {
    useV1AdminLeagueMatchMock.mockReturnValue({
      data: { leagueId: 'league-1', isPublic: true, title: '외로운 리그', startsOn: '2026-09-01T00:00:00.000Z', state: 'draft', teamIds: ['t1'], fixtures: [] },
      isPending: false,
    } as never);
    useV1GenerateLeagueFixturesMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);

    render(
      <Providers>
        <LeagueMatchFixturesClient leagueId="league-1" initialView="list" />
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
        <LeagueMatchFixturesClient leagueId="league-1" initialView="list" />
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
        <LeagueMatchFixturesClient leagueId="league-1" initialView="list" />
      </Providers>,
    );

    fireEvent.change(screen.getByLabelText('경기 시간(분)'), { target: { value: '15.5' } });
    fireEvent.click(screen.getByRole('button', { name: '라운드로빈 대진 생성' }));

    expect(await screen.findByText(/정수로만 입력/)).toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it('재생성 확인 모달에서도 timing 선제 검증이 동작한다(범위를 벗어난 팀당 경기 수면 미호출)', async () => {
    useV1AdminLeagueMatchMock.mockReturnValue({
      data: {
        leagueId: 'league-1',
        isPublic: true,
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
        <LeagueMatchFixturesClient leagueId="league-1" initialView="list" />
      </Providers>,
    );

    openFixtureManage();
    fireEvent.change(screen.getByLabelText('팀당 하루 경기'), { target: { value: '11' } });
    fireEvent.click(screen.getAllByRole('button', { name: '대진 재생성' })[0]);
    fireEvent.change(
      screen.getByPlaceholderText('이 작업이 왜 필요한지 남겨 주세요. 감사 로그에 그대로 기록돼요.'),
      { target: { value: '테스트 재생성' } },
    );
    fireEvent.change(screen.getByPlaceholderText('재생성'), { target: { value: '재생성' } });
    fireEvent.click(screen.getAllByRole('button', { name: '대진 재생성' })[screen.getAllByRole('button', { name: '대진 재생성' }).length - 1]);

    expect(await screen.findByText(/팀당 하루 경기는 1~10 사이/)).toBeInTheDocument();
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
        <LeagueMatchFixturesClient leagueId="league-1" initialView="list" />
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
  it('리그의 피리어드 설정(25·25)으로 경기 시간을 미리 채우고 출처를 알린다 — 종목 기본 20과 다른 값', () => {
    periodSettingsMock.mockReturnValue(periodSettingsOf([25, 25]));
    useV1GenerateLeagueFixturesMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
    render(<Providers><LeagueMatchFixturesClient leagueId="league-1" /></Providers>);

    expect(screen.getByLabelText('경기 시간(분)')).toHaveValue(50);
    expect(screen.getByLabelText('경기 시간(분)')).toHaveAccessibleDescription(
      '이 리그의 피리어드 설정(전·후반 25분)에서 가져왔어요. 바꾸면 이번 대진에만 적용돼요.',
    );
  });

  it('대조군: 20·20 리그는 40분으로 채운다', () => {
    periodSettingsMock.mockReturnValue(periodSettingsOf([20, 20]));
    useV1GenerateLeagueFixturesMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
    render(<Providers><LeagueMatchFixturesClient leagueId="league-1" /></Providers>);

    expect(screen.getByLabelText('경기 시간(분)')).toHaveValue(40);
  });

  it('미리 채운 경기 시간을 건드리지 않으면 timing으로 보내지 않고, 고치면 그 값을 보낸다', async () => {
    periodSettingsMock.mockReturnValue(periodSettingsOf([25, 25]));
    const mutateAsync = vi.fn().mockResolvedValue({ leagueId: 'league-1', createdCount: 6, teamMatchIds: [], warnings: [] });
    useV1GenerateLeagueFixturesMock.mockReturnValue({ mutateAsync, isPending: false } as never);
    render(<Providers><LeagueMatchFixturesClient leagueId="league-1" /></Providers>);

    fireEvent.change(screen.getByLabelText('요일'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('시작 시각'), { target: { value: '22:00' } });
    await generateAndConfirm();
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(mutateAsync.mock.calls[0][0]).not.toHaveProperty('timing');

    fireEvent.change(screen.getByLabelText('경기 시간(분)'), { target: { value: '30' } });
    await generateAndConfirm();
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(2));
    expect(mutateAsync.mock.calls[1][0]).toMatchObject({ timing: { gameDurationMinutes: 30 } });
  });

  it('리그 상세의 피리어드 설정에서 수정하면 저장 API(expectedVersion 포함)를 호출한다', () => {
    periodSettingsMock.mockReturnValue(periodSettingsOf([25, 25]));
    useV1GenerateLeagueFixturesMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
    render(<Providers><LeagueMatchFixturesClient leagueId="league-1" /></Providers>);

    const section = screen.getByRole('region', { name: '피리어드 설정' });
    fireEvent.click(within(section).getByRole('button', { name: '수정' }));
    fireEvent.change(within(section).getByLabelText('피리어드 1'), { target: { value: '30' } });
    fireEvent.click(within(section).getByRole('button', { name: '저장' }));

    expect(updatePeriodsMutateMock).toHaveBeenCalledWith(
      { expectedVersion: 'v-1', periods: [{ durationMinutes: 30 }, { durationMinutes: 25 }] },
      expect.any(Object),
    );
  });

});

/**
 * 달력이 **정본**이다. 요일 전개는 그 목록을 채우는 편의일 뿐이라, 달력에서 고른 날짜가
 * 그대로 나가지 않으면 운영자가 지운 주가 되살아난다(사용자 A안의 요지).
 */
describe('대진 날짜 — 달력에서 고른 값이 그대로 나간다', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-04T01:00:00.000Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });
  it('날짜만 고르고 시각이 비면 요청을 보내지 않는다 — 빈 time 은 서버가 형식으로 거부한다', async () => {
    // 요일 경로는 `time` 이 비면 `dates` 가 빈 배열이 돼 자연히 빠졌는데, 달력 경로는
    // `dates` 가 채워져 있어 **빈 `time` 이 그대로 나갔다.**
    useV1ActivePopupMock.mockReturnValue({ data: undefined, isPending: false } as never);
    useV1AdminLeagueMatchMock.mockReturnValue({
      data: {
        leagueId: 'league-1',
        isPublic: true, title: '가을 풋살 리그', startsOn: '2026-09-01T00:00:00.000Z',
        state: 'draft', teamIds: ['t1', 't2'], fixtures: [],
      },
      isPending: false,
    } as never);
    const mutateAsync = vi.fn();
    useV1GenerateLeagueFixturesMock.mockReturnValue({ mutateAsync, isPending: false } as never);
    useV1UpdateLeagueFixtureMock.mockReturnValue({ mutate: vi.fn() } as never);

    render(
      <Providers>
        <LeagueMatchFixturesClient leagueId="league-1" initialView="list" />
      </Providers>,
    );

    // **시각 기본값은 `'18:00'` 이라 그냥 두면 재현되지 않는다** — 운영자가 시각을 지운
    // 상태를 만들어야 한다(요일을 "시작일 그대로" 로 되돌린 뒤 시각을 비우는 흐름).
    fireEvent.click(await screen.findByLabelText('2026-09-12'));
    fireEvent.change(screen.getByLabelText('시작 시각'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: '라운드로빈 대진 생성' }));

    // 요청이 안 나가는 것이 이 테스트의 계약이다. 토스트 문구는 그 다음이다.
    await waitFor(() => expect(mutateAsync).not.toHaveBeenCalled());
    expect(await screen.findByText('날짜를 골랐으면 시각도 입력해 주세요.')).toBeInTheDocument();
  });

  it('달력으로 날짜를 골랐으면 요일이 없어도 시각을 넣을 수 있다', async () => {
    // 시각 입력이 요일에만 묶여 있으면, 달력만 쓴 운영자는 날짜는 있는데 시각을 넣을
    // 방법이 없어 **영영 제출할 수 없다.**
    useV1ActivePopupMock.mockReturnValue({ data: undefined, isPending: false } as never);
    useV1AdminLeagueMatchMock.mockReturnValue({
      data: {
        leagueId: 'league-1',
        isPublic: true, title: '가을 풋살 리그', startsOn: '2026-09-01T00:00:00.000Z',
        state: 'draft', teamIds: ['t1', 't2'], fixtures: [],
      },
      isPending: false,
    } as never);
    useV1GenerateLeagueFixturesMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
    useV1UpdateLeagueFixtureMock.mockReturnValue({ mutate: vi.fn() } as never);

    render(
      <Providers>
        <LeagueMatchFixturesClient leagueId="league-1" initialView="list" />
      </Providers>,
    );

    expect(screen.getByLabelText('시작 시각')).toBeDisabled();
    fireEvent.click(await screen.findByLabelText('2026-09-12'));
    expect(screen.getByLabelText('시작 시각')).not.toBeDisabled();
  });

  it('요일을 골랐다 지운 뒤 "시작일 그대로" 로 되돌려도 빈 시각은 안 나간다', async () => {
    // 리뷰가 지목한 **정확한 경로**다: 요일을 골라 시각을 지운 다음 요일을 되돌리면
    // `dayOfWeek === ''` 가 되므로 **요일 기준 가드는 안 탄다.** 날짜는 달력에 남아 있어
    // `schedule` 이 실릴 조건은 갖춰진다 — 가드가 `selectedDates` 기준이어야 하는 이유다.
    useV1ActivePopupMock.mockReturnValue({ data: undefined, isPending: false } as never);
    useV1AdminLeagueMatchMock.mockReturnValue({
      data: {
        leagueId: 'league-1',
        isPublic: true, title: '가을 풋살 리그', startsOn: '2026-09-01T00:00:00.000Z',
        state: 'draft', teamIds: ['t1', 't2'], fixtures: [],
      },
      isPending: false,
    } as never);
    const mutateAsync = vi.fn();
    useV1GenerateLeagueFixturesMock.mockReturnValue({ mutateAsync, isPending: false } as never);
    useV1UpdateLeagueFixtureMock.mockReturnValue({ mutate: vi.fn() } as never);

    render(
      <Providers>
        <LeagueMatchFixturesClient leagueId="league-1" initialView="list" />
      </Providers>,
    );

    // ① 요일을 고른다 → ② 시각을 지운다 → ③ 요일을 "시작일 그대로" 로 되돌린다
    fireEvent.change(screen.getByLabelText('요일'), { target: { value: '6' } });
    fireEvent.change(screen.getByLabelText('시작 시각'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('요일'), { target: { value: '' } });
    // ④ 달력에서 날짜를 고른다 → ⑤ 제출
    fireEvent.click(await screen.findByLabelText('2026-09-12'));
    fireEvent.click(screen.getByRole('button', { name: '라운드로빈 대진 생성' }));

    await waitFor(() => expect(mutateAsync).not.toHaveBeenCalled());
  });

  it('달력에서 고른 날짜를 schedule.dates 로 보낸다', async () => {
    useV1ActivePopupMock.mockReturnValue({ data: undefined, isPending: false } as never);
    useV1AdminLeagueMatchMock.mockReturnValue({
      data: {
        leagueId: 'league-1',
        isPublic: true, title: '가을 풋살 리그', startsOn: '2026-09-01T00:00:00.000Z',
        state: 'draft', teamIds: ['t1', 't2'], fixtures: [],
      },
      isPending: false,
    } as never);
    const mutateAsync = vi.fn().mockResolvedValue({ leagueId: 'league-1', createdCount: 2, teamMatchIds: [] });
    useV1GenerateLeagueFixturesMock.mockReturnValue({ mutateAsync, isPending: false } as never);
    useV1UpdateLeagueFixtureMock.mockReturnValue({ mutate: vi.fn() } as never);

    render(
      <Providers>
        <LeagueMatchFixturesClient leagueId="league-1" initialView="list" />
      </Providers>,
    );

    // 시각은 서버 계약상 날짜와 함께 가야 한다.
    fireEvent.change(screen.getByLabelText('시작 시각'), { target: { value: '18:00' } });
    fireEvent.click(await screen.findByLabelText('2026-09-12'));
    fireEvent.click(screen.getByLabelText('2026-09-19'));
    await generateAndConfirm();

    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          schedule: { dates: ['2026-09-12', '2026-09-19'], time: '18:00' },
        }),
      ),
    );
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
        isPublic: true,
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
        <LeagueMatchFixturesClient leagueId="league-1" initialView="list" />
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

/**
 * **대진이 이미 있는 리그에서 "경기 하나 추가" 가 보이는가.**
 *
 * 이 버튼은 처음엔 `series.fixtures.length === 0` 분기 안에 있었다 — 대진이 하나도 없는
 * 리그에서만 보였다는 뜻이다. 그런데 이 기능의 존재 이유가 **우천 순연 재편성·대체 경기**라
 * 대진이 이미 있는 리그가 정확히 대상이고, 정작 거기서 도달할 수 없었다.
 *
 * 유닛 6건이 못 잡은 이유가 여기 그대로 있다: 모달 테스트는 컴포넌트를 직접 렌더했고,
 * 화면 테스트의 리그 mock 은 전부 `fixtures: []` 였다. 배선은 검증됐지만 **그 배선이 어느
 * 분기에 있는지**는 아무도 안 봤다. alpha 실화면에서 발견됐다(2026-09-04).
 */
describe('수동 대진 추가 입구 — 대진 유무와 무관하게 보인다', () => {
  function renderWithFixtures(fixtures: unknown[]) {
    useV1ActivePopupMock.mockReturnValue({ data: undefined, isPending: false } as never);
    useV1AdminLeagueMatchMock.mockReturnValue({
      data: {
        leagueId: 'league-1',
        isPublic: true, title: '가을 풋살 리그', startsOn: '2026-09-01T00:00:00.000Z',
        state: 'active', teamIds: ['t1', 't2'], recentVenues: [], fixtures,
      },
      isPending: false,
    } as never);
    useV1GenerateLeagueFixturesMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
    useV1UpdateLeagueFixtureMock.mockReturnValue({ mutate: vi.fn() } as never);
    render(
      <Providers>
        <LeagueMatchFixturesClient leagueId="league-1" initialView="list" />
      </Providers>,
    );
  }

  it('대진이 이미 있어도 접이식을 열면 보인다 — 우천 순연·대체 경기가 바로 이 경우다', async () => {
    renderWithFixtures([
      {
        teamMatchId: 'tm-1', title: '1주차', homeTeamId: 't1', awayTeamId: 't2',
        startAt: '2026-09-01T20:00:00.000Z', placeName: '장소 미정', status: 'matched',
        resultStage: 'official', homeScore: 3, awayScore: 1,
      },
    ]);
    // 대진이 있는 리그에서는 "참가 신청 · 참가팀 · 대진 관리" 접이식 안에 있다(F51).
    openFixtureManage();
    expect(await screen.findByRole('button', { name: '경기 하나 추가' })).toBeInTheDocument();
  });

  it('대진이 하나도 없어도 보인다 (회귀 방지 — 분기를 반대로 옮기면 안 된다)', async () => {
    renderWithFixtures([]);
    expect(await screen.findByRole('button', { name: '경기 하나 추가' })).toBeInTheDocument();
  });

  it('참가팀이 2팀 미만이면 누를 수 없고, 왜인지 말해 준다', async () => {
    // 홈·어웨이를 **둘 다** 골라야 만들 수 있다. 1팀뿐인데 열면 피커 두 개가 같은 팀만
    // 보여 주고 저장은 항상 막힌다 — 빈 약속이다.
    useV1AdminLeagueTeamsMock.mockReturnValue({
      data: { teams: [{ teamId: 't1', name: 'A팀' }] },
    } as never);
    renderWithFixtures([]);
    expect(await screen.findByRole('button', { name: '경기 하나 추가' })).toBeDisabled();
    expect(screen.getByText('참가팀이 2팀 이상이어야 경기를 추가할 수 있어요.')).toBeInTheDocument();
  });

  it('참가팀이 2팀이면 누를 수 있다 (회귀 방지 — 항상 비활성이면 아무것도 못 만든다)', async () => {
    useV1AdminLeagueTeamsMock.mockReturnValue({
      data: { teams: [{ teamId: 't1', name: 'A팀' }, { teamId: 't2', name: 'B팀' }] },
    } as never);
    renderWithFixtures([]);
    expect(await screen.findByRole('button', { name: '경기 하나 추가' })).not.toBeDisabled();
  });

  it('참가팀이 아직 안 왔으면(로딩) 누를 수 없다 — 빈 피커를 "팀 없음" 으로 오해한다', async () => {
    useV1AdminLeagueTeamsMock.mockReturnValue({ data: undefined } as never);
    renderWithFixtures([]);
    expect(await screen.findByRole('button', { name: '경기 하나 추가' })).toBeDisabled();
  });
});

// Task 180 G6(C안) — 리그 상세 맨 위 "지금 할 일" 한 장과 콘솔 열기 + ⋯ 로 줄인 대진 표.
describe('LeagueMatchFixturesClient — 지금 할 일 카드와 콘솔 열기', () => {
  type Fixture = Record<string, unknown>;
  const base = {
    homeTeamId: 't1', awayTeamId: 't2', placeName: '망원 유수지', status: 'matched',
    resultStage: 'not_entered', gameState: 'SCHEDULED', homeScore: null, awayScore: null,
  };
  const W1 = '2026-09-30T01:10:00.000Z';
  const W2 = '2026-10-07T01:10:00.000Z';

  const TEAMS = [
    { teamId: 't1', name: '마포 FC', status: 'active', memberCount: 5, logoUrl: null, registrationId: 'r-t1' },
    { teamId: 't2', name: '합정 유나이티드', status: 'active', memberCount: 5, logoUrl: null, registrationId: 'r-t2' },
  ];

  function renderLeague(fixtures: Fixture[], teams = TEAMS) {
    useV1ActivePopupMock.mockReturnValue({ data: undefined, isPending: false } as never);
    useV1AdminLeagueMatchMock.mockReturnValue({
      data: {
        leagueId: 'league-1',
        isPublic: true, title: '마포 주말 리그', state: 'active', teamIds: teams.map((team) => team.teamId),
        startsOn: '2026-09-01T00:00:00.000Z', recentVenues: [], fixtures,
      },
      isPending: false,
    } as never);
    useV1AdminLeagueTeamsMock.mockReturnValue({ data: { leagueId: 'league-1', teams } } as never);
    useV1GenerateLeagueFixturesMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
    useV1UpdateLeagueFixtureMock.mockReturnValue({ mutate: vi.fn() } as never);
    render(
      <Providers>
        <LeagueMatchFixturesClient leagueId="league-1" initialView="list" />
      </Providers>,
    );
    return screen.queryByRole('region', { name: '지금 할 일' });
  }

  it('결과 확정을 기다리는 경기가 있으면 그 경기의 콘솔로 보내는 확정 카드가 뜬다', () => {
    const card = renderLeague([
      { ...base, teamMatchId: 'tm-1', title: '1주차', startAt: W1, resultStage: 'awaiting_approval', gameState: 'ENDED' },
      { ...base, teamMatchId: 'tm-2', title: '2주차', startAt: W2 },
    ]);

    expect(card).not.toBeNull();
    expect(within(card as HTMLElement).getByText(/마포 FC vs 합정 유나이티드 경기가 끝났어요/)).toBeInTheDocument();
    expect(within(card as HTMLElement).getByRole('link', { name: /콘솔에서 확정하기/ })).toHaveAttribute(
      'href',
      '/admin/live/league-1/fixtures/tm-1/operate',
    );
  });

  it('확정 대기는 없고 뛰는 경기가 있으면 진행 중 카드로 그 콘솔을 연다', () => {
    const card = renderLeague([
      { ...base, teamMatchId: 'tm-live', title: '1주차', startAt: W1, gameState: 'LIVE' },
      { ...base, teamMatchId: 'tm-2', title: '2주차', startAt: W2 },
    ]);

    expect(within(card as HTMLElement).getByText(/경기가 진행 중이에요/)).toBeInTheDocument();
    expect(within(card as HTMLElement).getByRole('link', { name: '콘솔 열기' })).toHaveAttribute(
      'href',
      '/admin/live/league-1/fixtures/tm-live/operate',
    );
  });

  it('둘 다 없으면 다음 경기 준비 카드가 가장 이른 미진행 경기의 콘솔을 연다', () => {
    const card = renderLeague([
      { ...base, teamMatchId: 'tm-done', title: '1주차', startAt: W1, resultStage: 'official', gameState: 'ENDED', homeScore: 2, awayScore: 1 },
      { ...base, teamMatchId: 'tm-next', title: '2주차', startAt: W2 },
    ]);

    expect(within(card as HTMLElement).getByText(/다음 경기는 마포 FC vs 합정 유나이티드예요/)).toBeInTheDocument();
    expect(within(card as HTMLElement).getByText(/2주차/)).toBeInTheDocument();
    expect(within(card as HTMLElement).getByRole('link', { name: /다음 경기 콘솔 열기/ })).toHaveAttribute(
      'href',
      '/admin/live/league-1/fixtures/tm-next/operate',
    );
  });

  it('모든 경기가 끝났으면 카드가 없다', () => {
    const card = renderLeague([
      { ...base, teamMatchId: 'tm-done', title: '1주차', startAt: W1, resultStage: 'official', gameState: 'ENDED' },
    ]);

    expect(card).toBeNull();
  });

  it('대진이 아직 없는 리그에는 카드가 없다 (대진을 만드는 폼이 그 자리를 채운다)', () => {
    expect(renderLeague([])).toBeNull();
  });

  it('표의 행마다 콘솔 열기 링크가 하나 있고, 취소된 대진과 부전승 행에는 없다', () => {
    renderLeague([
      { ...base, teamMatchId: 'tm-1', title: '1주차', startAt: W1 },
      { ...base, teamMatchId: 'tm-cancelled', title: '2주차', startAt: W2, status: 'cancelled' },
      { ...base, teamMatchId: 'tm-bye', title: '3주차', startAt: W2, awayTeamId: null },
    ]);

    const table = screen.getByRole('table');
    const links = within(table).getAllByRole('link', { name: /콘솔 열기$/ });
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute('href', '/admin/live/league-1/fixtures/tm-1/operate');
    // 예전 행 안의 버튼들은 표에서 물러났다.
    expect(within(table).queryByRole('button', { name: /몰수패 처리|취소$/ })).toBeNull();
    expect(within(table).queryByRole('link', { name: /결과 입력/ })).toBeNull();
  });

  // G6-V2 — 수동으로 더한 경기는 주차 제목이 기존 경기와 같아진다. 버튼 이름이 제목뿐이면 스크린리더로 두 행을 못 가른다.
  it('같은 주차에 같은 두 팀이 두 번 붙어도 행 버튼 이름이 매치업과 일시로 갈린다', () => {
    renderLeague([
      { ...base, teamMatchId: 'tm-a', title: '1주차', startAt: '2026-09-29T16:10:00.000Z' },
      { ...base, teamMatchId: 'tm-b', title: '1주차', startAt: '2026-09-30T09:30:00.000Z' },
    ]);

    const table = screen.getByRole('table');
    for (const suffix of ['콘솔 열기', '더보기']) {
      const names = within(table)
        .getAllByRole(suffix === '더보기' ? 'button' : 'link', { name: new RegExp(`${suffix}$`) })
        .map((element) => element.getAttribute('aria-label'));
      expect(names).toHaveLength(2);
      expect(names).toEqual(expect.arrayContaining([
        expect.stringMatching(new RegExp(`^마포 FC vs 합정 유나이티드 .*01:10 ${suffix}$`)),
        expect.stringMatching(new RegExp(`^마포 FC vs 합정 유나이티드 .*18:30 ${suffix}$`)),
      ]));
    }
  });

  it('⋯ 시트에는 일정 수정·몰수패·대진 취소가 있고, 부전승 행에는 몰수패가 없다', () => {
    renderLeague([
      { ...base, teamMatchId: 'tm-1', title: '1주차', startAt: W1 },
      { ...base, teamMatchId: 'tm-bye', title: '3주차', startAt: W2, awayTeamId: null },
    ]);

    const sheet = openRowMenu('1주차');
    for (const name of [/^일정 수정/, /^몰수패 처리/, /^대진 취소/]) {
      expect(within(sheet).getByRole('button', { name })).toBeInTheDocument();
    }
    fireEvent.click(within(sheet).getByRole('button', { name: '닫기' }));

    const byeSheet = openRowMenu('3주차');
    expect(within(byeSheet).getByRole('button', { name: /^일정 수정/ })).toBeInTheDocument();
    expect(within(byeSheet).queryByRole('button', { name: /^몰수패 처리/ })).toBeNull();
  });

  // 자리만 있고 팀이 비어 있는 경기 — 팀을 못 정했으니 콘솔·결과·몰수 대상이 아니다.
  it('팀이 비어 있는 자리 경기는 미정으로 읽히고 콘솔 열기·몰수패가 없다 — 양쪽이 다 찬 경기는 그대로다', () => {
    renderLeague([
      { ...base, teamMatchId: 'tm-ready', title: '1주차', startAt: W1 },
      { ...base, teamMatchId: 'tm-empty', title: '2주차', startAt: W2, homeTeamId: null, awayTeamId: null, homeSlotId: 'slot-1', awaySlotId: 'slot-2' },
      { ...base, teamMatchId: 'tm-half', title: '3주차', startAt: W2, awayTeamId: null, awaySlotId: 'slot-4' },
    ]);

    expect(screen.getAllByText('홈팀 미정 vs 원정팀 미정').length).toBeGreaterThan(0);
    expect(screen.getAllByText('마포 FC vs 원정팀 미정').length).toBeGreaterThan(0);
    // 대조군: 팀이 다 찬 1주차만 콘솔을 연다. 자리 경기 둘에는 링크가 없다.
    const consoleLinks = screen.getAllByRole('link', { name: /콘솔 열기/ });
    expect(consoleLinks.length).toBeGreaterThan(0);
    for (const link of consoleLinks) {
      expect(link.getAttribute('href')).toContain('/tm-ready/');
    }

    const emptySheet = openRowMenu('2주차');
    expect(within(emptySheet).getByRole('button', { name: /^일정 수정/ })).toBeInTheDocument();
    expect(within(emptySheet).getByRole('button', { name: /^대진 취소/ })).toBeInTheDocument();
    expect(within(emptySheet).queryByRole('button', { name: /^몰수패 처리/ })).toBeNull();
    fireEvent.click(within(emptySheet).getByRole('button', { name: '닫기' }));

    // 대조군: 팀이 다 찬 경기는 몰수패 항목이 있다.
    expect(within(openRowMenu('1주차')).getByRole('button', { name: /^몰수패 처리/ })).toBeInTheDocument();
  });

  // W4-V14 — 진행 중 경기의 대진을 취소하면 게임이 진행 중으로 남는다. 서버가 409 로 막는 조건과 같다.
  it.each(['LIVE', 'PAUSED'])('경기가 %s 인 대진은 취소 항목이 비활성이고 이유를 적는다', (gameState) => {
    renderLeague([{ ...base, teamMatchId: 'tm-live', title: '1주차', startAt: W1, gameState }]);

    const cancel = within(openRowMenu('1주차')).getByRole('button', { name: /^대진 취소/ });
    expect(cancel).toBeDisabled();
    expect(cancel).toHaveTextContent('경기가 진행 중이에요');
  });

  it.each(['SCHEDULED', 'ENDED'])('경기가 %s 인 대진은 그대로 취소할 수 있다', (gameState) => {
    renderLeague([{ ...base, teamMatchId: 'tm-1', title: '1주차', startAt: W1, gameState }]);

    const cancel = within(openRowMenu('1주차')).getByRole('button', { name: /^대진 취소/ });
    expect(cancel).not.toBeDisabled();
    expect(cancel).not.toHaveTextContent('경기가 진행 중이에요');
  });

  // 팀 제외·재생성도 대진을 취소한다 — 서버가 같은 409 로 막는 조건에서 버튼을 미리 막는다.
  const THREE_TEAMS = [...TEAMS, { teamId: 't3', name: '성수 FC', status: 'active', memberCount: 5, logoUrl: null, registrationId: 'r-t3' }];
  const regenerateButton = () => screen.getAllByRole('button', { name: '대진 재생성' })[0];

  it('경기가 진행 중이면 그 두 팀의 제외와 대진 재생성이 막히고 이유를 적는다', () => {
    renderLeague([{ ...base, teamMatchId: 'tm-live', title: '1주차', startAt: W1, gameState: 'PAUSED' }], THREE_TEAMS);
    openFixtureManage();

    expect(screen.getByRole('button', { name: '마포 FC 제외' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '합정 유나이티드 제외' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '성수 FC 제외' })).not.toBeDisabled();
    expect(screen.getByText(/경기가 진행 중인 팀은/)).toBeInTheDocument();
    expect(regenerateButton()).toBeDisabled();
    expect(screen.getByText(/진행 중인 경기가 있어 대진을 다시 만들 수 없어요/)).toBeInTheDocument();
  });

  it('끝난 경기와 이미 취소된 대진만 있으면 제외·재생성은 예전대로 열린다', () => {
    renderLeague(
      [
        { ...base, teamMatchId: 'tm-done', title: '1주차', startAt: W1, resultStage: 'awaiting_approval', gameState: 'ENDED' },
        { ...base, teamMatchId: 'tm-void', title: '2주차', startAt: W2, status: 'cancelled', gameState: 'LIVE' },
      ],
      THREE_TEAMS,
    );
    openFixtureManage();

    expect(screen.getByRole('button', { name: '마포 FC 제외' })).not.toBeDisabled();
    expect(regenerateButton()).not.toBeDisabled();
    expect(screen.queryByText(/경기가 진행 중인 팀은/)).toBeNull();
    expect(screen.queryByText(/진행 중인 경기가 있어 대진을 다시 만들 수 없어요/)).toBeNull();
  });
});

describe('LeagueMatchFixturesClient — 일정 보드와 보기 전환', () => {
  type Fixture = Record<string, unknown>;
  const TEAMS = [
    { teamId: 't1', name: '마포 FC', status: 'active', memberCount: 5, logoUrl: null, registrationId: 'r1' },
    { teamId: 't2', name: '합정 유나이티드', status: 'active', memberCount: 5, logoUrl: null, registrationId: 'r2' },
  ];
  const SLOTS = [
    { id: 's1', kind: 'ENTRY', groupId: null, sourceGroupId: null, position: 1, label: '1번 자리', registrationId: null, teamName: null },
    { id: 's2', kind: 'ENTRY', groupId: null, sourceGroupId: null, position: 2, label: '2번 자리', registrationId: null, teamName: null },
  ];
  const EMPTY_FIXTURE: Fixture = {
    teamMatchId: 'tm-empty', title: '1주차', homeTeamId: null, awayTeamId: null, homeSlotId: 's1', awaySlotId: 's2',
    startAt: '2030-01-07T10:00:00.000Z', placeName: '장소 미정', status: 'matched',
    resultStage: 'not_entered', gameState: 'SCHEDULED', game: null, homeScore: null, awayScore: null,
  };

  function renderClient(options: { fixtures?: Fixture[]; slots?: unknown[]; initialView?: 'board' | 'list' } = {}) {
    const { fixtures = [EMPTY_FIXTURE], slots = SLOTS, initialView } = options;
    useV1ActivePopupMock.mockReturnValue({ data: undefined, isPending: false } as never);
    useV1AdminLeagueMatchMock.mockReturnValue({
      data: {
        leagueId: 'league-1', isPublic: true, title: '마포 주말 리그', state: 'active', teamIds: ['t1', 't2'],
        startsOn: '2030-01-07T00:00:00.000Z', recentVenues: [], fixtures, slots,
      },
      isPending: false,
    } as never);
    useV1AdminLeagueTeamsMock.mockReturnValue({ data: { leagueId: 'league-1', teams: TEAMS } } as never);
    useV1GenerateLeagueFixturesMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
    useV1UpdateLeagueFixtureMock.mockReturnValue({ mutate: vi.fn(), isPending: false } as never);
    render(
      <Providers>
        <LeagueMatchFixturesClient leagueId="league-1" initialView={initialView} />
      </Providers>,
    );
  }

  afterEach(() => {
    adminCanWrite.value = true;
    canvasMocks.applyTemplate.mockReset();
  });

  it('기본은 일정 보드이고, 목록 탭으로 바꾸면 기존 표가 나오며 다시 보드로 돌아온다', () => {
    renderClient();

    expect(screen.getByRole('tab', { name: '일정 보드', selected: true })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: '리그 일정 보드' })).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();

    fireEvent.click(screen.getByRole('tab', { name: '목록' }));
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: '리그 일정 보드' })).toBeNull();

    fireEvent.click(screen.getByRole('tab', { name: '일정 보드' }));
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByRole('region', { name: '리그 일정 보드' })).toBeInTheDocument();
  });

  it('initialView 가 list 면 처음부터 표를 보여 준다', () => {
    renderClient({ initialView: 'list' });
    expect(screen.getByRole('tab', { name: '목록', selected: true })).toBeInTheDocument();
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: '리그 일정 보드' })).toBeNull();
  });

  it('대진이 없으면 보드가 템플릿을 권하고, 목록으로 가면 기존 라운드로빈 생성 폼이 그대로 있다', () => {
    renderClient({ fixtures: [], slots: [] });

    fireEvent.click(screen.getByRole('button', { name: '템플릿으로 시작' }));
    expect(screen.getByRole('dialog', { name: '템플릿으로 빈 경기 만들기' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '닫기' }));

    fireEvent.click(screen.getByRole('tab', { name: '목록' }));
    expect(screen.getByRole('button', { name: '라운드로빈 대진 생성' })).toBeInTheDocument();
  });

  it('대진이 없으면 보드에서도 참가팀 관리·경기 하나 추가가 닿는다', () => {
    renderClient({ fixtures: [], slots: [] });

    expect(screen.getByRole('tab', { name: '일정 보드', selected: true })).toBeInTheDocument();
    expect(screen.getByText('참가팀 관리')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '경기 하나 추가' })).toBeInTheDocument();
  });

  it('템플릿을 만들면 새 경기만 보내고(replaceExisting 없음) 개수를 알린다 — 참가팀 2팀이어도 팀 수 기본값은 최소 3', async () => {
    canvasMocks.applyTemplate.mockResolvedValue({ slots: 3, fixtures: 3 });
    renderClient({ fixtures: [], slots: [] });

    fireEvent.click(screen.getByRole('button', { name: '템플릿으로 시작' }));
    fireEvent.change(screen.getByLabelText('요일'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: '요일로 채우기' }));
    fireEvent.click(screen.getByRole('button', { name: '빈 경기 만들기' }));

    await waitFor(() => expect(canvasMocks.applyTemplate).toHaveBeenCalledTimes(1));
    const payload = canvasMocks.applyTemplate.mock.calls[0][0];
    expect(payload).toEqual({
      teamCount: 3,
      legs: 1,
      schedule: { dates: ['2030-01-07', '2030-01-14', '2030-01-21'], time: '19:00' },
    });
    expect(Object.keys(payload)).not.toContain('replaceExisting');
    expect(await screen.findByText(/빈 경기 3개를 만들었어요/)).toBeInTheDocument();
  });

  it('경기가 이미 있으면 템플릿 대화상자가 다시 만들기 모드로 열려 replaceExisting 을 보낸다', async () => {
    canvasMocks.applyTemplate.mockResolvedValue({ slots: 3, fixtures: 3 });
    renderClient();

    fireEvent.click(screen.getByRole('button', { name: '템플릿으로 다시 만들기' }));
    fireEvent.change(screen.getByLabelText('요일'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: '요일로 채우기' }));
    fireEvent.click(screen.getByRole('button', { name: '다시 만들기' }));

    await waitFor(() => expect(canvasMocks.applyTemplate).toHaveBeenCalledTimes(1));
    expect(canvasMocks.applyTemplate.mock.calls[0][0]).toMatchObject({ teamCount: 3, legs: 1, replaceExisting: true });
  });

  it('보드 패널의 일정 수정·경기 취소가 기존 모달로 이어진다', () => {
    renderClient();

    fireEvent.click(screen.getByRole('button', { name: /경기 상세 열기/ }));
    fireEvent.click(screen.getByRole('button', { name: '일정 수정' }));
    expect(screen.getByRole('heading', { name: '일정 수정' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '취소' }));

    fireEvent.click(screen.getByRole('button', { name: /경기 상세 열기/ }));
    fireEvent.click(screen.getByRole('button', { name: '경기 취소' }));
    expect(screen.getByRole('heading', { name: '대진을 취소할까요?' })).toBeInTheDocument();
  });

  it('쓰기 권한이 없으면 보드는 읽기 전용이다', () => {
    adminCanWrite.value = false;
    renderClient();

    // 화면에는 다른 status 영역(대표 이미지 저장 안내 등)이 있을 수 있어 보드 안으로 좁힌다.
    expect(within(screen.getByRole('region', { name: '리그 일정 보드' })).getByRole('status')).toHaveTextContent('읽기 전용');
    expect(screen.queryByRole('button', { name: '빈 자리 무작위 채우기' })).toBeNull();
    expect(screen.queryByRole('button', { name: '템플릿으로 다시 만들기' })).toBeNull();
  });

  it('자리 방식 리그는 목록의 대진 재생성을 막고 템플릿으로 안내한다 — 자리 없는 리그는 그대로 열려 있다', () => {
    renderClient({ initialView: 'list', fixtures: [{ ...EMPTY_FIXTURE, homeTeamId: 't1', awayTeamId: 't2' }] });
    openFixtureManage();
    expect(screen.getAllByRole('button', { name: '대진 재생성' })[0]).toBeDisabled();
    expect(screen.getByText(/일정 보드의 ‘템플릿으로 다시 만들기’/)).toBeInTheDocument();
  });
});
