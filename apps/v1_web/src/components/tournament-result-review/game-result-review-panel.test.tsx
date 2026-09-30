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
    periods: [{ number: 1 }, { number: 2 }],
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

  // Task 180 G6(F76) — 콘솔만 최신순이다. 검토자는 경기 흐름대로(시간순) 읽는다.
  it('경기 세부 기록은 시간순이다 — 콘솔의 최신순이 검토 화면으로 새지 않는다', () => {
    const event = (sequence: number, clockMs: number) => ({
      id: `e${sequence}`, gameId: GAME_ID, sequence, clientEventId: `c${sequence}`, payloadHash: 'h', type: 'GOAL',
      sideId: 'side-home', participantId: null, assistParticipantId: null, period: 1, clockMs,
      occurredAt: '2026-08-11T00:05:00.000Z', receivedAt: '2026-08-11T00:05:00.000Z',
      actorUserId: 'a', reversesEventId: null, payload: {},
    });
    eventsMock.state = {
      data: { events: [event(1, 1 * 60000), event(2, 7 * 60000), event(3, 13 * 60000)], lastSequence: 3, gap: null },
      isPending: false, isError: false, error: null, refetch: () => {},
    };

    render(<GameResultReviewPanel gameId={GAME_ID} />);

    const rows = within(screen.getByRole('list', { name: '기록된 이벤트 목록' })).getAllByRole('listitem');
    expect(rows.map((row) => /전반 (\d+)/.exec(row.textContent ?? '')?.[1])).toEqual(['1', '7', '13']);
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

  /**
   * **공개 화면 링크는 이 화면의 것이 아니다.** 한 번 여기 뒀다가 도달 불가로 걷어냈다 —
   * 확정 한 번에 `revisions`(링크를 띄운다)와 `board`(이 패널을 걷어낸다) 무효화가 같은
   * 콜백에서 나가, 링크의 수명이 두 refetch 사이 간격이었다.
   *
   * **이 자리에 "링크가 없다"는 단언은 두지 않는다.** 기능을 옮기면서 그 부재를 단언하는
   * 테스트를 남기면 영영 녹색인 줄이 되고, 어디서 그 기능을 재는지도 흐려진다 —
   * 실제 계약은 옮겨간 화면(`corrections-page-client.test.tsx`)이 **긍정으로** 잠근다.
   */
  it('정정 화면으로 가는 링크는 확정된 결과에 그대로 있다', () => {
    render(<GameResultReviewPanel gameId={GAME_ID} correctionsHref="/x/records/corrections" />);

    expect(screen.getByRole('link', { name: '정정 화면으로 이동' })).toHaveAttribute(
      'href',
      '/x/records/corrections',
    );
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
    // SUBMITTED 카드의 입구는 "고치고 확인" 이다 — 레거시 반려 카드("다시 제출")는
    // contract 마이그레이션과 함께 사라졌고, 열리는 모달은 같은 재제출 모달이다.
    fireEvent.click(screen.getByRole('button', { name: '고치고 확인' }));
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

// Task 180 G6(F78·F80·F81) — 운영 콘솔이 경기 종료 직후 끼우는 압축판.
describe('GameResultReviewPanel — 콘솔 확정 카드(variant="console")', () => {
  let officializeMutate: ReturnType<typeof vi.fn>;

  function setup(options: {
    actorRole?: TournamentGameDetail['actorRole'];
    revision?: Record<string, unknown>;
    revisions?: Array<Record<string, unknown>>;
    currentOfficialRevisionId?: string | null;
  } = {}) {
    officializeMutate = vi.fn();
    mocks.useTournamentGame.mockReturnValue({
      data: gameDetail({
        actorRole: options.actorRole ?? 'tournament_director',
        currentOfficialRevisionId: options.currentOfficialRevisionId ?? null,
      }),
      isPending: false,
      isError: false,
      refetch: vi.fn(async () => ({ data: gameDetail() })),
    });
    const revision = { ...FRESH_REVISION, ...options.revision };
    mocks.useGameResultRevisions.mockReturnValue({
      data: options.revisions ?? [revision],
      isPending: false,
      isError: false,
      refetch: vi.fn(async () => ({ data: options.revisions ?? [revision] })),
    });
    mocks.useSupersedeAndSubmitResult.mockReturnValue({ mutate: vi.fn(), isPending: false, isError: false });
    mocks.useOfficializeResultRevision.mockReturnValue({ mutate: officializeMutate, isPending: false, isError: false });
  }

  it('감독관에게는 스코어가 맨 위인 확정 카드와 확정 버튼이 보이고, 세부 기록·처리 이력은 없다', () => {
    setup({ actorRole: 'tournament_director' });
    render(<GameResultReviewPanel gameId={GAME_ID} variant="console" />);

    const card = screen.getByRole('region', { name: '결과 확정' });
    expect(within(card).getByText('확정 전')).toBeInTheDocument();
    expect(within(card).getByLabelText('스코어 2 : 1')).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: '2 : 1 결과 확정' })).toBeEnabled();
    expect(within(card).getByRole('button', { name: '고치고 확정' })).toBeEnabled();
    // 콘솔은 자기 이벤트 목록이 있으므로 검토 화면의 세부 기록·처리 이력을 되풀이하지 않는다.
    expect(screen.queryByText('경기 세부 기록')).toBeNull();
    expect(screen.queryByText('처리 이력')).toBeNull();
  });

  it('플랫폼 운영자에게도 확정 카드가 보인다', () => {
    setup({ actorRole: 'platform_ops' });
    render(<GameResultReviewPanel gameId={GAME_ID} variant="console" />);

    expect(screen.getByRole('button', { name: '2 : 1 결과 확정' })).toBeInTheDocument();
  });

  it.each(['field_operator', 'support_readonly'] as const)(
    '확정 권한이 없는 %s 에게는 확정 버튼 대신 제출 안내만 보인다',
    (actorRole) => {
      setup({ actorRole });
      render(<GameResultReviewPanel gameId={GAME_ID} variant="console" />);

      expect(screen.getByRole('status')).toHaveTextContent('운영자가 확인해요');
      expect(screen.queryByRole('region', { name: '결과 확정' })).toBeNull();
      expect(screen.queryByRole('button', { name: /결과 확정/ })).toBeNull();
      expect(screen.queryByRole('button', { name: '고치고 확정' })).toBeNull();
    },
  );

  it('현장 진행요원 안내는 "결과를 제출했어요"라고 말한다', () => {
    setup({ actorRole: 'field_operator' });
    render(<GameResultReviewPanel gameId={GAME_ID} variant="console" />);

    expect(screen.getByRole('status')).toHaveTextContent('결과를 제출했어요. 운영자가 확인해요.');
  });

  it('확정 버튼은 기존 확정 흐름(확인 모달 → officialize)을 그대로 탄다', async () => {
    setup({ actorRole: 'platform_ops' });
    render(<GameResultReviewPanel gameId={GAME_ID} variant="console" />);

    fireEvent.click(screen.getByRole('button', { name: '2 : 1 결과 확정' }));

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('2:1 결과를 공식 결과로 확정해요');
    expect(officializeMutate).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: '확정' }));
    await waitFor(() => expect(officializeMutate).toHaveBeenCalledTimes(1));
    expect(officializeMutate.mock.calls[0][0]).toMatchObject({ revisionId: 'revision-1', score: { home: 2, away: 1 } });
  });

  // 서버는 감독관의 확정을 `DIRECTOR_OFFICIALIZE` 플래그가 켜진 동안에만 받는다(꺼져 있으면 403).
  // 미리 읽을 방법이 없어 화면은 그 403 을 받은 뒤에야 버튼을 숨긴다 — 결과 검토 화면과 같은 규칙이다.
  it('감독관이 확정하다 플래그 꺼짐(403)을 만나면 확정 버튼을 숨기고 안내하며, "다시 확인"으로 되살린다', async () => {
    setup({ actorRole: 'tournament_director' });
    officializeMutate.mockImplementation(
      (_input: unknown, callbacks: { onError?: (error: unknown) => void }) =>
        callbacks.onError?.({ code: 'DIRECTOR_OFFICIALIZE_DISABLED' }),
    );
    render(<GameResultReviewPanel gameId={GAME_ID} variant="console" />);

    fireEvent.click(screen.getByRole('button', { name: '2 : 1 결과 확정' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '확정' }));

    expect(await screen.findByText(/결과 확정 기능이 아직 활성화되지 않았어요/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '2 : 1 결과 확정' })).toBeNull();
    // 고쳐서 다시 제출하는 길은 막지 않는다.
    expect(screen.getByRole('button', { name: '고치고 확정' })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: '다시 확인' }));
    expect(screen.getByRole('button', { name: '2 : 1 결과 확정' })).toBeInTheDocument();
    expect(screen.queryByText(/결과 확정 기능이 아직 활성화되지 않았어요/)).toBeNull();
  });

  it('플랫폼 운영자에게는 확정이 항상 열려 있다 — 감독관 게이트 안내를 만들지 않는다', () => {
    setup({ actorRole: 'platform_ops' });
    render(<GameResultReviewPanel gameId={GAME_ID} variant="console" />);

    expect(screen.getByRole('button', { name: '2 : 1 결과 확정' })).toBeEnabled();
    expect(screen.queryByText(/결과 확정 기능이 아직 활성화되지 않았어요/)).toBeNull();
  });

  it('어시스트가 비면 확정에 영향 없다는 안내를 카드 안에 보여준다', () => {
    setup({
      revision: {
        resultParticipants: [{ goals: 2, assists: 1 }, { goals: 1, assists: 0 }],
      },
    });
    render(<GameResultReviewPanel gameId={GAME_ID} variant="console" />);

    expect(within(screen.getByRole('region', { name: '결과 확정' })).getByText(/어시스트 미기입 2건/)).toBeInTheDocument();
  });

  it('공식 확정된 결과는 확정 완료 줄과 이어 갈 곳(confirmedFooter)을 보여준다 — 권한과 무관하게', () => {
    setup({
      actorRole: 'field_operator',
      currentOfficialRevisionId: 'revision-1',
      revision: { state: 'OFFICIAL' },
    });
    render(
      <GameResultReviewPanel
        gameId={GAME_ID}
        variant="console"
        confirmedFooter={<a href="/next">다음 경기로</a>}
      />,
    );

    expect(screen.getByText('2 : 1 공식 결과로 확정했어요.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '다음 경기로' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /결과 확정/ })).toBeNull();
  });

  it('확정 전에는 confirmedFooter 를 그리지 않는다', () => {
    setup({ actorRole: 'platform_ops' });
    render(
      <GameResultReviewPanel gameId={GAME_ID} variant="console" confirmedFooter={<a href="/next">다음 경기로</a>} />,
    );

    expect(screen.queryByRole('link', { name: '다음 경기로' })).toBeNull();
  });

  it('승부차기로 갈린 결과는 카드에도 승부차기 점수를 함께 보여준다', () => {
    setup({ revision: { score: { home: 1, away: 1, penalties: { home: 4, away: 3 } } } });
    render(<GameResultReviewPanel gameId={GAME_ID} variant="console" />);

    expect(within(screen.getByRole('region', { name: '결과 확정' })).getByText(/승부차기/)).toBeInTheDocument();
  });
});
