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
  supersedeAndSubmit: { mutate: vi.fn(), isPending: false, isError: false, error: null, reset: vi.fn() } as MutationMock,
  officialize: { mutate: vi.fn(), isPending: false, isError: false, error: null, reset: vi.fn() } as MutationMock,
  voidRevision: { mutate: vi.fn(), isPending: false, isError: false, error: null, reset: vi.fn() } as MutationMock,
  createCorrection: { mutate: vi.fn(), isPending: false, isError: false, error: null, reset: vi.fn() } as MutationMock,
  // `ResultEditModal`의 참가자 실명 표시(라인업 데이터)용 -- 기본값 `data: undefined`는
  // 두 패널의 `lineupsQuery.data ?? []` 폴백을 그대로 거치므로 대부분의 테스트는
  // 빈 라인업(= 기존 id-접미어 폴백)을 보는 실제 로딩-중 상태와 동일하게 동작한다.
  lineups: { data: undefined, isPending: false, isError: false, error: null, refetch: vi.fn() } as QueryMock<unknown>,
  // 검토 패널이 근거로 읽는 경기 세부 기록(GET /games/:id/events). 기본값
  // `data: undefined`는 패널의 `?? []` 폴백을 거쳐 "기록 없음" 빈 목록이 된다.
  events: { data: undefined, isPending: false, isError: false, error: null, refetch: vi.fn() } as QueryMock<unknown>,
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

// 검토 패널이 경기 세부 기록을 읽는 훅도 같은 이유로 목한다(위 주석 참고).
vi.mock('@/hooks/use-v1-game-operations', () => ({
  useV1GameEventsBackfill: () => hookMocks.events,
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
    // 서버가 `GET /games/:gameId` 응답에 항상 싣는 필드 -- 조별(비결선)이 기본값이고,
    // 결선 경기를 다루는 테스트만 `isKnockoutFixture: true` 로 덮어쓴다.
    isKnockoutFixture: false,
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
    outcomeReason: 'NORMAL',
    outcomeNote: null,
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
  Object.assign(hookMocks.supersedeAndSubmit, freshMutationMock());
  Object.assign(hookMocks.officialize, freshMutationMock());
  Object.assign(hookMocks.voidRevision, freshMutationMock());
  Object.assign(hookMocks.createCorrection, freshMutationMock());
  Object.assign(hookMocks.lineups, freshQueryMock());
  Object.assign(hookMocks.events, freshQueryMock());
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

  it('platform_ops 는 "확인" 과 "고치고 확인" 둘을 보고, 반려·보완 요청 버튼은 없다', () => {
    hookMocks.game.data = buildGame('platform_ops');
    renderWithClient(<GameResultReviewPanel gameId="game-1" />);

    expect(screen.getByRole('button', { name: '확인' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '고치고 확인' })).toBeInTheDocument();
    // Task 166: 두 명령의 **백엔드가 사라졌다**. 버튼만 남으면 눌러서 404 를 받는다.
    expect(screen.queryByRole('button', { name: '보완 요청' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '반려' })).not.toBeInTheDocument();
  });

  it('tournament_director 도 같은 두 버튼을 본다 (검토 자체는 플래그 게이트가 아니다)', () => {
    hookMocks.game.data = buildGame('tournament_director');
    renderWithClient(<GameResultReviewPanel gameId="game-1" />);

    expect(screen.getByRole('button', { name: '확인' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '고치고 확인' })).toBeInTheDocument();
  });

  it('field_operator ("operator") sees no review actions at all, only a read-only notice', () => {
    hookMocks.game.data = buildGame('field_operator');
    renderWithClient(<GameResultReviewPanel gameId="game-1" />);

    expect(screen.queryByRole('button', { name: '확인' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '고치고 확인' })).not.toBeInTheDocument();
    expect(screen.getByText('이 화면에서는 결과를 볼 수만 있어요. 검토·확정 권한이 없어요.')).toBeInTheDocument();
  });

  it('support_readonly sees no review actions either', () => {
    hookMocks.game.data = buildGame('support_readonly');
    renderWithClient(<GameResultReviewPanel gameId="game-1" />);

    expect(screen.queryByRole('button', { name: '확인' })).not.toBeInTheDocument();
  });
});

describe('"고치고 확인" — SUBMITTED 를 그 자리에서 고쳐 대체한다 (Task 166)', () => {
  it('SUBMITTED 카드의 "고치고 확인" 이 기존 재제출 모달을 열고 supersede-and-submit 을 부른다', async () => {
    hookMocks.game.data = buildGame('platform_ops', { version: 4 });
    hookMocks.revisions.data = [
      buildRevision({ id: 'rev-1', revision: 1, state: 'SUBMITTED', score: { home: 1, away: 0 } }),
    ];
    const user = userEvent.setup();
    renderWithClient(<GameResultReviewPanel gameId="game-1" />);

    await user.click(screen.getByRole('button', { name: '고치고 확인' }));
    const dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByLabelText('재제출 사유'), '득점자 정정 반영');
    await user.click(within(dialog).getByRole('button', { name: '다시 제출' }));

    expect(hookMocks.supersedeAndSubmit.mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        revisionId: 'rev-1',
        expectedVersion: 4,
        score: { home: 1, away: 0 },
        eventsHash: 'hash-1',
        reason: '득점자 정정 반영',
      }),
      expect.any(Object),
    );
  });

  it('레거시 반려 행에서도 같은 모달로 고칠 수 있다 — 그 입구를 지우면 그 경기는 영영 못 고친다', () => {
    // Task 166 이 이 상태로 **들어가는 경로**를 없앴지만, 그 전에 반려된 행은 contract
    // 마이그레이션 전까지 남아 있다. 서버도 같은 이유로 재제출 base 허용에 이 상태를
    // 남겼다(revision-state-machine.ts).
    hookMocks.game.data = buildGame('platform_ops', { version: 4 });
    hookMocks.revisions.data = [
      buildRevision({ id: 'rev-2', revision: 2, state: 'REJECTED', supersedesId: 'rev-1', score: { home: 1, away: 0 } }),
    ];
    renderWithClient(<GameResultReviewPanel gameId="game-1" />);

    expect(screen.getByText('반려된 결과예요')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '다시 제출' })).toBeInTheDocument();
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

    await user.click(screen.getByRole('button', { name: '확인' }));

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

    await user.click(screen.getByRole('button', { name: '확인' }));
    // The mocked mutation object mutates in place rather than notifying React on
    // its own (unlike the real `useMutation`, which re-renders itself) -- force one
    // reconciliation pass so this render picks up the freshly mutated mock fields.
    view.rerender(<GameResultReviewPanel gameId="game-1" />);

    await screen.findByText(/경기 정보가 그 사이 바뀌었어요/);
    expect(screen.getByRole('button', { name: '확인' })).toBeInTheDocument();
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
    expect(screen.getByRole('button', { name: '확인' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '확인' }));
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: '확인' })).not.toBeInTheDocument(),
    );
    expect(screen.getByText(/아직 활성화되지 않았어요/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '다시 확인' }));
    expect(screen.getByRole('button', { name: '확인' })).toBeInTheDocument();
    expect(screen.queryByText(/아직 활성화되지 않았어요/)).not.toBeInTheDocument();

    hookMocks.officialize.mutate.mockImplementationOnce((_input: unknown, callbacks?: OfficializeCallbacks) => {
      callbacks?.onSuccess?.();
    });
    await user.click(screen.getByRole('button', { name: '확인' }));
    await waitFor(() => expect(hookMocks.officialize.mutate).toHaveBeenCalledTimes(2));
    expect(screen.getByRole('button', { name: '확인' })).toBeInTheDocument();

    hookMocks.officialize.mutate.mockImplementationOnce((_input: unknown, callbacks?: OfficializeCallbacks) => {
      callbacks?.onError?.({ code: 'DIRECTOR_OFFICIALIZE_DISABLED', message: 'off again' });
    });
    await user.click(screen.getByRole('button', { name: '확인' }));
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: '확인' })).not.toBeInTheDocument(),
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
          // 정정은 **이미 남아 있는 기록 전체**를 다시 실어 보내야 한다 -- 서버
          // (`tournament-result-review.service.ts` 의 `createCorrection`)는
          // `assists ?? 0`/`fouls ?? 0` 으로 채우므로, 폼이 두 필드를 빼먹으면
          // 점수만 고치는 정정 한 번에 선수 개개인의 어시스트·파울이 전부 0으로
          // 초기화된다(사용자 보고 결함). 그래서 여기서는 `objectContaining` 으로
          // 느슨하게 넘기지 않고 참가자 행을 필드 단위로 정확히 단언한다.
          actualParticipants: [
            {
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

  /**
   * 알파 실측 결함(#380)의 세 번째 증상: 정정 초안을 확정하기 직전 확인 문구가
   * "undefined:undefined로 공식 결과를 확정해요"로 떴다 -- 백필된(중첩 `regulation`
   * 형태) 리비전의 점수를 평평하게 읽었기 때문. 되돌릴 수 없는 확정 액션 직전에
   * 틀린 문구를 보여준 것과 같은 계열의 사고다.
   */
  it('정정 확정 확인 문구는 중첩(regulation) 형태로 백필된 초안이어도 실제 점수를 보여준다', async () => {
    hookMocks.game.data = buildGame('platform_ops', { version: 2, currentOfficialRevisionId: 'rev-1' });
    hookMocks.revisions.data = [
      buildRevision({ id: 'rev-1', revision: 1, state: 'OFFICIAL' }),
      buildRevision({
        id: 'rev-2',
        revision: 2,
        state: 'DRAFT',
        supersedesId: 'rev-1',
        reason: '득점 누락 정정',
        score: {
          regulation: { home: 2, away: 1 },
          penalty: null,
          goals: [],
          incomplete: false,
          provenance: 'TOURNAMENT_FIXTURE_RESULT',
        },
      }),
    ];
    const user = userEvent.setup();
    renderWithClient(<GameResultCorrectionPanel gameId="game-1" />);

    await user.click(screen.getByRole('button', { name: '정정 확정' }));

    expect(hookMocks.confirm).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('2:1로 공식 결과를 확정해요') }),
    );
    const calledMessage = hookMocks.confirm.mock.calls[0][0].message as string;
    expect(calledMessage).not.toContain('undefined');
  });
});

/**
 * BRACKET-6 — 몰수·중단으로 끝난 경기는 검토 화면과 확정 문구 양쪽에서 정상 종료와
 * 구분돼야 한다. 서버는 사유를 리비전에 저장하고 목록 API 로도 내보내는데(alpha 실측)
 * 어드민 화면이 그 값을 아예 읽지 않아, 운영자가 "0:0 결과를 공식 결과로 확정해요"만
 * 보고 되돌릴 수 없는 확정을 누르던 상태였다 — 승부차기 누락 사고와 같은 종류다.
 */
describe('몰수·중단 경기의 검토·확정', () => {
  it('검토 화면에 몰수 사유가 승인 버튼과 함께 보인다', () => {
    hookMocks.game.data = buildGame('platform_ops');
    hookMocks.revisions.data = [
      buildRevision({
        id: 'rev-1',
        revision: 1,
        state: 'SUBMITTED',
        score: { home: 0, away: 0 },
        outcomeReason: 'FORFEIT',
        outcomeNote: '원정팀 미출석',
      }),
    ];

    renderWithClient(<GameResultReviewPanel gameId="game-1" />);

    expect(screen.getByText('몰수·기권으로 종료된 경기예요. 사유: 원정팀 미출석')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '확인' })).toBeInTheDocument();
  });

  it('정상 종료 경기에는 몰수 배너가 뜨지 않는다', () => {
    hookMocks.game.data = buildGame('platform_ops');
    hookMocks.revisions.data = [buildRevision({ id: 'rev-1', revision: 1, state: 'SUBMITTED' })];

    renderWithClient(<GameResultReviewPanel gameId="game-1" />);

    expect(screen.queryByText(/종료된 경기예요/)).not.toBeInTheDocument();
  });

  /**
   * Copilot 리뷰가 잡은 결함 — 배너 소스를 `currentOfficial ?? latest` 로 고르면, 몰수로
   * 확정된 경기에 정정 리비전이 올라와 **그것을** 검토하는 동안 배너가 정정안이 아니라
   * 이전 공식 결과의 사유를 보여준다. 승인 직전에 보는 근거가 승인 대상과 달라지므로
   * 이 배너를 둔 이유 자체가 무너진다.
   */
  it('정정 리비전을 검토하는 중에는 이전 공식 결과가 아니라 검토 대상의 사유를 보여준다', () => {
    hookMocks.game.data = buildGame('platform_ops', { currentOfficialRevisionId: 'rev-1' });
    hookMocks.revisions.data = [
      // 검토 대상: 정상 종료로 되돌리는 정정안.
      buildRevision({ id: 'rev-2', revision: 2, state: 'SUBMITTED', supersedesId: 'rev-1' }),
      // 이전 공식 결과: 몰수.
      buildRevision({
        id: 'rev-1',
        revision: 1,
        state: 'OFFICIAL',
        outcomeReason: 'FORFEIT',
        outcomeNote: '원정팀 미출석',
      }),
    ];

    renderWithClient(<GameResultReviewPanel gameId="game-1" />);

    expect(screen.queryByText(/몰수·기권으로 종료된 경기예요/)).not.toBeInTheDocument();
  });

  it('검토 대기 리비전이 없으면 현재 공식 결과의 사유를 보여준다', () => {
    hookMocks.game.data = buildGame('platform_ops', { currentOfficialRevisionId: 'rev-1' });
    hookMocks.revisions.data = [
      buildRevision({
        id: 'rev-1',
        revision: 1,
        state: 'OFFICIAL',
        outcomeReason: 'FORFEIT',
        outcomeNote: '원정팀 미출석',
      }),
    ];

    renderWithClient(<GameResultReviewPanel gameId="game-1" />);

    expect(screen.getByText('몰수·기권으로 종료된 경기예요. 사유: 원정팀 미출석')).toBeInTheDocument();
  });

  it('확정 확인 문구가 몰수라는 사실을 점수와 함께 말한다', async () => {
    hookMocks.game.data = buildGame('platform_ops');
    hookMocks.revisions.data = [
      buildRevision({
        id: 'rev-1',
        revision: 1,
        state: 'SUBMITTED',
        score: { home: 0, away: 0 },
        outcomeReason: 'FORFEIT',
        outcomeNote: '원정팀 미출석',
      }),
    ];
    const user = userEvent.setup();
    renderWithClient(<GameResultReviewPanel gameId="game-1" />);

    await user.click(screen.getByRole('button', { name: '확인' }));

    const message = hookMocks.confirm.mock.calls[0][0].message as string;
    expect(message).toContain('몰수·기권');
    expect(message).toContain('0:0');
  });
});

/**
 * 결선(knockout) 무승부 사전 경고 -- 패널이 `game.isKnockoutFixture`(서버가
 * `GET /games/:gameId` 응답에 이미 싣는 필드, `games.service.ts` 의
 * `isKnockoutFixture(tx, tournamentFixtureId)`)를 정정 폼까지 내려보내야 성립한다.
 *
 * 서버는 결선 경기의 정규시간 무승부를 승부차기 없이 거부한다(409
 * `TOURNAMENT_PENALTY_REQUIRED`). 지금은 저장 버튼을 눌러야 알 수 있다.
 */
describe('결선 무승부는 저장 전에 폼이 알려준다', () => {
  it('결선 경기 정정에서 정규시간이 무승부가 되면 폼에 경고가 뜬다', async () => {
    hookMocks.game.data = buildGame('platform_ops', {
      version: 2,
      currentOfficialRevisionId: 'rev-1',
      isKnockoutFixture: true,
    });
    hookMocks.revisions.data = [
      buildRevision({ id: 'rev-1', revision: 1, state: 'OFFICIAL', score: { home: 2, away: 1 } }),
    ];
    const user = userEvent.setup();
    renderWithClient(<GameResultCorrectionPanel gameId="game-1" />);

    await user.click(screen.getByRole('button', { name: '정정 시작' }));
    const dialog = screen.getByRole('dialog');
    // 라이브 영역(`role="status"`)은 문구가 생기기 전에도 DOM 에 있어야 스크린리더가
    // 내용 변경을 읽어 준다 -- 그래서 "없음"은 노드 부재가 아니라 빈 문구로 확인한다.
    expect(within(dialog).getByRole('status').textContent).toBe('');

    fireEvent.change(within(dialog).getByLabelText('원정 점수'), { target: { value: '2' } });

    expect(within(dialog).getByRole('status')).toHaveTextContent(/승부차기/);
  });

  it('무효화된 결선 경기 재입력에서도 승부차기를 입력해 제출할 수 있다', async () => {
    hookMocks.game.data = buildGame('platform_ops', {
      version: 5,
      currentOfficialRevisionId: 'rev-2',
      isKnockoutFixture: true,
    });
    hookMocks.revisions.data = [
      buildRevision({ id: 'rev-2', revision: 2, state: 'VOID', supersedesId: 'rev-1', reason: '중복 경기로 확인' }),
      buildRevision({ id: 'rev-1', revision: 1, state: 'OFFICIAL', score: { home: 2, away: 1 } }),
    ];
    const user = userEvent.setup();
    renderWithClient(<GameResultCorrectionPanel gameId="game-1" />);

    await user.click(screen.getByRole('button', { name: '결과 다시 입력' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('원정 점수'), { target: { value: '2' } });

    expect(within(dialog).getByRole('status')).toHaveTextContent(/승부차기/);

    await user.type(within(dialog).getByLabelText('재입력 사유'), '무효 후 재입력');
    const submitButton = within(dialog).getByRole('button', { name: '결과 제출' });
    expect(submitButton).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText('홈 성공'), { target: { value: '4' } });
    fireEvent.change(within(dialog).getByLabelText('원정 성공'), { target: { value: '3' } });
    await user.click(within(dialog).getByLabelText('홈'));
    expect(submitButton).toBeEnabled();
    await user.click(submitButton);

    expect(hookMocks.createCorrection.mutate).toHaveBeenCalledTimes(1);
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
