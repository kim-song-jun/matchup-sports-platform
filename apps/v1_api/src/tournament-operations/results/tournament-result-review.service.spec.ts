import { HttpException } from '@nestjs/common';
import { V1GameEventType, V1GameResultRevisionState, V1GameSourceType } from '@prisma/client';
import type { OperationAuditWriterService } from '../../common/audit/operation-audit-writer.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { TournamentStaffAccessService } from '../../tournaments/staff/tournament-staff-access.service';
import type { V1AuthUser } from '../../auth/v1-auth-user';
import { TournamentResultReviewService } from './tournament-result-review.service';

/**
 * `TournamentResultReviewService`의 정정(correction) 레인 서버측 계약.
 *
 * ## 이 파일이 새로 생긴 이유
 *
 * 이 서비스에는 **유닛 스펙이 한 개도 없었다**. 정정 레인이 정본 종료(`end`)
 * 레인의 가드를 하나도 복제하지 않은 채 1년 가까이 살아 있었던 것도 그
 * 때문이다. 사용자 보고("대회 경기 기록을 **수정**할 때 이미 남아 있는 기록까지
 * 봤어야 하는데 연결이 안 돼서 선수 개개인 기록이 정확히 남지 않는다")의
 * 서버측 원인 4건이 전부 이 레인에 있다.
 *
 * ## 왜 통합테스트가 아니라 유닛인가
 *
 * 기존 통합 스펙들은 실제 Postgres를 요구하고(`DATABASE_URL`), 서비스 메서드를
 * 직접 호출한다. 그건 브래킷 POISONED까지 끝까지 재현하는 데는 옳지만,
 * "정정 한 건이 어떤 행을 어떤 값으로 쓰는가"를 좁게 못박기엔 무겁고 CI에서만
 * 돌 수 있다. 이 파일은 트랜잭션을 in-memory 더블로 대체해 DB 없이 같은 계약을
 * 검증한다.
 *
 * ## 이 더블이 "가짜 테스트"가 아님을 어떻게 아는가
 *
 * 각 결함 케이스마다 **통과해야 하는 짝(정상 정정)**을 같은 하네스로 함께
 * 돌린다. 정상 정정이 초록이면 더블·픽스처·멱등키·버전 CAS·supersession
 * 계약이 모두 옳다는 뜻이므로, 나머지 빨강은 하네스 결함이 아니라 제품 결함
 * 이다. 더블은 서비스가 실제로 호출하는 Prisma 접근자만 제공하고, 서비스가
 * 무엇을 쓰는지는 전혀 흉내내지 않는다 — 단언은 전부 서비스가 만든 값
 * (`missingScorer`, 생성된 참가자 행, 던진 예외)에 대해서만 한다.
 */

const ids = {
  user: '7c1d0000-0000-4000-8000-000000000001',
  game: '7c1d0000-0000-4000-8000-000000000010',
  fixture: '7c1d0000-0000-4000-8000-000000000011',
  tournament: '7c1d0000-0000-4000-8000-000000000012',
  homeSide: '7c1d0000-0000-4000-8000-000000000020',
  awaySide: '7c1d0000-0000-4000-8000-000000000021',
  homePlayer: '7c1d0000-0000-4000-8000-000000000030',
  awayPlayer: '7c1d0000-0000-4000-8000-000000000031',
  /** 다른 경기의 참가자 — 이 경기의 정정에 등장할 수 없어야 한다. */
  foreignPlayer: '7c1d0000-0000-4000-8000-00000000003f',
  baseRevision: '7c1d0000-0000-4000-8000-000000000040',
  edge: '7c1d0000-0000-4000-8000-000000000050',
} as const;

const authUser: V1AuthUser = {
  id: ids.user,
  email: 'correction-guards@example.test',
  accountStatus: 'active',
  onboardingStatus: 'completed',
};

const GAME_VERSION = 7;

type CreatedRevision = {
  id: string;
  revision: number;
  state: V1GameResultRevisionState;
  score: unknown;
  goalEvents: unknown;
  missingScorer: boolean;
  eventsHash: string;
  outcomeReason: unknown;
  outcomeNote: unknown;
};

type CreatedParticipant = { participantId: string; sideId: string; goals: number };

type HarnessOptions = {
  /** 'group' = 조별리그, 'semi' = 결선. 승부차기 가드의 단일 판정 기준. */
  readonly phase?: 'group' | 'semi';
  /** 다음 라운드로 가는 진출 엣지가 있는가. */
  readonly hasAdvancementEdge?: boolean;
  /** GOAL 이벤트에 득점자가 붙어 있는가. `false`면 missingScorer=true여야 한다. */
  readonly goalHasScorer?: boolean;
  /**
   * base 리비전에 저장돼 있는 score. 정정 폼은 평평한 `{home, away}`만 보내므로
   * 서버가 여기서 승부차기를 승계해야 한다 — 그 계약을 검증하기 위한 노브다.
   */
  readonly baseScore?: unknown;
  /**
   * base 리비전에 붙어 있는 `v1_game_result_participants` 행 수. 빈
   * `actualParticipants` 가드는 이 값이 0보다 클 때만 거부해야 한다(0행으로
   * 정당하게 만들어진 경기의 정정을 막지 않기 위해).
   */
  readonly baseParticipantCount?: number;
  /** base 리비전의 state. 재제출(supersede) 레인은 REJECTED base를 요구한다. */
  readonly baseState?: V1GameResultRevisionState;
  /**
   * base 리비전의 몰수·중단 표식. 정정·재제출·무효 세 레인 모두 base에서
   * 새 리비전으로 그대로 승계해야 한다 — 안 하면 기본값 NORMAL로 떨어져
   * 몰수로 끝난 경기가 정정 한 번에 정상 종료로 둔갑한다.
   */
  readonly baseOutcomeReason?: string;
  readonly baseOutcomeNote?: string | null;
  /**
   * away 진영 GOAL 이벤트를 하나 더 둔다(= 이벤트 스트림이 1-1). 재제출 레인은
   * `validateGameResultInvariants`의 score↔이벤트 교차검증을 함께 통과해야
   * 하므로, 1-1 무승부 재제출을 검증하려면 이벤트도 1-1이어야 한다.
   */
  readonly awayGoalEvent?: boolean;
};

type Harness = {
  readonly service: TournamentResultReviewService;
  readonly createdRevisions: CreatedRevision[];
  readonly createdParticipants: CreatedParticipant[];
  readonly correct: (changes: Record<string, unknown>) => Promise<unknown>;
  /** 재제출 레인. 정정과 같은 가드를 통과해야 한다. */
  readonly supersede: (body: Record<string, unknown>) => Promise<unknown>;
  /** 무효(void) 레인. */
  readonly voidRevision: () => Promise<unknown>;
};

/** 이 경기의 정상 참가자 두 명 — 정상 정정 본문의 기본값. */
const validParticipants = [
  {
    participantId: ids.homePlayer,
    sideId: ids.homeSide,
    started: true,
    goals: 1,
    cards: { yellow: 0, red: 0 },
    goalkeeper: false,
  },
  {
    participantId: ids.awayPlayer,
    sideId: ids.awaySide,
    started: true,
    goals: 0,
    cards: { yellow: 0, red: 0 },
    goalkeeper: false,
  },
] as const;

function createHarness(options: HarnessOptions = {}): Harness {
  const phase = options.phase ?? 'group';
  const hasAdvancementEdge = options.hasAdvancementEdge ?? false;
  const goalHasScorer = options.goalHasScorer ?? true;

  const createdRevisions: CreatedRevision[] = [];
  const createdParticipants: CreatedParticipant[] = [];

  const advancementEdges = hasAdvancementEdge
    ? [{ id: ids.edge, sourceFixtureId: ids.fixture, targetFixtureId: ids.edge, sourceOutcome: 'WINNER' }]
    : [];

  // `readKnockoutFixtureFacts`는 phase와 진출 엣지 수를 **한 번의 findUnique**로
  // 읽는다(잠금 보유 시간 때문에 왕복을 늘리지 않는다). 그래서 이 더블은 같은
  // 행에 `_count.advancementSources`를 함께 실어야 한다.
  const fixtureRow = {
    id: ids.fixture,
    tournamentId: ids.tournament,
    group: { phase },
    _count: { advancementSources: advancementEdges.length },
  };

  const baseRevisionRow = {
    id: ids.baseRevision,
    gameId: ids.game,
    revision: 1,
    state: options.baseState ?? V1GameResultRevisionState.OFFICIAL,
    score: options.baseScore ?? { home: 1, away: 0 },
    goalEvents: null,
    eventsHash: 'b'.repeat(64),
    mvpParticipantId: null,
    outcomeReason: options.baseOutcomeReason ?? 'NORMAL',
    outcomeNote: options.baseOutcomeNote ?? null,
  };

  const noop = async () => [] as unknown[];

  const tx = {
    // 태그드 템플릿으로 호출되는 행 잠금들. 더블에서는 잠글 것이 없다.
    $queryRaw: noop,
    $executeRaw: noop,
    v1Game: {
      findUnique: async () => ({
        id: ids.game,
        sourceType: V1GameSourceType.TOURNAMENT_FIXTURE,
        tournamentFixtureId: ids.fixture,
        state: 'ENDED',
        version: GAME_VERSION,
        currentOfficialRevisionId: ids.baseRevision,
        competitionConfigVersionId: 'config-v1',
      }),
      update: async () => ({ state: 'ENDED', version: GAME_VERSION + 1 }),
    },
    v1TournamentFixture: {
      findUnique: async () => fixtureRow,
      findFirst: async () => fixtureRow,
    },
    v1TournamentFixtureAdvancementEdge: {
      findMany: async () => advancementEdges,
    },
    v1IdempotencyRecord: {
      findUnique: async () => null,
      create: async () => ({}),
    },
    v1GameResultRevision: {
      // 두 호출을 구분한다: base 조회는 `where: {id, gameId}`,
      // `nextRevisionNumber`는 `orderBy`를 붙여 최신 revision만 읽는다.
      findFirst: async (args: { orderBy?: unknown }) =>
        args.orderBy === undefined ? baseRevisionRow : { revision: 1 },
      create: async (args: { data: Record<string, unknown> }) => {
        const created: CreatedRevision = {
          id: `draft-${createdRevisions.length + 1}`,
          revision: args.data.revision as number,
          // void()는 data.state를 명시적으로 VOID로 실어 보낸다 — 그 값을
          // 존중해야 한다. 나머지 레인은 (스키마 기본값과 같은) DRAFT다.
          state: (args.data.state as V1GameResultRevisionState | undefined) ?? V1GameResultRevisionState.DRAFT,
          score: args.data.score,
          goalEvents: args.data.goalEvents,
          missingScorer: args.data.missingScorer as boolean,
          eventsHash: args.data.eventsHash as string,
          outcomeReason: args.data.outcomeReason,
          outcomeNote: args.data.outcomeNote,
        };
        createdRevisions.push(created);
        return created;
      },
      // 재제출 레인만 쓴다: DRAFT로 만든 뒤 참가자를 붙이고 SUBMITTED로 올린다
      // (`v1_guard_result_participant_mutation` 트리거 때문에 그 순서여야 한다).
      update: async (args: { where: { id: string } }) => {
        const target = createdRevisions.find((row) => row.id === args.where.id);
        if (target === undefined) throw new Error(`unknown revision ${args.where.id}`);
        target.state = V1GameResultRevisionState.SUBMITTED;
        return target;
      },
    },
    v1GameResultParticipant: {
      createMany: async (args: { data: CreatedParticipant[] }) => {
        createdParticipants.push(...args.data);
        return { count: args.data.length };
      },
      // base 리비전에 이미 기록된 개인기록 행 수. 빈 `actualParticipants`가
      // "있던 것을 비우는" 것인지 판단하는 유일한 근거다.
      count: async () => options.baseParticipantCount ?? 2,
    },
    v1GameSide: {
      findMany: async () => [
        { id: ids.homeSide, sideKey: 'HOME' },
        { id: ids.awaySide, sideKey: 'AWAY' },
      ],
    },
    // 이 경기의 실제 참가자 집합. 오늘 정정 레인은 이 접근자를 **한 번도
    // 호출하지 않는다**(그게 2-F 결함이다). 고친 코드가 부를 수 있도록 미리
    // 제공해 두되, 현행 동작에는 아무 영향이 없다.
    v1GameParticipant: {
      findMany: async () => [
        { id: ids.homePlayer, sideId: ids.homeSide },
        { id: ids.awayPlayer, sideId: ids.awaySide },
      ],
    },
    v1GameEvent: {
      findMany: async () => [
        {
          id: 'event-goal-1',
          type: V1GameEventType.GOAL,
          sideId: ids.homeSide,
          participantId: goalHasScorer ? ids.homePlayer : null,
          period: 1,
          clockMs: 60_000,
          sequence: 1,
          reversesEventId: null,
          payload: {},
        },
        ...(options.awayGoalEvent === true
          ? [
              {
                id: 'event-goal-2',
                type: V1GameEventType.GOAL,
                sideId: ids.awaySide,
                participantId: goalHasScorer ? ids.awayPlayer : null,
                period: 1,
                clockMs: 70_000,
                sequence: 2,
                reversesEventId: null,
                payload: {},
              },
            ]
          : []),
      ],
    },
    v1CompetitionConfigVersion: {
      findUnique: async () => ({ result: {} }),
    },
    v1OutboxEvent: { create: async () => ({}) },
  };

  const prisma = {
    $transaction: async <T>(callback: (client: unknown) => Promise<T>) => callback(tx),
  } as unknown as PrismaService;

  const staffAccess = {
    assertAccess: async () => ({
      role: 'platform_ops' as const,
      authorizationSubject: `platform_ops:${ids.user}@1`,
      assignmentId: null,
      assignmentVersion: null,
    }),
  } as unknown as TournamentStaffAccessService;

  const auditWriter = { create: async () => ({}) } as unknown as OperationAuditWriterService;

  const service = new TournamentResultReviewService(prisma, staffAccess, auditWriter);

  let attempt = 0;
  const correct = (changes: Record<string, unknown>) => {
    attempt += 1;
    const commandId = `correction-guard-${attempt}`;
    return service.createResultCorrection(authUser, ids.game, commandId, {
      expectedVersion: GAME_VERSION,
      clientCommandId: commandId,
      baseRevisionId: ids.baseRevision,
      reason: '기록 정정',
      changes: {
        score: { home: 1, away: 0 },
        actualParticipants: [...validParticipants],
        eventsHash: 'c'.repeat(64),
        ...changes,
      },
    } as never);
  };

  const supersede = (body: Record<string, unknown>) => {
    attempt += 1;
    const commandId = `resubmission-guard-${attempt}`;
    return service.supersedeAndSubmit(authUser, ids.game, ids.baseRevision, commandId, {
      expectedVersion: GAME_VERSION,
      clientCommandId: commandId,
      score: { home: 1, away: 0 },
      actualParticipants: [...validParticipants],
      eventsHash: 'c'.repeat(64),
      reason: '재제출',
      ...body,
    } as never);
  };

  const voidRevision = () => {
    attempt += 1;
    const commandId = `void-guard-${attempt}`;
    return service.voidResultRevision(authUser, ids.game, ids.baseRevision, commandId, {
      expectedVersion: GAME_VERSION,
      clientCommandId: commandId,
      reason: '오심으로 무효 처리',
    } as never);
  };

  return { service, createdRevisions, createdParticipants, correct, supersede, voidRevision };
}

async function captureFailure(operation: () => Promise<unknown>): Promise<unknown> {
  try {
    await operation();
  } catch (error) {
    return error;
  }
  throw new Error('Expected the correction to be rejected');
}

function expectHttp(error: unknown, status: number, code: string): void {
  expect(error).toBeInstanceOf(HttpException);
  const exception = error as HttpException;
  expect(exception.getStatus()).toBe(status);
  expect(exception.getResponse()).toEqual(expect.objectContaining({ code }));
}

/**
 * 짝 증거. 이 블록이 초록이면 in-memory 더블이 서비스의 커맨드 경계(행 잠금,
 * expectedVersion CAS, 멱등 레코드, supersession 계약, 감사 로그)를 전부
 * 만족시킨다는 뜻이다 — 아래 결함 블록들의 빨강은 하네스가 아니라 제품 결함
 * 때문이라는 근거가 된다.
 */
describe('createResultCorrection — 정상 정정(하네스 건전성 증거)', () => {
  it('참가자 두 명을 담은 정상 정정은 DRAFT 리비전과 참가자 행을 만든다', async () => {
    const harness = createHarness();

    await harness.correct({});

    expect(harness.createdRevisions).toHaveLength(1);
    expect(harness.createdRevisions[0].state).toBe(V1GameResultRevisionState.DRAFT);
    expect(harness.createdParticipants.map((row) => row.participantId)).toEqual([
      ids.homePlayer,
      ids.awayPlayer,
    ]);
  });

  it('중복 participantId는 이미 거부된다(기존 가드가 실제로 도달한다는 증거)', async () => {
    const harness = createHarness();

    const error = await captureFailure(() =>
      harness.correct({ actualParticipants: [validParticipants[0], validParticipants[0]] }),
    );

    expectHttp(error, 422, 'PARTICIPANT_INVALID');
    expect(harness.createdRevisions).toHaveLength(0);
  });
});

describe('공식 득점 타임라인 정합성', () => {
  it('정정한 득점자와 개인 득점 합계가 일치하면 새 참가자 기록에 반영한다', async () => {
    const harness = createHarness();
    await harness.correct({
      score: { home: 0, away: 1 },
      actualParticipants: [
        { ...validParticipants[0], goals: 0 },
        { ...validParticipants[1], goals: 1 },
      ],
      goalEvents: [
        {
          id: 'corrected-goal-1',
          sideId: ids.awaySide,
          participantId: ids.awayPlayer,
          minute: 3,
          period: 1,
          ownGoal: false,
        },
      ],
    });

    expect(harness.createdParticipants).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ participantId: ids.homePlayer, goals: 0 }),
        expect.objectContaining({ participantId: ids.awayPlayer, goals: 1 }),
      ]),
    );
  });

  it('자책골은 상대 팀 점수에는 더하지만 해당 선수 개인 득점에는 더하지 않는다', async () => {
    const harness = createHarness();
    await harness.correct({
      actualParticipants: [
        { ...validParticipants[0], goals: 0 },
        { ...validParticipants[1], goals: 0 },
      ],
      goalEvents: [
        {
          id: 'own-goal-1',
          sideId: ids.homeSide,
          participantId: ids.awayPlayer,
          minute: 3,
          period: 1,
          ownGoal: true,
        },
      ],
    });
    expect(harness.createdRevisions).toHaveLength(1);
  });

  it('명시적인 익명 자책골은 선수 없이 저장하고 missingScorer 경고를 만들지 않는다', async () => {
    const harness = createHarness();
    await harness.correct({
      actualParticipants: [
        { ...validParticipants[0], goals: 0 },
        { ...validParticipants[1], goals: 0 },
      ],
      goalEvents: [
        {
          id: 'anonymous-own-goal-1',
          sideId: ids.homeSide,
          anonymous: true,
          minute: 3,
          period: 1,
          ownGoal: true,
        },
      ],
    });

    expect(harness.createdRevisions).toHaveLength(1);
    expect(harness.createdRevisions[0].missingScorer).toBe(false);
  });

  it('득점 타임라인 합계가 전체 점수와 다르면 리비전을 만들지 않는다', async () => {
    const harness = createHarness();
    const error = await captureFailure(() =>
      harness.correct({
        goalEvents: [],
      }),
    );
    expectHttp(error, 422, 'RESULT_GOAL_TIMELINE_INVALID');
    expect(harness.createdRevisions).toHaveLength(0);
  });
});

/**
 * 2-E. 정정 경로만 `missingScorer: false`를 **하드코딩**한다
 * (`tournament-result-review.service.ts`의 correction 분기). 같은 파일의
 * supersede 경로는 `invariant.missingScorer`(= `resultInvariantInput`이
 * 이벤트에서 계산한 값)를 쓴다 — 그 선례가 정답이다.
 *
 * 하드코딩된 `false`는 "득점자 미상 골이 있다"는 사실을 새 공식 리비전에서
 * 조용히 지운다. 정정 전에는 운영 화면에 미상 경고가 떠 있었는데 정정 한 번으로
 * 사라지므로, 아무도 그 골의 득점자를 채워 넣지 않게 된다 — 사용자가 보고한
 * "선수 개개인 기록이 정확히 남지 않는다"와 정확히 같은 증상이다.
 */
describe('2-E: missingScorer는 이벤트에서 계산되어야 한다', () => {
  it('득점자 미상 GOAL 이벤트가 있으면 정정 리비전의 missingScorer가 true다', async () => {
    const harness = createHarness({ goalHasScorer: false });

    await harness.correct({});

    expect(harness.createdRevisions).toHaveLength(1);
    expect(harness.createdRevisions[0].missingScorer).toBe(true);
  });

  /**
   * 짝. 모든 골에 득점자가 붙어 있으면 false여야 한다. 오늘은 하드코딩
   * `false` 덕에 "옳은 이유가 아니라 우연히" 통과한다 — 위 테스트가 그
   * 우연을 구분해 낸다.
   */
  it('모든 GOAL에 득점자가 붙어 있으면 missingScorer는 false다', async () => {
    const harness = createHarness({ goalHasScorer: true });

    await harness.correct({});

    expect(harness.createdRevisions[0].missingScorer).toBe(false);
  });
});

/**
 * finding #67. 위 2-E는 `changes.goalEvents`를 실어 보내지 않는 `correct({})`만
 * 쓴다 — 그래서 서비스가 `resultInvariantInput`(정본) 분기를 타고, 정정 폼이 실제로
 * 항상 보내는 `assertGoalTimelineConsistent` 분기(goalEvents !== undefined일 때)는
 * 한 번도 실행되지 않았다. 그 분기는 무득점자 골을 만나면 `continue`만 하고
 * `missingScorer`를 대입한 적이 없어 **항상 false를 반환**했다 — 정정을 한 번이라도
 * 거치면 득점자 미상 경고가 조용히 사라지는 실제 버그다. 여기서는 `goalEvents`를
 * 명시적으로 실어 보내 그 분기를 직접 타격한다.
 */
describe('finding #67: goalEvents를 실어 보내는 정정·재제출도 missingScorer를 계산해야 한다', () => {
  it('정정(correct)이 무득점자 GOAL을 anonymous 표식과 함께 보내면 missingScorer가 true다', async () => {
    const harness = createHarness();

    await harness.correct({
      actualParticipants: [
        { ...validParticipants[0], goals: 0 },
        { ...validParticipants[1], goals: 0 },
      ],
      goalEvents: [
        {
          id: 'anonymous-goal-1',
          sideId: ids.homeSide,
          anonymous: true,
          minute: 10,
          period: 1,
          ownGoal: false,
        },
      ],
    });

    expect(harness.createdRevisions).toHaveLength(1);
    expect(harness.createdRevisions[0].missingScorer).toBe(true);
  });

  it('재제출(supersede)이 무득점자 GOAL을 anonymous 표식과 함께 보내도 missingScorer가 true다', async () => {
    // supersede는 REJECTED/SUPPLEMENT_REQUESTED base에서만 허용된다(위
    // '재제출 레인' describe 블록과 동일한 전제).
    const harness = createHarness({ baseState: V1GameResultRevisionState.REJECTED });

    await harness.supersede({
      actualParticipants: [
        { ...validParticipants[0], goals: 0 },
        { ...validParticipants[1], goals: 0 },
      ],
      goalEvents: [
        {
          id: 'anonymous-goal-1',
          sideId: ids.homeSide,
          anonymous: true,
          minute: 10,
          period: 1,
          ownGoal: false,
        },
      ],
    });

    expect(harness.createdRevisions).toHaveLength(1);
    expect(harness.createdRevisions[0].missingScorer).toBe(true);
  });

  /**
   * 짝. 자책골(ownGoal)은 정본(`resultInvariantInput`)도 애초에 missingScorer
   * 판정에서 제외하는 타입이라(`event.type === GOAL`만 본다) 무득점자여도
   * false로 남아야 한다 — 위 "명시적인 익명 자책골" 테스트가 이미 이 축을
   * 덮지만, `ownGoal: false`와 대조되는 짝으로 여기 다시 남겨 회귀를 좁힌다.
   */
  it('무득점자 자책골(ownGoal)은 anonymous 표식이 있으면 missingScorer가 false로 남는다', async () => {
    const harness = createHarness();

    await harness.correct({
      actualParticipants: [
        { ...validParticipants[0], goals: 0 },
        { ...validParticipants[1], goals: 0 },
      ],
      goalEvents: [
        {
          id: 'anonymous-own-goal-2',
          sideId: ids.homeSide,
          anonymous: true,
          minute: 10,
          period: 1,
          ownGoal: true,
        },
      ],
    });

    expect(harness.createdRevisions[0].missingScorer).toBe(false);
  });
});

/**
 * 2-F. `assertCorrectionParticipantsValid`는 **중복과 sideId만** 본다 —
 * 그 `participantId`가 *이 경기의* 참가자인지는 확인하지 않는다.
 * `v1_game_result_participants.participantId`에는 FK도 없으므로(schema.prisma)
 * DB도 막아 주지 않는다. 그래서 **다른 경기의 참가자 UUID**가 이 경기의 공식
 * 기록으로 들어가고, `public-user-records.service.ts`는 그 테이블을 직접 읽어
 * 그 선수의 개인 기록에 남의 경기 성적을 더한다.
 */
describe('2-F: 다른 경기의 participantId는 거부되어야 한다', () => {
  it('이 경기의 참가자가 아닌 participantId로 정정하면 422 PARTICIPANT_INVALID', async () => {
    const harness = createHarness();

    const error = await captureFailure(() =>
      harness.correct({
        actualParticipants: [{ ...validParticipants[0], participantId: ids.foreignPlayer }],
      }),
    );

    expectHttp(error, 422, 'PARTICIPANT_INVALID');
    expect(harness.createdRevisions).toHaveLength(0);
    expect(harness.createdParticipants).toHaveLength(0);
  });

  /**
   * 같은 결함의 "끼워 넣기" 형태. 정정 레인은
   * `validateGameResultInvariants`를 아예 부르지 않으므로 위 테스트만으로도
   * 이 가드가 유일한 방어선임이 증명되지만, 재제출 레인에서는 그렇지 않았다
   * (그쪽 블록 주석 참조) — 두 레인의 케이스 형태를 맞춰 둔다.
   */
  it('정상 참가자 옆에 남의 participantId를 끼워 넣어도 422 PARTICIPANT_INVALID', async () => {
    const harness = createHarness();

    const error = await captureFailure(() =>
      harness.correct({
        actualParticipants: [
          ...validParticipants,
          { ...validParticipants[1], participantId: ids.foreignPlayer, goals: 0 },
        ],
      }),
    );

    expectHttp(error, 422, 'PARTICIPANT_INVALID');
    expect(harness.createdParticipants).toHaveLength(0);
  });

  it('이 경기의 참가자를 상대 진영으로 잘못 적어도 422 PARTICIPANT_INVALID', async () => {
    const harness = createHarness();

    const error = await captureFailure(() =>
      harness.correct({
        // homePlayer 는 실제로 homeSide 소속인데 awaySide 로 적었다. sideId
        // 자체는 이 경기의 side 이므로 리팩터 전 가드는 통과시켰다.
        actualParticipants: [{ ...validParticipants[0], sideId: ids.awaySide }],
      }),
    );

    expectHttp(error, 422, 'PARTICIPANT_INVALID');
    expect(harness.createdRevisions).toHaveLength(0);
  });
});

/**
 * 2-B. `actualParticipants: []`가 통과하면 새 공식 리비전의 개인기록이 0행이
 * 된다 — 그 경기의 선수 개개인 기록이 전멸한다.
 *
 * DTO에 `@ArrayNotEmpty()`를 붙이는 것만으로는 이 레인이 닫히지 않는다:
 * `ValidationPipe`는 HTTP 경계에서만 돌고, 이 서비스는 다른 서버측 코드와
 * 통합테스트에서 직접 호출된다. 그래서 서비스에도 가드가 있어야 하고,
 * 기존 `assertCorrectionParticipantsValid`(이미 422 `PARTICIPANT_INVALID`를
 * 쓰는 함수)가 그 자리다.
 */
describe('2-B: 참가자 목록을 통째로 비울 수 없어야 한다', () => {
  it('빈 actualParticipants로 정정하면 422 PARTICIPANT_INVALID', async () => {
    const harness = createHarness();

    const error = await captureFailure(() => harness.correct({ actualParticipants: [] }));

    expectHttp(error, 422, 'PARTICIPANT_INVALID');
    expect(harness.createdRevisions).toHaveLength(0);
    expect(harness.createdParticipants).toHaveLength(0);
  });

  /**
   * 양방향 증거. 술어는 "비우지 말라"가 아니라 **"있던 것을 비우지 말라"**여야
   * 한다: `deriveTournamentRevision`의 출전 게이트(`appearedIds`)는 선발 표시가
   * 없고 이벤트도 없으면 개인기록을 0행으로 쓰고, 로스터가 빈 등록·TBD 브래킷
   * 픽스처는 `v1GameParticipant` 자체가 0행인 게임을 만든다. 정정 폼은 base
   * 리비전에서만 참가자를 채우므로(로스터 추가 수단 없음) 그런 경기의 정정은
   * 반드시 `actualParticipants: []`로 도착한다 — 무조건 거부하면 그 경기의 점수
   * 오기입을 **영구히** 고칠 수 없다(가드를 조이다 정상 흐름을 막는 회귀).
   */
  it('base 리비전의 개인기록이 0행이었다면 빈 actualParticipants를 허용한다', async () => {
    const harness = createHarness({ baseParticipantCount: 0 });

    await harness.correct({ actualParticipants: [] });

    expect(harness.createdRevisions).toHaveLength(1);
    expect(harness.createdParticipants).toHaveLength(0);
  });
});

/**
 * 2-C 🔴 최고 심각도. 정정 폼(`result-edit-modal.tsx`)은 항상 평평한
 * `{home, away}`만 보내므로 승부차기 점수가 탈락하고, 정정 레인은 클라이언트가
 * 준 score를 그대로 저장한다(`score: jsonInput(dto.changes.score)`).
 * 정정 레인에는 승부차기 가드가 **0건**이다.
 *
 * 그 결과: 결선 무승부가 그대로 확정 →
 * `GameResultBracketProjectionService.resolveWinnerSide`가
 * `BRACKET_RESULT_DRAW_UNSUPPORTED` throw → outbox 6회 재시도 → **POISONED**.
 * 운영자는 "성공"만 보고, 다음 라운드 대진이 영영 비어 있는 것을 나중에 안다.
 *
 * 이 사고는 이미 한 번 났고 `games.service.ts`의 `applyPenalties` docblock에
 * 박제돼 있다 — 그때 `end` 경로만 막고 정정 경로에는 같은 가드를 넣지 않았다.
 *
 * 아래 두 테스트는 `src/games/core/knockout-penalties.spec.ts`가 계약을 못박은
 * 순수 함수가 **지금 어디에도 호출되지 않는다**는 것을 실행 가능한 형태로
 * 증명한다: 오늘 이 정정은 예외 없이 통과해 DRAFT를 만든다.
 */
describe('2-C: 결선 경기 정정은 브래킷을 해결할 수 있어야 한다', () => {
  it('결선 무승부를 승부차기 없이 정정하면 거부한다(현행은 통과 → officialize → POISONED)', async () => {
    const harness = createHarness({ phase: 'semi', hasAdvancementEdge: true });

    const error = await captureFailure(() => harness.correct({ score: { home: 1, away: 1 } }));

    expectHttp(error, 409, 'TOURNAMENT_PENALTY_REQUIRED');
    expect(harness.createdRevisions).toHaveLength(0);
  });

  it('승부차기를 실어 정정하면 그 점수가 리비전 score에 그대로 저장된다', async () => {
    const harness = createHarness({ phase: 'semi', hasAdvancementEdge: true });

    // 승부차기를 **새로 쓰는** 정정이므로 킥 수를 함께 보낸다 — `end` 레인과 같은 요구다.
    await harness.correct({
      score: { home: 1, away: 1, penalties: { home: 5, away: 4, takenHome: 5, takenAway: 5 } },
    });

    expect(harness.createdRevisions).toHaveLength(1);
    expect(harness.createdRevisions[0].score).toEqual({
      home: 1,
      away: 1,
      penalties: { home: 5, away: 4, takenHome: 5, takenAway: 5 },
    });
  });

  /**
   * **2026-08-18 알파 교차 측정 회귀 가드.** 킥 수 필수 가드가 `end` 레인에만 있어서
   * 같은 값이 레인에 따라 갈렸다:
   *   `POST /games/:id/end`         + `{home:9, away:0}` → 422
   *   `POST /games/:id/corrections` + `{home:9, away:0}` → **201, 그대로 저장**
   * 저장된 값엔 킥 수도 선축도 없어 이후 어떤 판정도 근거를 갖지 못했다.
   */
  /**
   * **2026-08-19 alpha 감사 F-2 회귀 가드.** 선축이 승계되지 않아, 5킥 전에 결판난 경기의
   * 정정이 422 로 하드 차단됐다 — 선축이 없으면 결판 판정이 "선축 미상" 분기로 떨어지고
   * 그 분기는 5킥 바닥을 요구하기 때문이다. 정정 폼에는 승부차기 입력란이 0개라
   * **운영자에게 탈출구가 없었다**(같은 요청에 선축 키 하나만 붙이면 201 이었다).
   */
  it('5킥 전에 결판난 승부차기도 선축을 승계해 정정이 통과한다 — 탈출구 없는 422 방지', async () => {
    const harness = createHarness({
      phase: 'semi',
      hasAdvancementEdge: true,
      // 각 3킥 3:0 — 잔여 2킥으로 역전 불가라 `end` 가 201 로 받아 주는 정상 조기 결판.
      baseScore: {
        home: 1,
        away: 1,
        penalties: { home: 3, away: 0, takenHome: 3, takenAway: 3, firstKickSideKey: 'HOME' },
      },
    });

    // 폼이 선축을 빠뜨린 형태(옛 번들). 킥 수·선축 모두 base 에서 메워져야 한다.
    await harness.correct({ score: { home: 1, away: 1, penalties: { home: 3, away: 0 } } });

    expect(harness.createdRevisions).toHaveLength(1);
    expect(harness.createdRevisions[0].score).toEqual({
      home: 1,
      away: 1,
      penalties: { home: 3, away: 0, takenHome: 3, takenAway: 3, firstKickSideKey: 'HOME' },
    });
  });

  it('승부차기를 새로 쓰는 정정에 킥 수가 없으면 거부한다 — end 레인과 같은 기준', async () => {
    const harness = createHarness({ phase: 'semi', hasAdvancementEdge: true });

    const error = await captureFailure(() =>
      harness.correct({ score: { home: 1, away: 1, penalties: { home: 9, away: 0 } } }),
    );

    expect((error as { getResponse?: () => unknown }).getResponse?.()).toMatchObject({
      code: 'TOURNAMENT_PENALTY_KICK_COUNTS_REQUIRED',
    });
    expect(harness.createdRevisions).toHaveLength(0);
  });

  it('조별리그 무승부 정정은 정상 결과이므로 막지 않는다(짝 증거)', async () => {
    const harness = createHarness({ phase: 'group' });

    await harness.correct({ score: { home: 1, away: 1 } });

    expect(harness.createdRevisions).toHaveLength(1);
  });

  it('조별리그 정정에 승부차기를 실으면 거부한다', async () => {
    const harness = createHarness({ phase: 'group' });

    const error = await captureFailure(() =>
      harness.correct({ score: { home: 1, away: 1, penalties: { home: 5, away: 4 } } }),
    );

    expectHttp(error, 409, 'TOURNAMENT_PENALTY_NOT_ALLOWED');
    expect(harness.createdRevisions).toHaveLength(0);
  });
});

/**
 * 2-G의 서비스 절반. DTO를 강타입화(`@ValidateNested() @Type(() =>
 * PenaltyScoreDto)`)해도 두 값은 여전히 새어 들어온다:
 *
 *  1. `penalties: null` — `@IsOptional()`은 null을 건너뛴다. 그 null이
 *     `jsonInput`(canonicalize는 `undefined`만 제거한다)을 타고
 *     `score.penalties = null`로 DB에 박히면 아웃박스 핸들러의
 *     `parseOfficialPenalties(null)`이 throw → POISONED.
 *  2. `{home: 3, away: 3}` — `parseOfficialPenalties`는 동점 승부차기를
 *     통과시키고, `resolveWinnerSide`가 그때서야 draw로 떨어뜨린다 → POISONED.
 *
 * 그래서 서비스가 `extractEndPenalties`(games.service.ts, 이미 422
 * `TOURNAMENT_PENALTY_INVALID`로 두 경우를 모두 거부하는 export된 순수 함수)를
 * 재사용해 형태를 검증하고, **그 반환값을** score에 저장해야 한다.
 */
describe('2-G: penalties 형태 오류는 서비스에서도 막아야 한다', () => {
  it('penalties가 null이면 422 TOURNAMENT_PENALTY_INVALID', async () => {
    const harness = createHarness({ phase: 'semi' });

    const error = await captureFailure(() =>
      harness.correct({ score: { home: 1, away: 1, penalties: null } }),
    );

    expectHttp(error, 422, 'TOURNAMENT_PENALTY_INVALID');
    expect(harness.createdRevisions).toHaveLength(0);
  });

  it('penalties가 빈 객체면 422 TOURNAMENT_PENALTY_INVALID', async () => {
    const harness = createHarness({ phase: 'semi' });

    const error = await captureFailure(() =>
      harness.correct({ score: { home: 1, away: 1, penalties: {} } }),
    );

    expectHttp(error, 422, 'TOURNAMENT_PENALTY_INVALID');
    expect(harness.createdRevisions).toHaveLength(0);
  });

  it('승부차기 점수가 동점이면 승자가 없으므로 422 TOURNAMENT_PENALTY_INVALID', async () => {
    const harness = createHarness({ phase: 'semi' });

    const error = await captureFailure(() =>
      harness.correct({ score: { home: 1, away: 1, penalties: { home: 3, away: 3 } } }),
    );

    expectHttp(error, 422, 'TOURNAMENT_PENALTY_INVALID');
    expect(harness.createdRevisions).toHaveLength(0);
  });
});

/**
 * 2-C의 **반대 방향** — 가드를 조이다 정상 흐름을 막지 않았는가.
 *
 * `end` 레인이 이미 결선 무승부를 거부하므로, 공식이 된 결선 무승부 경기는
 * 예외 없이 `score.penalties`를 갖는다. 그런데 정정·재제출 폼은 **항상 평평한
 * `{home, away}`만** 보낸다(`result-edit-modal.tsx`의 `onConfirm`; 클라이언트
 * 타입 `V1GameResultScoreInput`에는 penalties 필드조차 없다). 그래서 "penalties가
 * 없으면 결선 무승부를 거부"만 구현하면, **승부차기로 결정된 모든 결선 경기가
 * 어떤 정정도 받지 않게 된다** — 폼에 승부차기 입력란이 없으므로 409가 요구하는
 * "승부차기 결과를 입력해주세요"를 만족시킬 방법이 아예 없다. 사용자가 정정하고
 * 싶어 한 바로 그 화면이 영구히 막히는 회귀다.
 *
 * 그래서 서버가 base 리비전의 값을 승계한다(`readStoredPenalties`).
 */
describe('2-C 역방향: 승부차기로 결정된 결선 경기의 정정이 막히지 않아야 한다', () => {
  const baseWithPenalties = { home: 1, away: 1, penalties: { home: 5, away: 4 } };

  it('폼이 penalties를 떨어뜨려도 base의 승부차기를 승계해 정정이 통과한다', async () => {
    const harness = createHarness({
      phase: 'semi',
      hasAdvancementEdge: true,
      baseScore: baseWithPenalties,
    });

    await harness.correct({ score: { home: 1, away: 1 } });

    expect(harness.createdRevisions).toHaveLength(1);
    // 승계된 값이 실제로 저장돼야 한다 — 저장되지 않으면 officialize 후
    // `resolveWinnerSide`가 draw로 떨어져 잡이 POISONED가 된다.
    expect(harness.createdRevisions[0].score).toEqual(baseWithPenalties);
  });

  it('정정이 정규시간을 결정적으로 바꾸면 승부차기를 승계하지 않는다', async () => {
    const harness = createHarness({
      phase: 'semi',
      hasAdvancementEdge: true,
      baseScore: baseWithPenalties,
    });

    // 1-1 → 2-1. 90분에 승자가 났으면 승부차기는 의미가 없고, 승계하면
    // `assertPenaltiesNotAllowed`가 "이미 승자가 났다"로 거부해 또 막다른 길이 된다.
    await harness.correct({ score: { home: 2, away: 1 } });

    expect(harness.createdRevisions[0].score).toEqual({ home: 2, away: 1 });
  });

  it('클라이언트가 보낸 승부차기가 base 값을 덮어쓴다', async () => {
    const harness = createHarness({
      phase: 'semi',
      hasAdvancementEdge: true,
      baseScore: baseWithPenalties,
    });

    // base 와 점수가 다른 = 승부차기를 바꾸는 정정이므로 킥 수가 필요하다.
    await harness.correct({
      score: { home: 1, away: 1, penalties: { home: 4, away: 6, takenHome: 6, takenAway: 6 } },
    });

    expect(harness.createdRevisions[0].score).toEqual({
      home: 1,
      away: 1,
      penalties: { home: 4, away: 6, takenHome: 6, takenAway: 6 },
    });
  });

  /**
   * 승계가 검증을 우회하는 문이 되어서는 안 된다. 동점 승부차기가 저장돼 있던
   * 레거시 리비전을 승계하면 승자가 없어 브래킷이 여전히 해결 불가다.
   */
  it('base의 승부차기가 동점이면 승계해도 해결 불가이므로 409로 거부한다', async () => {
    const harness = createHarness({
      phase: 'semi',
      hasAdvancementEdge: true,
      baseScore: { home: 1, away: 1, penalties: { home: 3, away: 3 } },
    });

    const error = await captureFailure(() => harness.correct({ score: { home: 1, away: 1 } }));

    expectHttp(error, 409, 'TOURNAMENT_PENALTY_REQUIRED');
    expect(harness.createdRevisions).toHaveLength(0);
  });

  /**
   * 조별리그에는 승계하지 않는다. 승계하면 `assertPenaltiesNotAllowed`가
   * "조별리그엔 승부차기를 기록할 수 없다"로 그 정정을 거부해, 승부차기가 잘못
   * 저장된 레거시 조별 경기를 고칠 방법이 사라진다 — 승계하지 않으면 그 정정이
   * 잘못된 값을 정상적으로 걷어낸다.
   */
  it('조별리그는 base에 승부차기가 있어도 승계하지 않고 걷어낸다', async () => {
    const harness = createHarness({ phase: 'group', baseScore: baseWithPenalties });

    await harness.correct({ score: { home: 1, away: 1 } });

    expect(harness.createdRevisions[0].score).toEqual({ home: 1, away: 1 });
  });
});

/**
 * 재제출(supersede) 레인은 정정 레인과 **같은** 가드를 통과해야 한다. 이 블록이
 * 없으면 그 레인의 가드 호출을 지워도 아무 테스트도 깨지지 않는다(실측:
 * 호출 한 줄을 되돌려도 이전 44개가 전부 초록이었다) — 그 레인은 HTTP로 도달
 * 가능하고 `validateGameResultInvariants`는 participantId의 소속을 보지 않으므로
 * (`game-invariants.ts`) 같은 결함이 그대로 남는다.
 */
describe('재제출(supersede) 레인도 같은 가드를 통과해야 한다', () => {
  const rejectedBase = { baseState: V1GameResultRevisionState.REJECTED } as const;

  it('정상 재제출은 SUBMITTED 리비전과 참가자 행을 만든다(하네스 건전성 증거)', async () => {
    const harness = createHarness(rejectedBase);

    await harness.supersede({});

    expect(harness.createdRevisions).toHaveLength(1);
    expect(harness.createdRevisions[0].state).toBe(V1GameResultRevisionState.SUBMITTED);
    expect(harness.createdRevisions[0].goalEvents).toBeUndefined();
    expect(harness.createdParticipants.map((row) => row.participantId)).toEqual([
      ids.homePlayer,
      ids.awayPlayer,
    ]);
  });

  /**
   * ⚠️ 남의 participantId를 **정상 참가자 옆에 끼워 넣는다.** 정상 참가자를 빼고
   * 남의 것만 보내면 `validateGameResultInvariants`가 다른 이유로 먼저 걸려
   * (GOAL 이벤트의 득점자가 제출 목록에 없다 → PARTICIPANT_INVALID 'Event
   * participant does not belong to the game') 이 가드를 지워도 초록이 된다 —
   * 뮤테이션으로 실측했다. 실제 구멍은 `goals: 0`인 남의 행을 **추가**하는 것이다:
   * 모든 이벤트가 해소되고 골 합도 맞아 그 invariant는 아무것도 잡지 못하며,
   * `v1_game_result_participants.participant_id`에는 FK도 없어 DB도 막지 않는다.
   * 그 행은 그대로 이 경기의 출전 기록이 되고
   * `public-user-records.service.ts`가 그것을 직접 읽는다.
   */
  it('2-F: 정상 참가자 옆에 남의 경기 participantId를 끼워 넣으면 422 PARTICIPANT_INVALID', async () => {
    const harness = createHarness(rejectedBase);

    const error = await captureFailure(() =>
      harness.supersede({
        actualParticipants: [
          ...validParticipants,
          { ...validParticipants[1], participantId: ids.foreignPlayer, goals: 0 },
        ],
      }),
    );

    expectHttp(error, 422, 'PARTICIPANT_INVALID');
    expect(harness.createdRevisions).toHaveLength(0);
    expect(harness.createdParticipants).toHaveLength(0);
  });

  it('2-B: base에 개인기록이 있었으면 빈 actualParticipants 재제출을 422로 거부한다', async () => {
    const harness = createHarness(rejectedBase);

    const error = await captureFailure(() => harness.supersede({ actualParticipants: [] }));

    expectHttp(error, 422, 'PARTICIPANT_INVALID');
    expect(harness.createdRevisions).toHaveLength(0);
  });

  it('2-C: 결선 무승부를 승부차기 없이 재제출하면 409 TOURNAMENT_PENALTY_REQUIRED', async () => {
    const harness = createHarness({ ...rejectedBase, phase: 'semi', hasAdvancementEdge: true });

    const error = await captureFailure(() => harness.supersede({ score: { home: 1, away: 1 } }));

    expectHttp(error, 409, 'TOURNAMENT_PENALTY_REQUIRED');
    expect(harness.createdRevisions).toHaveLength(0);
  });

  it('2-G: 재제출 penalties가 null이면 422 TOURNAMENT_PENALTY_INVALID', async () => {
    const harness = createHarness({ ...rejectedBase, phase: 'semi' });

    const error = await captureFailure(() =>
      harness.supersede({ score: { home: 1, away: 1, penalties: null } }),
    );

    expectHttp(error, 422, 'TOURNAMENT_PENALTY_INVALID');
    expect(harness.createdRevisions).toHaveLength(0);
  });

  /**
   * 이 레인은 정정과 달리 `validateGameResultInvariants`도 함께 돈다. 새 승부차기
   * 가드가 그 교차검증(422 `SCORE_EVENT_MISMATCH`)보다 **먼저** 걸려야 한다 —
   * 순서가 뒤집히면 결선 무승부 재제출의 실패 이유가 "이벤트 불일치"로 나와
   * 운영자가 승부차기를 입력해야 한다는 사실을 알 수 없다. 하네스의 이벤트
   * 스트림은 home 1골뿐이므로 아래 0-0은 두 검증 모두를 위반한다.
   */
  it('승부차기 가드가 이벤트 교차검증보다 먼저 걸린다', async () => {
    const harness = createHarness({ ...rejectedBase, phase: 'semi', hasAdvancementEdge: true });

    const error = await captureFailure(() => harness.supersede({ score: { home: 0, away: 0 } }));

    expectHttp(error, 409, 'TOURNAMENT_PENALTY_REQUIRED');
  });

  it('base의 승부차기를 승계해 결선 재제출도 통과한다', async () => {
    const harness = createHarness({
      ...rejectedBase,
      phase: 'semi',
      hasAdvancementEdge: true,
      baseScore: { home: 1, away: 1, penalties: { home: 5, away: 4 } },
      // 이 레인은 score↔이벤트 교차검증도 함께 돈다 — 1-1 재제출을 검증하려면
      // 이벤트 스트림도 1-1이어야 한다(정정 레인에는 없는 제약이다).
      awayGoalEvent: true,
    });

    await harness.supersede({
      score: { home: 1, away: 1 },
      actualParticipants: [validParticipants[0], { ...validParticipants[1], goals: 1 }],
    });

    expect(harness.createdRevisions).toHaveLength(1);
    expect(harness.createdRevisions[0].score).toEqual({
      home: 1,
      away: 1,
      penalties: { home: 5, away: 4 },
    });
  });
});

/**
 * 감사 지적: 정정·재제출·무효가 만드는 새 리비전이 몰수·중단 표식
 * (outcomeReason/outcomeNote)을 base에서 승계하지 않으면, 몰수로 끝난 경기가
 * 정정 한 번에(또는 재제출/재입력 한 번에) 정상 종료(NORMAL)로 조용히
 * 둔갑한다. 세 create() 호출 전부를 개별로 잠근다 — 한 곳만 고치고 나머지를
 * 놓치는 재발을 막기 위해서다.
 */
describe('몰수·중단 표식(outcomeReason/outcomeNote) 승계', () => {
  const forfeitBase = {
    baseOutcomeReason: 'FORFEIT',
    baseOutcomeNote: '상대팀 미출전',
  } as const;

  it('정정(correct)은 base의 몰수 표식을 새 리비전에 그대로 승계한다', async () => {
    const harness = createHarness(forfeitBase);

    await harness.correct({});

    expect(harness.createdRevisions).toHaveLength(1);
    expect(harness.createdRevisions[0].outcomeReason).toBe('FORFEIT');
    expect(harness.createdRevisions[0].outcomeNote).toBe('상대팀 미출전');
  });

  it('정정 base가 정상 종료(NORMAL)면 그대로 NORMAL을 승계한다(짝 증거 — 하드코딩된 상수를 리턴하는 거짓 초록 방지)', async () => {
    const harness = createHarness();

    await harness.correct({});

    expect(harness.createdRevisions[0].outcomeReason).toBe('NORMAL');
    expect(harness.createdRevisions[0].outcomeNote).toBeNull();
  });

  it('재제출(supersede)은 REJECTED base의 몰수 표식을 새 리비전에 그대로 승계한다', async () => {
    const harness = createHarness({ ...forfeitBase, baseState: V1GameResultRevisionState.REJECTED });

    await harness.supersede({});

    expect(harness.createdRevisions).toHaveLength(1);
    expect(harness.createdRevisions[0].outcomeReason).toBe('FORFEIT');
    expect(harness.createdRevisions[0].outcomeNote).toBe('상대팀 미출전');
  });

  it('무효(void)는 OFFICIAL base의 몰수 표식을 VOID 리비전에 그대로 승계한다', async () => {
    const harness = createHarness(forfeitBase);

    await harness.voidRevision();

    expect(harness.createdRevisions).toHaveLength(1);
    expect(harness.createdRevisions[0].state).toBe(V1GameResultRevisionState.VOID);
    expect(harness.createdRevisions[0].outcomeReason).toBe('FORFEIT');
    expect(harness.createdRevisions[0].outcomeNote).toBe('상대팀 미출전');
  });
});
