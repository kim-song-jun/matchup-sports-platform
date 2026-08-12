import { createHash } from 'node:crypto';
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  computeProjectionPreviewHash,
  type GameActorRole,
  type GameResultRevision,
  type GameResultRevisionState,
  type TournamentGameDetail,
  type TournamentGameSide,
} from '@/hooks/use-tournament-result-review';
import { GameResultReviewPanel } from '@/components/tournament-result-review/game-result-review-panel';
import { GameResultCorrectionPanel } from '@/components/tournament-result-review/game-result-correction-panel';

/**
 * Task 23 -- tournament result review / correction UI.
 *
 * These tests mock only `@/hooks/use-tournament-result-review` (the data
 * layer this lane owns) and `@/components/v1-ui/confirm-modal`'s
 * `useConfirm` (so officialize's confirm step resolves deterministically),
 * following this repo's existing convention (see
 * `apps/v1_web/src/app/admin/tournaments/[id]/tournament-detail-campaign-tab
 * .test.tsx`). `computeProjectionPreviewHash` and every type are re-exported
 * from the REAL module via `importActual`, so the projection-preview hash
 * tests below exercise the actual production algorithm, not a stub.
 */

type QueryMock<T> = {
  data: T | undefined;
  isPending: boolean;
  isError: boolean;
  error: unknown;
  refetch: ReturnType<typeof vi.fn>;
};

type MutationMock = {
  mutate: ReturnType<typeof vi.fn>;
  isPending: boolean;
  isError: boolean;
  error: unknown;
  reset: ReturnType<typeof vi.fn>;
};

function freshQueryMock<T>(): QueryMock<T> {
  return { data: undefined, isPending: false, isError: false, error: null, refetch: vi.fn() };
}

function freshMutationMock(): MutationMock {
  return { mutate: vi.fn(), isPending: false, isError: false, error: null, reset: vi.fn() };
}

const hookMocks = vi.hoisted(() => ({
  game: { data: undefined, isPending: false, isError: false, error: null, refetch: vi.fn() } as QueryMock<unknown>,
  revisions: { data: undefined, isPending: false, isError: false, error: null, refetch: vi.fn() } as QueryMock<unknown>,
  reviewDecision: { mutate: vi.fn(), isPending: false, isError: false, error: null, reset: vi.fn() } as MutationMock,
  supersedeAndSubmit: { mutate: vi.fn(), isPending: false, isError: false, error: null, reset: vi.fn() } as MutationMock,
  officialize: { mutate: vi.fn(), isPending: false, isError: false, error: null, reset: vi.fn() } as MutationMock,
  voidRevision: { mutate: vi.fn(), isPending: false, isError: false, error: null, reset: vi.fn() } as MutationMock,
  createCorrection: { mutate: vi.fn(), isPending: false, isError: false, error: null, reset: vi.fn() } as MutationMock,
  // `ResultEditModal`의 참가자 실명 표시(라인업 데이터)용 -- 기본값 `data: undefined`는
  // 두 패널의 `lineupsQuery.data ?? []` 폴백을 그대로 거치므로 대부분의 테스트는
  // 빈 라인업(= 기존 id-접미어 폴백)을 보는 실제 로딩-중 상태와 동일하게 동작한다.
  lineups: { data: undefined, isPending: false, isError: false, error: null, refetch: vi.fn() } as QueryMock<unknown>,
  confirm: vi.fn(),
}));

vi.mock('@/hooks/use-tournament-result-review', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/use-tournament-result-review')>(
    '@/hooks/use-tournament-result-review',
  );
  return {
    ...actual,
    useTournamentGame: () => hookMocks.game,
    useGameResultRevisions: () => hookMocks.revisions,
    useReviewResultDecision: () => hookMocks.reviewDecision,
    useSupersedeAndSubmitResult: () => hookMocks.supersedeAndSubmit,
    useOfficializeResultRevision: () => hookMocks.officialize,
    useVoidResultRevision: () => hookMocks.voidRevision,
    useCreateResultCorrection: () => hookMocks.createCorrection,
  };
});

// 두 패널이 참가자 실명 표시용으로 새로 호출하는 `useV1GameLineups`도 목한다 --
// 안 그러면 이 모듈의 진짜 `useQuery`가 실행되면서 아래 `renderWithClient`가
// 기대하는 "QueryClientProvider 불필요" 전제가 깨진다.
vi.mock('@/hooks/use-v1-api', () => ({
  useV1GameLineups: () => hookMocks.lineups,
}));

vi.mock('@/components/v1-ui/confirm-modal', () => ({
  useConfirm: () => ({ confirm: hookMocks.confirm, ConfirmModal: null }),
}));

const SIDES: TournamentGameSide[] = [
  { id: 'side-home', gameId: 'game-1', sideKey: 'HOME', teamId: 'team-home', displayNameSnapshot: '홈팀' },
  { id: 'side-away', gameId: 'game-1', sideKey: 'AWAY', teamId: 'team-away', displayNameSnapshot: '원정팀' },
];

function buildGame(actorRole: GameActorRole, overrides?: Partial<TournamentGameDetail>): TournamentGameDetail {
  return {
    id: 'game-1',
    sourceType: 'TOURNAMENT_FIXTURE',
    state: 'ENDED',
    version: 3,
    lastSequence: 10,
    competitionConfigVersionId: 'config-1',
    currentOfficialRevisionId: null,
    sides: SIDES,
    actorRole,
    ...overrides,
  };
}

function buildRevision(
  overrides: Partial<GameResultRevision> & { id: string; revision: number; state: GameResultRevisionState },
): GameResultRevision {
  return {
    gameId: 'game-1',
    score: { home: 2, away: 1 },
    eventsHash: 'hash-1',
    missingScorer: false,
    mvpParticipantId: null,
    reason: null,
    createdByActorType: 'SYSTEM',
    createdByUserId: null,
    createdBySystemActor: 'GAME_END_DERIVER',
    supersedesId: null,
    submittedAt: '2026-08-01T10:00:00.000Z',
    officialAt: null,
    createdAt: '2026-08-01T10:00:00.000Z',
    updatedAt: '2026-08-01T10:00:00.000Z',
    resultParticipants: [
      {
        id: 'rp-1',
        resultRevisionId: overrides.id,
        participantId: 'participant-aaaaaa111111',
        sideId: 'side-home',
        started: true,
        minutesPlayed: 90,
        goals: 2,
        assists: 1,
        fouls: 0,
        cards: { yellow: 0, red: 0 },
        goalkeeper: false,
      },
    ],
    ...overrides,
  };
}

// No `QueryClientProvider` needed: `@/hooks/use-tournament-result-review` and
// `@/hooks/use-v1-api` are entirely mocked above (real `useQuery`/`useMutation`
// never run), so there is no react-query context to satisfy.
function renderWithClient(ui: React.ReactElement) {
  return render(ui);
}

beforeEach(() => {
  vi.resetAllMocks();
  Object.assign(hookMocks.game, freshQueryMock());
  Object.assign(hookMocks.revisions, freshQueryMock());
  Object.assign(hookMocks.reviewDecision, freshMutationMock());
  Object.assign(hookMocks.supersedeAndSubmit, freshMutationMock());
  Object.assign(hookMocks.officialize, freshMutationMock());
  Object.assign(hookMocks.voidRevision, freshMutationMock());
  Object.assign(hookMocks.createCorrection, freshMutationMock());
  Object.assign(hookMocks.lineups, freshQueryMock());
  // alpha 실사고(2026-08) 수정: `GameResultReviewPanel.handleOfficialize`가
  // 확인 모달을 띄우기 전 `revisionsQuery.refetch()`/`gameQuery.refetch()`를
  // 강제로 호출해 그 응답값을 쓴다(캐시된 stale 점수를 보여주지 않기 위함).
  // 실제 react-query의 `refetch()`는 항상 `{ data, ... }` 형태로 resolve
  // 되므로, 이 목도 매 호출 시점의 `hookMocks.*.data`(각 테스트가 미리
  // 세팅한 값)를 그대로 읽어 동일하게 흉내 낸다 — 정적 스냅숏이 아니라
  // 클로저로 매번 최신값을 읽어야 각 테스트가 `beforeEach` 이후에 설정한
  // `data`를 반영한다.
  hookMocks.game.refetch.mockImplementation(async () => ({ data: hookMocks.game.data }));
  hookMocks.revisions.refetch.mockImplementation(async () => ({ data: hookMocks.revisions.data }));
  hookMocks.confirm.mockResolvedValue(true);
});

describe('computeProjectionPreviewHash', () => {
  it('matches the server canonicalize()+SHA-256(JSON.stringify) algorithm', async () => {
    const expectedJson = JSON.stringify({
      eventsHash: 'abc',
      mvpParticipantId: null,
      score: { away: 1, home: 2 },
    });
    const expected = createHash('sha256').update(expectedJson).digest('hex');

    const actual = await computeProjectionPreviewHash({
      score: { home: 2, away: 1 },
      eventsHash: 'abc',
      mvpParticipantId: null,
    });

    expect(actual).toBe(expected);
  });

  it('is independent of source object key order (proves canonicalization runs, not raw JSON.stringify)', async () => {
    const a = await computeProjectionPreviewHash({
      score: { home: 2, away: 1, penalties: { home: 4, away: 3 } },
      eventsHash: 'x',
      mvpParticipantId: 'participant-1',
    });
    const b = await computeProjectionPreviewHash({
      mvpParticipantId: 'participant-1',
      eventsHash: 'x',
      score: { penalties: { away: 3, home: 4 }, away: 1, home: 2 },
    });
    expect(a).toBe(b);
  });

  it('changes when the score actually changes', async () => {
    const a = await computeProjectionPreviewHash({ score: { home: 2, away: 1 }, eventsHash: 'x', mvpParticipantId: null });
    const b = await computeProjectionPreviewHash({ score: { home: 3, away: 1 }, eventsHash: 'x', mvpParticipantId: null });
    expect(a).not.toBe(b);
  });
});

describe('actor visibility on a submitted revision (platform_ops / director / operator)', () => {
  beforeEach(() => {
    hookMocks.revisions.data = [buildRevision({ id: 'rev-1', revision: 1, state: 'SUBMITTED' })];
  });

  it('platform_ops sees officialize (approve), request-supplement, and reject', () => {
    hookMocks.game.data = buildGame('platform_ops');
    renderWithClient(<GameResultReviewPanel gameId="game-1" />);

    expect(screen.getByRole('button', { name: '결과 승인(확정)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '보완 요청' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '반려' })).toBeInTheDocument();
  });

  it('tournament_director also sees officialize/reject/request-supplement (review itself is not flag-gated)', () => {
    hookMocks.game.data = buildGame('tournament_director');
    renderWithClient(<GameResultReviewPanel gameId="game-1" />);

    expect(screen.getByRole('button', { name: '결과 승인(확정)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '보완 요청' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '반려' })).toBeInTheDocument();
  });

  it('field_operator ("operator") sees no review actions at all, only a read-only notice', () => {
    hookMocks.game.data = buildGame('field_operator');
    renderWithClient(<GameResultReviewPanel gameId="game-1" />);

    expect(screen.queryByRole('button', { name: '결과 승인(확정)' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '보완 요청' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '반려' })).not.toBeInTheDocument();
    expect(screen.getByText('이 화면에서는 결과를 볼 수만 있어요. 검토·확정 권한이 없어요.')).toBeInTheDocument();
  });

  it('support_readonly sees no review actions either', () => {
    hookMocks.game.data = buildGame('support_readonly');
    renderWithClient(<GameResultReviewPanel gameId="game-1" />);

    expect(screen.queryByRole('button', { name: '결과 승인(확정)' })).not.toBeInTheDocument();
  });
});

describe('reject / request_supplement always require a captured reason', () => {
  beforeEach(() => {
    hookMocks.game.data = buildGame('platform_ops');
    hookMocks.revisions.data = [buildRevision({ id: 'rev-1', revision: 1, state: 'SUBMITTED' })];
  });

  it('reject opens a confirmation that captures a reason before calling review-decision', async () => {
    const user = userEvent.setup();
    renderWithClient(<GameResultReviewPanel gameId="game-1" />);

    await user.click(screen.getByRole('button', { name: '반려' }));
    const dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByLabelText('반려/보완 사유'), '오심으로 확인됨');
    await user.click(within(dialog).getByRole('button', { name: '반려' }));

    expect(hookMocks.reviewDecision.mutate).toHaveBeenCalledWith(
      { revisionId: 'rev-1', expectedVersion: 3, decision: 'reject', reason: '오심으로 확인됨' },
      expect.any(Object),
    );
  });

  it('the reject confirm button stays disabled until a reason is typed', async () => {
    const user = userEvent.setup();
    renderWithClient(<GameResultReviewPanel gameId="game-1" />);

    await user.click(screen.getByRole('button', { name: '반려' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('button', { name: '반려' })).toBeDisabled();

    await user.type(within(dialog).getByLabelText('반려/보완 사유'), '사유');
    expect(within(dialog).getByRole('button', { name: '반려' })).toBeEnabled();
  });

  it('request_supplement calls review-decision with decision=request_supplement', async () => {
    const user = userEvent.setup();
    renderWithClient(<GameResultReviewPanel gameId="game-1" />);

    await user.click(screen.getByRole('button', { name: '보완 요청' }));
    const dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByLabelText('반려/보완 사유'), '득점자 확인 필요');
    await user.click(within(dialog).getByRole('button', { name: '보완 요청' }));

    expect(hookMocks.reviewDecision.mutate).toHaveBeenCalledWith(
      { revisionId: 'rev-1', expectedVersion: 3, decision: 'request_supplement', reason: '득점자 확인 필요' },
      expect.any(Object),
    );
  });

  it('surfaces a mapped STAFF_SCOPE_DENIED message when a permission was revoked mid-session', async () => {
    hookMocks.reviewDecision.isError = true;
    hookMocks.reviewDecision.error = { code: 'STAFF_SCOPE_DENIED', message: 'raw' };
    const user = userEvent.setup();
    renderWithClient(<GameResultReviewPanel gameId="game-1" />);

    await user.click(screen.getByRole('button', { name: '반려' }));
    const dialog = screen.getByRole('dialog');
    expect(
      within(dialog).getByText('이 대회의 담당자 권한이 없어졌거나 만료됐어요. 새로고침 후 다시 시도해 주세요.'),
    ).toBeInTheDocument();
  });
});

describe('resubmit after reject/supplement_requested (supersede-and-submit)', () => {
  it('resubmits the rejected revision content by default and calls supersede-and-submit', async () => {
    hookMocks.game.data = buildGame('platform_ops', { version: 4 });
    hookMocks.revisions.data = [
      buildRevision({ id: 'rev-2', revision: 2, state: 'REJECTED', supersedesId: 'rev-1', score: { home: 1, away: 0 } }),
    ];
    const user = userEvent.setup();
    renderWithClient(<GameResultReviewPanel gameId="game-1" />);

    await user.click(screen.getByRole('button', { name: '다시 제출' }));
    const dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByLabelText('재제출 사유'), '득점자 정정 반영');
    await user.click(within(dialog).getByRole('button', { name: '다시 제출' }));

    expect(hookMocks.supersedeAndSubmit.mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        revisionId: 'rev-2',
        expectedVersion: 4,
        score: { home: 1, away: 0 },
        eventsHash: 'hash-1',
        reason: '득점자 정정 반영',
      }),
      expect.any(Object),
    );
  });
});

describe('officialize (approve) always available to platform_ops', () => {
  it('officializes a submitted revision using its exact score/eventsHash/mvpParticipantId', async () => {
    hookMocks.game.data = buildGame('platform_ops', { version: 5 });
    hookMocks.revisions.data = [
      buildRevision({
        id: 'rev-1',
        revision: 1,
        state: 'SUBMITTED',
        mvpParticipantId: 'participant-aaaaaa111111',
      }),
    ];
    const user = userEvent.setup();
    renderWithClient(<GameResultReviewPanel gameId="game-1" />);

    await user.click(screen.getByRole('button', { name: '결과 승인(확정)' }));

    await waitFor(() => expect(hookMocks.officialize.mutate).toHaveBeenCalledTimes(1));
    expect(hookMocks.officialize.mutate).toHaveBeenCalledWith(
      {
        revisionId: 'rev-1',
        expectedVersion: 5,
        score: { home: 2, away: 1 },
        eventsHash: 'hash-1',
        mvpParticipantId: 'participant-aaaaaa111111',
      },
      expect.any(Object),
    );
  });

  it('a non-gate officialize failure (e.g. VERSION_CONFLICT) stays retryable and never hides the CTA, even for a director', async () => {
    hookMocks.game.data = buildGame('tournament_director', { version: 5 });
    hookMocks.revisions.data = [buildRevision({ id: 'rev-1', revision: 1, state: 'SUBMITTED' })];
    hookMocks.officialize.mutate.mockImplementationOnce(
      (_input: unknown, callbacks?: { onError?: (e: unknown) => void }) => {
        hookMocks.officialize.isError = true;
        hookMocks.officialize.error = { code: 'VERSION_CONFLICT', message: 'stale' };
        callbacks?.onError?.({ code: 'VERSION_CONFLICT', message: 'stale' });
      },
    );
    const user = userEvent.setup();
    const view = renderWithClient(<GameResultReviewPanel gameId="game-1" />);

    await user.click(screen.getByRole('button', { name: '결과 승인(확정)' }));
    // The mocked mutation object mutates in place rather than notifying React on
    // its own (unlike the real `useMutation`, which re-renders itself) -- force one
    // reconciliation pass so this render picks up the freshly mutated mock fields.
    view.rerender(<GameResultReviewPanel gameId="game-1" />);

    await screen.findByText(/경기 정보가 그 사이 바뀌었어요/);
    expect(screen.getByRole('button', { name: '결과 승인(확정)' })).toBeInTheDocument();
    expect(screen.queryByText(/아직 활성화되지 않았어요/)).not.toBeInTheDocument();
  });
});

describe('director officialize/void visibility follows the DIRECTOR_OFFICIALIZE flag, driven reactively by real 403s', () => {
  it('hides after a DIRECTOR_OFFICIALIZE_DISABLED denial, reappears on retry, succeeds once enabled, then hides again after a later rollback', async () => {
    hookMocks.game.data = buildGame('tournament_director', { version: 7 });
    hookMocks.revisions.data = [buildRevision({ id: 'rev-1', revision: 1, state: 'SUBMITTED' })];
    const user = userEvent.setup();

    type OfficializeCallbacks = { onSuccess?: () => void; onError?: (error: unknown) => void };
    hookMocks.officialize.mutate.mockImplementationOnce((_input: unknown, callbacks?: OfficializeCallbacks) => {
      callbacks?.onError?.({ code: 'DIRECTOR_OFFICIALIZE_DISABLED', message: 'off' });
    });

    renderWithClient(<GameResultReviewPanel gameId="game-1" />);
    expect(screen.getByRole('button', { name: '결과 승인(확정)' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '결과 승인(확정)' }));
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: '결과 승인(확정)' })).not.toBeInTheDocument(),
    );
    expect(screen.getByText(/아직 활성화되지 않았어요/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '다시 확인' }));
    expect(screen.getByRole('button', { name: '결과 승인(확정)' })).toBeInTheDocument();
    expect(screen.queryByText(/아직 활성화되지 않았어요/)).not.toBeInTheDocument();

    hookMocks.officialize.mutate.mockImplementationOnce((_input: unknown, callbacks?: OfficializeCallbacks) => {
      callbacks?.onSuccess?.();
    });
    await user.click(screen.getByRole('button', { name: '결과 승인(확정)' }));
    await waitFor(() => expect(hookMocks.officialize.mutate).toHaveBeenCalledTimes(2));
    expect(screen.getByRole('button', { name: '결과 승인(확정)' })).toBeInTheDocument();

    hookMocks.officialize.mutate.mockImplementationOnce((_input: unknown, callbacks?: OfficializeCallbacks) => {
      callbacks?.onError?.({ code: 'DIRECTOR_OFFICIALIZE_DISABLED', message: 'off again' });
    });
    await user.click(screen.getByRole('button', { name: '결과 승인(확정)' }));
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: '결과 승인(확정)' })).not.toBeInTheDocument(),
    );
    expect(screen.getByText(/아직 활성화되지 않았어요/)).toBeInTheDocument();
  });
});

describe('void -- retiring the current official result', () => {
  it('platform_ops voids the current official revision with a captured reason', async () => {
    hookMocks.game.data = buildGame('platform_ops', { version: 4, currentOfficialRevisionId: 'rev-1' });
    hookMocks.revisions.data = [buildRevision({ id: 'rev-1', revision: 1, state: 'OFFICIAL', officialAt: '2026-08-01T12:00:00.000Z' })];
    const user = userEvent.setup();
    renderWithClient(<GameResultCorrectionPanel gameId="game-1" />);

    await user.click(screen.getByRole('button', { name: '무효화' }));
    const dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByLabelText('무효화 사유'), '중복 경기로 확인');
    await user.click(within(dialog).getByRole('button', { name: '무효화' }));

    expect(hookMocks.voidRevision.mutate).toHaveBeenCalledWith(
      { revisionId: 'rev-1', expectedVersion: 4, reason: '중복 경기로 확인' },
      expect.any(Object),
    );
  });

  it('a director void denial hides BOTH void and officialize-correction CTAs (they share one gate state), and "다시 확인" brings void back', async () => {
    hookMocks.game.data = buildGame('tournament_director', { version: 4, currentOfficialRevisionId: 'rev-1' });
    hookMocks.revisions.data = [buildRevision({ id: 'rev-1', revision: 1, state: 'OFFICIAL' })];
    const user = userEvent.setup();
    renderWithClient(<GameResultCorrectionPanel gameId="game-1" />);

    expect(screen.getByRole('button', { name: '무효화' })).toBeInTheDocument();

    hookMocks.voidRevision.mutate.mockImplementationOnce(
      (_input: unknown, callbacks?: { onError?: (error: unknown) => void }) => {
        hookMocks.voidRevision.isError = true;
        hookMocks.voidRevision.error = { code: 'DIRECTOR_OFFICIALIZE_DISABLED', message: 'off' };
        callbacks?.onError?.({ code: 'DIRECTOR_OFFICIALIZE_DISABLED', message: 'off' });
      },
    );
    await user.click(screen.getByRole('button', { name: '무효화' }));
    const dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByLabelText('무효화 사유'), '중복 경기로 확인');
    await user.click(within(dialog).getByRole('button', { name: '무효화' }));

    // The gate flip is a real component setState (inside onError), so this re-render picks up
    // the (now mutated) mocked isError/error above -- the modal shows the mapped message and the
    // user dismisses it themselves; only after that does the trigger's own hidden state matter.
    await within(dialog).findByText(/아직 활성화되지 않았어요/);
    await user.click(within(dialog).getByRole('button', { name: '취소' }));

    expect(screen.queryByRole('button', { name: '무효화' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '정정 시작' })).toBeInTheDocument();
    expect(screen.getByText(/아직 활성화되지 않았어요/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '다시 확인' }));
    expect(screen.getByRole('button', { name: '무효화' })).toBeInTheDocument();
  });
});

describe('correction -- create against the current official revision, always capturing reason + diff', () => {
  it('captures a reason and a score diff before creating a correction draft', async () => {
    hookMocks.game.data = buildGame('tournament_director', { version: 2, currentOfficialRevisionId: 'rev-1' });
    hookMocks.revisions.data = [buildRevision({ id: 'rev-1', revision: 1, state: 'OFFICIAL', score: { home: 1, away: 1 } })];
    const user = userEvent.setup();
    renderWithClient(<GameResultCorrectionPanel gameId="game-1" />);

    await user.click(screen.getByRole('button', { name: '정정 시작' }));
    const dialog = screen.getByRole('dialog');
    const homeInput = within(dialog).getByLabelText('홈 점수');
    fireEvent.change(homeInput, { target: { value: '2' } });
    expect(within(dialog).getByText('점수 변경: 1:1 → 2:1')).toBeInTheDocument();

    await user.type(within(dialog).getByLabelText('정정 사유'), '득점 누락 정정');
    await user.click(within(dialog).getByRole('button', { name: '정정 제출' }));

    expect(hookMocks.createCorrection.mutate).toHaveBeenCalledWith(
      {
        expectedVersion: 2,
        baseRevisionId: 'rev-1',
        reason: '득점 누락 정정',
        changes: expect.objectContaining({
          score: { home: 2, away: 1 },
          eventsHash: 'hash-1',
        }),
      },
      expect.any(Object),
    );
  });

  it('the correction confirm button stays disabled until a reason is entered', async () => {
    hookMocks.game.data = buildGame('platform_ops', { version: 2, currentOfficialRevisionId: 'rev-1' });
    hookMocks.revisions.data = [buildRevision({ id: 'rev-1', revision: 1, state: 'OFFICIAL' })];
    const user = userEvent.setup();
    renderWithClient(<GameResultCorrectionPanel gameId="game-1" />);

    await user.click(screen.getByRole('button', { name: '정정 시작' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('button', { name: '정정 제출' })).toBeDisabled();
  });

  it('shows a pending correction draft with a confirm CTA instead of "start correction" once one exists', () => {
    hookMocks.game.data = buildGame('platform_ops', { version: 2, currentOfficialRevisionId: 'rev-1' });
    hookMocks.revisions.data = [
      buildRevision({ id: 'rev-1', revision: 1, state: 'OFFICIAL' }),
      buildRevision({ id: 'rev-2', revision: 2, state: 'DRAFT', supersedesId: 'rev-1', reason: '득점 누락 정정' }),
    ];
    renderWithClient(<GameResultCorrectionPanel gameId="game-1" />);

    expect(screen.getByText('정정 초안이 대기 중이에요')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '정정 확정' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '정정 시작' })).not.toBeInTheDocument();
  });
});

describe('correction/void unavailable without an official result', () => {
  it('shows an explanatory notice when no official revision exists yet', () => {
    hookMocks.game.data = buildGame('platform_ops');
    hookMocks.revisions.data = [];
    renderWithClient(<GameResultCorrectionPanel gameId="game-1" />);

    expect(screen.getByText('공식 확정된 결과가 없어서 정정할 수 없어요.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '정정 시작' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '무효화' })).not.toBeInTheDocument();
  });
});

describe('re-entry offered once the official result was just voided', () => {
  it('offers "결과 다시 입력" and hides correction/void CTAs when currentOfficialRevisionId now points at the VOID revision', () => {
    // Mirrors exactly what `invalidateGame` refetches right after a
    // successful void: `game.currentOfficialRevisionId` now points at the
    // freshly-created VOID revision (`rev-2`), which supersedes the prior
    // OFFICIAL revision (`rev-1`) still sitting in the revisions list.
    hookMocks.game.data = buildGame('platform_ops', { version: 5, currentOfficialRevisionId: 'rev-2' });
    hookMocks.revisions.data = [
      buildRevision({ id: 'rev-2', revision: 2, state: 'VOID', supersedesId: 'rev-1', reason: '중복 경기로 확인' }),
      buildRevision({ id: 'rev-1', revision: 1, state: 'OFFICIAL' }),
    ];
    renderWithClient(<GameResultCorrectionPanel gameId="game-1" />);

    // 무효 이후에는 '정정 시작'/'무효화' 대신 재입력 CTA 하나만 떠야 해요:
    // 서버는 VOID 리비전을 base 로 한 새 DRAFT(VOID_REENTRY)만 받고,
    // 무효 리비전을 다시 무효화하는 건 여전히 409 예요.
    expect(screen.queryByRole('button', { name: '정정 시작' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '무효화' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '결과 다시 입력' })).toBeInTheDocument();

    // 배너는 무효 사실과 다음 행동(재입력)을 함께 안내해요.
    expect(
      screen.getByText(/공식 결과가 무효 처리됐어요\. 아래에서 결과를 다시 입력하면 새 공식 결과로 확정할 수 있어요\./),
    ).toBeInTheDocument();

    // The header must render the void badge, not the void revision's score
    // as a plain "confirmed" number. Reverted code passes a pre-formatted
    // score label straight through, so the header would show a `tab-num`
    // score instead -- leaving only ONE "무효 처리됨" text node (the
    // RevisionTimeline entry) instead of two (header badge + timeline entry).
    expect(screen.getAllByText('무효 처리됨')).toHaveLength(2);
  });
});
