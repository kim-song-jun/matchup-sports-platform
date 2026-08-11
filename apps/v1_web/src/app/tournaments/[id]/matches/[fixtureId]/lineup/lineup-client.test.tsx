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
