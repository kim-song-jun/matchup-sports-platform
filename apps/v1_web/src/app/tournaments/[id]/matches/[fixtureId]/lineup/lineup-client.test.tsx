import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { V1ApiError } from '@/lib/api-client';
import type { V1FixtureLineupAccess } from '@/hooks/use-v1-api';
import type { V1Game } from '@/types/api';
import type { GameLineup } from '@/types/game-operations';

// ─────────────────────────────────────────────────────────────────────────────
// UX 감사(2026-08) 발견 3건에 대한 회귀 테스트.
//   1) 조회 실패 시 무한 로딩 스켈레톤에 갇히는 문제 (gameQuery/lineupsQuery isError 미처리)
//   2) 접근권한 조회 실패를 원인 불문 "권한 없음"으로 표시하는 문제
//   3) dirty 상태에서 제출 버튼이 이유 없이 비활성되는 문제
// 셋 다 "이 화면이 실패 상태를 실제로 주입받았을 때 무엇을 보여주는가"를 검증한다 —
// 구현을 되읊는 테스트가 아니라 실제 렌더 결과·재시도 버튼 동작을 확인한다.
// ─────────────────────────────────────────────────────────────────────────────

const hoisted = vi.hoisted(() => ({
  useV1FixtureLineupAccessMock: vi.fn(),
  useV1GameMock: vi.fn(),
  useV1GameLineupsMock: vi.fn(),
  useV1TournamentMock: vi.fn(),
  saveMutateAsync: vi.fn(),
  submitMutateAsync: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/tournaments/t-1/matches/f-1/lineup',
}));

vi.mock('@/hooks/use-v1-api', () => ({
  useV1FixtureLineupAccess: hoisted.useV1FixtureLineupAccessMock,
  useV1Game: hoisted.useV1GameMock,
  useV1GameLineups: hoisted.useV1GameLineupsMock,
  useV1Tournament: hoisted.useV1TournamentMock,
  useV1SaveGameLineup: () => ({ mutateAsync: hoisted.saveMutateAsync, isPending: false }),
  useV1SubmitGameLineup: () => ({ mutateAsync: hoisted.submitMutateAsync, isPending: false }),
  // AppChrome 헤더의 알림 벨(NotificationBellLink)이 호출한다 — 훅 모듈 전체를 모킹하는
  // 이상 실제로 렌더되는 하위 트리가 쓰는 훅도 채워줘야 한다(team-matches 쪽 lineup.test.tsx와
  // 동일한 이유).
  useV1NotificationUnreadSummary: () => ({ data: undefined }),
}));

import { FixtureLineupPageClient } from './lineup-client';

function baseAccess(overrides: Partial<V1FixtureLineupAccess> = {}): V1FixtureLineupAccess {
  return {
    gameId: 'game-1',
    mySideId: 'side-host',
    isStaff: false,
    scheduledAt: null,
    homeSideId: 'side-host',
    homeTeamName: '홈팀',
    awaySideId: 'side-away',
    awayTeamName: '원정팀',
    ...overrides,
  };
}

function baseGame(overrides: Partial<V1Game> = {}): V1Game {
  return {
    id: 'game-1',
    sourceType: 'TOURNAMENT_FIXTURE',
    state: 'SCHEDULED',
    version: 0,
    lastSequence: 0,
    competitionConfigVersionId: 'cfg-1',
    currentOfficialRevisionId: null,
    sides: [],
    periods: [],
    lineups: [],
    actorRole: 'team_manager',
    ...overrides,
  };
}

function baseGameLineup(overrides: Partial<GameLineup> = {}): GameLineup {
  return {
    id: 'lineup-1',
    gameId: 'game-1',
    sideId: 'side-host',
    revision: 1,
    state: 'DRAFT',
    version: 0,
    submittedAt: null,
    supersedesId: null,
    formation: null,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    participants: [
      {
        id: 'p-1',
        gameId: 'game-1',
        sideId: 'side-host',
        lineupId: 'lineup-1',
        displayNameSnapshot: '홍길동',
        jerseyNumber: 7,
        position: null,
        positionX: null,
        positionY: null,
        started: true,
        createdAt: '2026-08-01T00:00:00.000Z',
        updatedAt: '2026-08-01T00:00:00.000Z',
      },
    ],
    ...overrides,
  };
}

describe('FixtureLineupPageClient — 실패 상태에서 빠져나올 길', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.useV1TournamentMock.mockReturnValue({ data: { sport: { name: '풋살' } }, isLoading: false, isError: false });
  });

  it('접근권한 조회가 403(PERMISSION_DENIED)이면 매니저·오너 전용 안내를 보여주고 재시도 버튼은 없다', () => {
    hoisted.useV1FixtureLineupAccessMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new V1ApiError({
        status: 'error',
        statusCode: 403,
        code: 'PERMISSION_DENIED',
        message: 'Actor scope is not permitted',
        timestamp: '2026-08-01T00:00:00.000Z',
      }),
      refetch: vi.fn(),
    });
    hoisted.useV1GameMock.mockReturnValue({ data: undefined, isLoading: false, isError: false, error: null, refetch: vi.fn() });
    hoisted.useV1GameLineupsMock.mockReturnValue({ data: undefined, isLoading: false, isError: false, error: null, refetch: vi.fn() });

    render(<FixtureLineupPageClient tournamentId="t-1" fixtureId="f-1" />);

    expect(screen.getByText('라인업을 관리할 수 없어요')).toBeInTheDocument();
    expect(screen.getByText('이 경기에 참가하는 팀의 매니저·오너만 라인업을 관리할 수 있어요.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '다시 시도하기' })).not.toBeInTheDocument();
  });

  it('접근권한 조회가 네트워크/서버 오류로 실패하면 "권한 없음"이 아니라 재시도 가능한 에러 화면을 보여준다', () => {
    const refetch = vi.fn();
    hoisted.useV1FixtureLineupAccessMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      // V1ApiError가 아닌 일반 네트워크 단절 에러 — api-client.ts 주석대로 이 경우는
      // V1ApiError로 감싸이지 않고 그대로 전파된다.
      error: new TypeError('Failed to fetch'),
      refetch,
    });
    hoisted.useV1GameMock.mockReturnValue({ data: undefined, isLoading: false, isError: false, error: null, refetch: vi.fn() });
    hoisted.useV1GameLineupsMock.mockReturnValue({ data: undefined, isLoading: false, isError: false, error: null, refetch: vi.fn() });

    render(<FixtureLineupPageClient tournamentId="t-1" fixtureId="f-1" />);

    expect(screen.queryByText('라인업을 관리할 수 없어요')).not.toBeInTheDocument();
    const retryButton = screen.getByRole('button', { name: '다시 시도하기' });
    fireEvent.click(retryButton);
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('접근권한은 성공했지만 게임/라인업 조회가 실패하면 무한 스켈레톤 대신 재시도 가능한 에러 화면을 보여준다', () => {
    hoisted.useV1FixtureLineupAccessMock.mockReturnValue({
      data: baseAccess(),
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    const gameRefetch = vi.fn();
    hoisted.useV1GameMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('boom'),
      refetch: gameRefetch,
    });
    const lineupsRefetch = vi.fn();
    hoisted.useV1GameLineupsMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
      error: null,
      refetch: lineupsRefetch,
    });

    const { container } = render(<FixtureLineupPageClient tournamentId="t-1" fixtureId="f-1" />);

    // 수정 전에는 state===null이 영원히 유지돼 PageSkeleton(.tm-skeleton-page)이 계속 렌더됐다.
    expect(container.querySelector('.tm-skeleton-page')).not.toBeInTheDocument();
    const retryButton = screen.getByRole('button', { name: '다시 시도하기' });
    fireEvent.click(retryButton);
    expect(gameRefetch).toHaveBeenCalledTimes(1);
    expect(lineupsRefetch).not.toHaveBeenCalled();
  });

  it('선수 추가로 dirty해지면 제출 버튼이 잠기고 "먼저 저장해 주세요"로 이유를 인라인으로 보여준다', () => {
    hoisted.useV1FixtureLineupAccessMock.mockReturnValue({
      data: baseAccess(),
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    hoisted.useV1GameMock.mockReturnValue({ data: baseGame(), isLoading: false, isError: false, error: null, refetch: vi.fn() });
    hoisted.useV1GameLineupsMock.mockReturnValue({
      data: [baseGameLineup()],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<FixtureLineupPageClient tournamentId="t-1" fixtureId="f-1" />);

    expect(screen.getByRole('button', { name: '라인업 제출하기' })).not.toBeDisabled();

    fireEvent.change(screen.getByLabelText('추가할 선수 이름'), { target: { value: '새 선수' } });
    fireEvent.click(screen.getByRole('button', { name: '추가' }));

    const dirtySubmitButton = screen.getByRole('button', {
      name: '저장하지 않은 변경사항이 있어요 — 먼저 저장해 주세요',
    });
    expect(dirtySubmitButton).toBeDisabled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2026-08 사용자 지적 회귀 테스트.
//   1) "선발도 등번호 선택 그런게 있어야 하는데 전혀 그런게 없고" → 등번호 input은 예전에도
//      DOM에 있었지만 눈에 띄는 라벨이 없어 빈 값일 때 입력 가능한 필드처럼 보이지 않았다.
//      각 행에 <label for=...>등번호</label>가 실제로 연결돼 있는지 검증한다.
//   2) "데스크탑에서는 피치배치 명단 둘다 같이나올수있을것같고" → 데스크톱 2컬럼 동시 노출은
//      탭으로 마운트/언마운트하지 않고 두 영역을 항상 함께 렌더할 때만 성립한다. 탭 상태와
//      무관하게 두 영역이 DOM에 함께 존재하는지 검증한다(진짜 뷰포트 렌더는 playwright가 담당).
//   3) "항상 피치 배치가 먼저 나왔으면 좋겠어" → 탭 순서·기본 활성 탭이 모두 피치 배치인지 검증.
// ─────────────────────────────────────────────────────────────────────────────
describe('FixtureLineupPageClient — 피치 배치 우선 노출 + 등번호 입력 가시성', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.useV1TournamentMock.mockReturnValue({ data: { sport: { name: '풋살' } }, isLoading: false, isError: false });
    hoisted.useV1FixtureLineupAccessMock.mockReturnValue({
      data: baseAccess(),
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    hoisted.useV1GameMock.mockReturnValue({ data: baseGame(), isLoading: false, isError: false, error: null, refetch: vi.fn() });
    hoisted.useV1GameLineupsMock.mockReturnValue({
      data: [
        baseGameLineup({
          participants: [
            {
              id: 'p-1',
              gameId: 'game-1',
              sideId: 'side-host',
              lineupId: 'lineup-1',
              displayNameSnapshot: '홍길동',
              jerseyNumber: 7,
              position: null,
              positionX: null,
              positionY: null,
              started: true,
              createdAt: '2026-08-01T00:00:00.000Z',
              updatedAt: '2026-08-01T00:00:00.000Z',
            },
            {
              id: 'p-2',
              gameId: 'game-1',
              sideId: 'side-host',
              lineupId: 'lineup-1',
              displayNameSnapshot: '김후보',
              jerseyNumber: null, // 등번호 미입력 상태 — "빈 입력이 안 보인다" 문제를 그대로 재현
              position: null,
              positionX: null,
              positionY: null,
              started: false,
              createdAt: '2026-08-01T00:00:00.000Z',
              updatedAt: '2026-08-01T00:00:00.000Z',
            },
          ],
        }),
      ],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
  });

  it('탭 순서는 "피치 배치" → "명단" 이고 기본 활성 탭은 피치 배치다', () => {
    render(<FixtureLineupPageClient tournamentId="t-1" fixtureId="f-1" />);

    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual(['피치 배치', '명단']);
    expect(screen.getByRole('tab', { name: '피치 배치' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: '명단' })).toHaveAttribute('aria-selected', 'false');
  });

  it('탭 상태와 무관하게 피치 배치·명단 영역이 항상 함께 DOM에 존재한다 (데스크톱 2컬럼 동시 노출의 전제 조건)', () => {
    render(<FixtureLineupPageClient tournamentId="t-1" fixtureId="f-1" />);

    // 기본(피치 배치 활성) 상태에서도 명단 영역이 이미 마운트돼 있어야 한다 — 탭으로
    // 마운트/언마운트하면 데스크톱 CSS(.tm-fixture-lineup-pane 강제 노출)가 보여줄 것이 없다.
    expect(screen.getByRole('region', { name: '피치 배치' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: '명단' })).toBeInTheDocument();

    // 탭을 전환해도(명단으로) 피치 배치 영역이 언마운트되지 않고 그대로 남아 있어야 한다.
    fireEvent.click(screen.getByRole('tab', { name: '명단' }));
    expect(screen.getByRole('region', { name: '피치 배치' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: '명단' })).toBeInTheDocument();
  });

  it('등번호 입력이 선발·후보 각 행에 눈에 보이는 라벨과 함께 존재한다', () => {
    render(<FixtureLineupPageClient tournamentId="t-1" fixtureId="f-1" />);

    const starterInput = screen.getByLabelText('홍길동 등번호');
    expect(starterInput).toHaveAttribute('type', 'number');
    expect(starterInput.getAttribute('placeholder')).toBeTruthy();
    const starterInputId = starterInput.getAttribute('id');
    expect(starterInputId).toBeTruthy();
    const starterLabel = document.querySelector(`label[for="${starterInputId}"]`);
    expect(starterLabel).not.toBeNull();
    // 등번호는 저장/제출 모두 필수가 아니라 라벨에서 "(선택)"임을 함께 밝힌다 — 정확한
    // 문구 전체가 아니라 "등번호" 텍스트를 포함하는지만 검증해 표현 디테일에 결합하지 않는다.
    expect(starterLabel?.textContent).toContain('등번호');

    // 등번호가 비어 있는 후보(김후보)도 동일하게 라벨이 연결된 입력을 가진다 —
    // "빈 값이면 입력창처럼 안 보인다"는 지적을 후보 쪽에도 동일하게 해소해야 한다.
    const benchInput = screen.getByLabelText('김후보 등번호');
    expect(benchInput).toHaveAttribute('type', 'number');
    expect(benchInput.getAttribute('placeholder')).toBeTruthy();
    const benchInputId = benchInput.getAttribute('id');
    expect(benchInputId).toBeTruthy();
    const benchLabel = document.querySelector(`label[for="${benchInputId}"]`);
    expect(benchLabel).not.toBeNull();
    expect(benchLabel?.textContent).toContain('등번호');
  });
});

describe('골키퍼 지정 버튼의 aria-label 조사(을/를)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.useV1TournamentMock.mockReturnValue({ data: { sport: { name: '풋살' } }, isLoading: false, isError: false });
    hoisted.useV1FixtureLineupAccessMock.mockReturnValue({
      data: baseAccess(),
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    hoisted.useV1GameMock.mockReturnValue({ data: baseGame(), isLoading: false, isError: false, error: null, refetch: vi.fn() });
  });

  it('받침 없는 이름·숫자로 끝나는 이름에는 "를"을 붙인다 (받침 유무 무시 고정 "을" 버그 회귀)', () => {
    hoisted.useV1GameLineupsMock.mockReturnValue({
      data: [
        baseGameLineup({
          participants: [
            {
              id: 'p-1',
              gameId: 'game-1',
              sideId: 'side-host',
              lineupId: 'lineup-1',
              displayNameSnapshot: '김알파',
              jerseyNumber: 1,
              position: null,
              positionX: null,
              positionY: null,
              started: true,
              createdAt: '2026-08-01T00:00:00.000Z',
              updatedAt: '2026-08-01T00:00:00.000Z',
            },
            {
              id: 'p-2',
              gameId: 'game-1',
              sideId: 'side-host',
              lineupId: 'lineup-1',
              displayNameSnapshot: '레드2',
              jerseyNumber: 2,
              position: null,
              positionX: null,
              positionY: null,
              started: true,
              createdAt: '2026-08-01T00:00:00.000Z',
              updatedAt: '2026-08-01T00:00:00.000Z',
            },
          ],
        }),
      ],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<FixtureLineupPageClient tournamentId="t-1" fixtureId="f-1" />);

    expect(screen.getByRole('button', { name: '김알파를 골키퍼로 지정' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '레드2를 골키퍼로 지정' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '김알파을 골키퍼로 지정' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '레드2을 골키퍼로 지정' })).not.toBeInTheDocument();
  });

  it('받침 있는 이름에는 "을"을 붙인다', () => {
    hoisted.useV1GameLineupsMock.mockReturnValue({
      data: [baseGameLineup()], // displayNameSnapshot: '홍길동' (받침 있음)
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<FixtureLineupPageClient tournamentId="t-1" fixtureId="f-1" />);

    expect(screen.getByRole('button', { name: '홍길동을 골키퍼로 지정' })).toBeInTheDocument();
  });
});

/**
 * 순환 막다른 길 회귀 가드.
 *
 * 대회 스태프는 어느 팀에도 속하지 않아 `mySideId` 가 null 이다. 예전엔 그걸 곧바로
 * "운영진은 대회 운영 콘솔을 이용해 주세요" 로 막았는데, **운영 콘솔에는 라인업 화면이
 * 없다** — 그래서 운영 콘솔의 "라인업 제출하러 가기" 가 이 화면으로 보내고, 이 화면이
 * 다시 운영 콘솔로 돌려보내는 순환이 됐다(2026-08-11 알파 실측: 그 화면의 액션 버튼 0개).
 * 라인업이 없으면 "경기 시작" 이 비활성이므로, 팀 매니저가 없는 자리에서는 경기를
 * 시작할 방법이 아예 없었다.
 */
describe('대회 스태프도 라인업을 짤 수 있다', () => {
  beforeEach(() => {
    hoisted.useV1GameMock.mockReturnValue({
      data: baseGame(), isLoading: false, isError: false, error: null, refetch: vi.fn(),
    });
    hoisted.useV1GameLineupsMock.mockReturnValue({
      data: [baseGameLineup()], isLoading: false, isError: false, error: null, refetch: vi.fn(),
    });
  });

  it('스태프(mySideId=null)를 운영 콘솔로 돌려보내지 않고 편집할 팀을 고르게 한다', () => {
    hoisted.useV1FixtureLineupAccessMock.mockReturnValue({
      data: baseAccess({ mySideId: null, isStaff: true }),
      isLoading: false, isError: false, error: null, refetch: vi.fn(),
    });

    render(<FixtureLineupPageClient tournamentId="t-1" fixtureId="f-1" />);

    expect(screen.queryByText('운영진은 대회 운영 콘솔을 이용해 주세요')).toBeNull();
    expect(screen.getByText('어느 팀의 명단을 짤까요?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '홈팀 명단 짜기' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '원정팀 명단 짜기' })).toBeInTheDocument();
  });

  it('팀을 고르면 매니저와 동일한 편집 화면으로 들어간다', () => {
    hoisted.useV1FixtureLineupAccessMock.mockReturnValue({
      data: baseAccess({ mySideId: null, isStaff: true }),
      isLoading: false, isError: false, error: null, refetch: vi.fn(),
    });

    render(<FixtureLineupPageClient tournamentId="t-1" fixtureId="f-1" />);
    fireEvent.click(screen.getByRole('button', { name: '홈팀 명단 짜기' }));

    expect(screen.queryByText('어느 팀의 명단을 짤까요?')).toBeNull();
    expect(screen.getByRole('button', { name: '라인업 제출하기' })).toBeInTheDocument();
  });

  it('팀 소속도 스태프도 아니면 권한 없음으로 막는다', () => {
    hoisted.useV1FixtureLineupAccessMock.mockReturnValue({
      data: baseAccess({ mySideId: null, isStaff: false }),
      isLoading: false, isError: false, error: null, refetch: vi.fn(),
    });

    render(<FixtureLineupPageClient tournamentId="t-1" fixtureId="f-1" />);

    expect(screen.getByText('이 경기의 라인업을 관리할 권한이 없어요')).toBeInTheDocument();
    expect(screen.queryByText('어느 팀의 명단을 짤까요?')).toBeNull();
  });
});
