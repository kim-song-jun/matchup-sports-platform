import { render, screen, within, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GameResultReviewPanel } from './game-result-review-panel';
import type { TournamentGameDetail } from '@/hooks/use-tournament-result-review';

/**
 * Root-cause regression (2026-08 alpha 실사고): 실제 점수는 2:1인데 "결과를
 * 확정할까요?" 확인 모달이 "1:1 결과를 확정할까요?"로 떴다 — 되돌릴 수 없는
 * 확정 액션 직전에 틀린 숫자를 보여준 것. 원인은 이 화면 전역
 * QueryClient의 기본 `staleTime: 30_000`(providers.tsx) 때문에
 * `useGameResultRevisions`/`useTournamentGame`이 최근 30초 내 한 번이라도
 * 불러온 적이 있으면 리마운트 없이는 재요청하지 않는다는 점이다.
 *
 * 이 테스트는 "확인"을 눌렀을 때 훅의 캐시값을 그대로 믿지 않고
 * 반드시 `refetch()`로 최신값을 받아와, 그 값을 확인 문구와 실제 제출
 * payload 양쪽에 쓰는지를 검증한다 — 구현을 되읊는 게 아니라 "사용자가
 * 보는 숫자"와 "서버에 실제로 제출되는 숫자"가 최신값과 일치하는지를
 * 관찰 가능한 방식(렌더된 텍스트 + mutate 호출 인자)으로 확인한다.
 */

const mocks = vi.hoisted(() => ({
  useTournamentGame: vi.fn(),
  useGameResultRevisions: vi.fn(),
  useSupersedeAndSubmitResult: vi.fn(),
  useOfficializeResultRevision: vi.fn(),
}));

vi.mock('@/hooks/use-tournament-result-review', () => ({
  useTournamentGame: (...args: unknown[]) => mocks.useTournamentGame(...args),
  useGameResultRevisions: (...args: unknown[]) => mocks.useGameResultRevisions(...args),
  useSupersedeAndSubmitResult: (...args: unknown[]) => mocks.useSupersedeAndSubmitResult(...args),
  useOfficializeResultRevision: (...args: unknown[]) => mocks.useOfficializeResultRevision(...args),
}));
vi.mock('@/hooks/use-v1-api', () => ({
  useV1GameLineups: () => ({ data: [], isLoading: false }),
}));
// 이벤트 조회 결과를 테스트마다 바꾼다 — "미기록"과 "조회 실패"를 구분하는 게 이 이슈의 핵심이다.
const eventsMock = vi.hoisted(() => ({
  state: { data: { events: [], lastSequence: 0, gap: null }, isPending: false, isError: false, error: null, refetch: () => {} } as Record<string, unknown>,
}));
vi.mock('@/hooks/use-v1-game-operations', () => ({
  useV1GameEventsBackfill: () => eventsMock.state,
}));

const GAME_ID = 'game-1';

const STALE_REVISION = {
  id: 'revision-1',
  gameId: GAME_ID,
  revision: 1,
  state: 'SUBMITTED',
  score: { home: 1, away: 1 },
  eventsHash: 'hash-stale',
  missingScorer: false,
  mvpParticipantId: null,
  reason: null,
  outcomeReason: 'NORMAL' as const,
  outcomeNote: null,
  createdByActorType: 'SYSTEM' as const,
  createdByUserId: null,
  createdBySystemActor: 'GAME_END_DERIVER',
  supersedesId: null,
  submittedAt: '2026-08-11T00:00:00.000Z',
  officialAt: null,
  createdAt: '2026-08-11T00:00:00.000Z',
  updatedAt: '2026-08-11T00:00:00.000Z',
  resultParticipants: [],
};

const FRESH_REVISION = {
  ...STALE_REVISION,
  score: { home: 2, away: 1 },
  eventsHash: 'hash-fresh',
};

/**
 * 반환 타입을 `TournamentGameDetail` 로 못 박아 둔다 -- 예전에는 반환 타입이 없고
 * overrides 가 `Partial<Record<string, unknown>>` 이라, 서버 응답 계약에 필드가 늘어도
 * (예: `isKnockoutFixture`) 이 mock 이 조용히 뒤처지고 `tsc` 는 아무 말도 하지 않았다
 * (프로젝트 규칙 4 — 계약이 바뀌면 영향받는 inline mock 도 같은 변경에서 갱신한다).
 */
function gameDetail(overrides: Partial<TournamentGameDetail> = {}): TournamentGameDetail {
  return {
    id: GAME_ID,
    sourceType: 'TOURNAMENT_FIXTURE' as const,
    state: 'ENDED' as const,
    version: 2,
    lastSequence: 3,
    competitionConfigVersionId: 'config-1',
    currentOfficialRevisionId: null,
    sides: [
      { id: 'side-home', gameId: GAME_ID, sideKey: 'HOME' as const, teamId: null, displayNameSnapshot: '홈' },
      { id: 'side-away', gameId: GAME_ID, sideKey: 'AWAY' as const, teamId: null, displayNameSnapshot: '원정' },
    ],
    actorRole: 'platform_ops' as const,
    isKnockoutFixture: false,
    ...overrides,
  };
}

describe('GameResultReviewPanel — 결과 확정 확인 모달은 캐시가 아니라 최신값을 보여준다', () => {
  let gameRefetch: ReturnType<typeof vi.fn>;
  let revisionsRefetch: ReturnType<typeof vi.fn>;
  let officializeMutate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    gameRefetch = vi.fn(async () => ({ data: gameDetail({ version: 3 }) }));
    revisionsRefetch = vi.fn(async () => ({ data: [FRESH_REVISION] }));
    officializeMutate = vi.fn();

    // 렌더 시점(마운트 직후, 아직 refetch 전)엔 캐시된 STALE 값 — 여기서
    // 사용자가 "확인"을 누르는 시나리오를 재현한다.
    mocks.useTournamentGame.mockReturnValue({
      data: gameDetail(),
      isPending: false,
      isError: false,
      refetch: gameRefetch,
    });
    mocks.useGameResultRevisions.mockReturnValue({
      data: [STALE_REVISION],
      isPending: false,
      isError: false,
      refetch: revisionsRefetch,
    });
    mocks.useSupersedeAndSubmitResult.mockReturnValue({ mutate: vi.fn(), isPending: false, isError: false });
    mocks.useOfficializeResultRevision.mockReturnValue({
      mutate: officializeMutate,
      isPending: false,
      isError: false,
    });
  });

  it('"확인"을 누르면 강제로 다시 불러온 최신 점수를 확인 문구에 보여준다', async () => {
    render(<GameResultReviewPanel gameId={GAME_ID} />);

    fireEvent.click(screen.getByRole('button', { name: '확인' }));

    await waitFor(() => expect(revisionsRefetch).toHaveBeenCalled());
    await waitFor(() => expect(gameRefetch).toHaveBeenCalled());

    const dialog = await screen.findByRole('dialog');
    // 마운트 시점 캐시(1:1)가 아니라 refetch로 받은 최신값(2:1)이 떠야 한다.
    expect(within(dialog).getByText(/2:1 결과를 공식 결과로 확정해요/)).toBeInTheDocument();
    expect(within(dialog).queryByText(/1:1 결과를/)).toBeNull();
  });

  it('확정을 누르면 화면에 보여준 것과 같은 최신 점수/버전으로 실제 제출한다', async () => {
    render(<GameResultReviewPanel gameId={GAME_ID} />);

    fireEvent.click(screen.getByRole('button', { name: '확인' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: '확정' }));

    await waitFor(() =>
      expect(officializeMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          revisionId: FRESH_REVISION.id,
          expectedVersion: 3,
          score: FRESH_REVISION.score,
          eventsHash: FRESH_REVISION.eventsHash,
        }),
        expect.anything(),
      ),
    );
  });

  /* #379 — 검토자는 점수 숫자만으로 승인/반려를 결정할 수 없다. 골·도움·카드가 언제
     어느 팀 누구에게 기록됐는지가 판단 근거다. 그리고 "아직 안 적혔다"와 "못 불러왔다"를
     같은 화면으로 뭉개면 검토자가 근거 없이 승인해 버린다. */
  it('기록된 이벤트를 세부 내역으로 보여준다', () => {
    eventsMock.state = {
      data: {
        events: [
          { id: 'e1', type: 'GOAL', sequence: 1, sideId: 'side-home', participantId: 'p1',
            displayNameSnapshot: '김알파', occurredAt: '2026-08-11T00:05:00.000Z', payload: {} },
        ],
        lastSequence: 1, gap: null,
      },
      isPending: false, isError: false, error: null, refetch: () => {},
    };

    render(<GameResultReviewPanel gameId={GAME_ID} />);

    expect(screen.getByText('경기 세부 기록')).toBeInTheDocument();
    expect(screen.queryByText('세부 기록을 불러오지 못했어요')).toBeNull();
  });

  it('조회 실패를 미기록과 구분해 표시하고 재시도 경로를 준다', () => {
    eventsMock.state = {
      data: undefined, isPending: false, isError: true,
      error: new Error('network down'), refetch: () => {},
    };

    render(<GameResultReviewPanel gameId={GAME_ID} />);

    // 실패는 실패로 보여야 한다 — 빈 목록처럼 보이면 안 된다
    expect(screen.getByText('세부 기록을 불러오지 못했어요')).toBeInTheDocument();
  });
});

/**
 * 재제출(supersede-and-submit) 레인도 정정 레인과 **같은** 서버 승부차기 가드를 통과한다
 * (`GamesService.applyPenalties`) -- 그러므로 이 패널도 `game.isKnockoutFixture` 를 폼까지
 * 내려보내야 한다. 이 배선이 없으면 폼은 이 픽스처를 항상 비결선으로 보고, 결선 무승부
 * 재제출에서 승부차기 결과를 조용히 떨어뜨린다(그 값을 고칠 입력란은 폼에 없다).
 *
 * 그래서 아래 두 테스트는 배선 자체가 아니라 **배선이 있어야만 성립하는 관찰 가능한 결과**
 * (실제 제출 payload 의 `penalties` + 사전 경고 문구)를 단언한다.
 */
/**
 * 결과 검수 화면 상단 헤더(`GameSummaryHeader`)는 승부차기 문구를 손으로 조립하고 있었다
 * (`승부차기 {home}:{away}`). 그래서 같은 화면 **아래** 리비전 타임라인은 공용 포맷터를
 * 써서 `선축 원정`이 뜨는데 **바로 위** 헤더에는 안 뜨는 어긋남이 생겼다 — 같은 사실이
 * 한 화면 안에서 있다/없다로 갈렸다.
 */
describe('GameResultReviewPanel — 확정 결과 헤더의 승부차기 표기', () => {
  const OFFICIAL_PENALTY_REVISION = {
    ...STALE_REVISION,
    id: 'revision-official',
    state: 'OFFICIAL',
    score: { home: 0, away: 0, penalties: { home: 2, away: 0, firstKickSideKey: 'AWAY' } },
  };

  beforeEach(() => {
    eventsMock.state = {
      data: { events: [], lastSequence: 0, gap: null },
      isPending: false,
      isError: false,
      error: null,
      refetch: () => {},
    };
    mocks.useGameResultRevisions.mockReturnValue({
      data: [OFFICIAL_PENALTY_REVISION],
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    });
    mocks.useOfficializeResultRevision.mockReturnValue({ mutate: vi.fn(), isPending: false, isError: false });
    mocks.useSupersedeAndSubmitResult.mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      isError: false,
      reset: vi.fn(),
    });
    mocks.useTournamentGame.mockReturnValue({
      data: gameDetail({ isKnockoutFixture: true, currentOfficialRevisionId: 'revision-official' }),
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    });
  });

  it('확정된 결선 경기의 헤더가 승부차기와 선축을 함께 보여준다', () => {
    render(<GameResultReviewPanel gameId={GAME_ID} />);

    expect(screen.getByText('승부차기 2:0, 선축 원정')).toBeInTheDocument();
  });
});

describe('GameResultReviewPanel — 재제출 폼도 결선 승부차기 가드를 따른다', () => {
  const PENALTY_REVISION = {
    ...STALE_REVISION,
    id: 'revision-resubmittable',
    state: 'SUBMITTED',
    score: { home: 1, away: 1, penalties: { home: 4, away: 3 } },
  };
  let supersedeMutate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    supersedeMutate = vi.fn();
    eventsMock.state = {
      data: { events: [], lastSequence: 0, gap: null },
      isPending: false,
      isError: false,
      error: null,
      refetch: () => {},
    };
    mocks.useGameResultRevisions.mockReturnValue({
      data: [PENALTY_REVISION],
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    });
    mocks.useOfficializeResultRevision.mockReturnValue({ mutate: vi.fn(), isPending: false, isError: false });
    mocks.useSupersedeAndSubmitResult.mockReturnValue({
      mutate: supersedeMutate,
      isPending: false,
      isError: false,
      reset: vi.fn(),
    });
  });

  function openResubmitForm(isKnockoutFixture: boolean) {
    mocks.useTournamentGame.mockReturnValue({
      data: gameDetail({ isKnockoutFixture }),
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    });
    render(<GameResultReviewPanel gameId={GAME_ID} />);
    fireEvent.click(screen.getByRole('button', { name: '다시 제출' }));
    return screen.getByRole('dialog');
  }

  it('결선 경기의 무승부 재제출에서는 기존 승부차기 점수가 제출 payload 로 살아서 나간다', () => {
    const dialog = openResubmitForm(true);

    fireEvent.change(within(dialog).getByLabelText('재제출 사유'), { target: { value: '반려 사유 반영' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '다시 제출' }));

    expect(supersedeMutate).toHaveBeenCalledTimes(1);
    expect(supersedeMutate.mock.calls[0][0].score).toEqual({
      home: 1,
      away: 1,
      penalties: { home: 4, away: 3 },
    });
  });

  it('결선 경기에서 정규시간 승패가 갈리면 승부차기를 싣지 않고, 그 사실을 저장 전에 알린다', () => {
    const dialog = openResubmitForm(true);

    fireEvent.change(within(dialog).getByLabelText('홈 점수'), { target: { value: '2' } });
    expect(within(dialog).getByRole('status').textContent).toMatch(/승부차기 결과는 함께 지워져요/);

    fireEvent.change(within(dialog).getByLabelText('재제출 사유'), { target: { value: '정규시간 점수 정정' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '다시 제출' }));

    expect(supersedeMutate.mock.calls[0][0].score).toEqual({ home: 2, away: 1 });
  });
});
