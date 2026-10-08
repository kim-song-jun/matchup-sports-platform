import { HttpException } from '@nestjs/common';
import { V1GameResultRevisionState } from '@prisma/client';
import type { V1AuthUser } from '../../auth/v1-auth-user';
import type { OperationAuditWriterService } from '../../common/audit/operation-audit-writer.service';
import { canonicalGameCommandPayloadHash } from '../../games/games.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { TournamentStaffAccessService } from '../../tournaments/staff/tournament-staff-access.service';
import { QUICK_RESULT_REASON_MARKER } from './quick-result.constants';
import type { QuickResultDto } from './quick-result.dto';
import { TournamentResultReviewService } from './tournament-result-review.service';

// DB 더블이 없는 후속 호출은 스텁으로만 둔다. 호출 여부는 단언하지 않는다(통합 스펙 7b 가 DB 결과로 증명).
jest.mock('../../games/team-match-result-boundary', () => ({
  completeTeamMatchAtResultBoundary: jest.fn(async () => undefined),
}));

const ids = {
  user: '7c1e0000-0000-4000-8000-000000000001',
  game: '7c1e0000-0000-4000-8000-000000000010',
  fixture: '7c1e0000-0000-4000-8000-000000000011',
  tournament: '7c1e0000-0000-4000-8000-000000000012',
  homeSide: '7c1e0000-0000-4000-8000-000000000020',
  awaySide: '7c1e0000-0000-4000-8000-000000000021',
  homeTeam: '7c1e0000-0000-4000-8000-000000000022',
  awayTeam: '7c1e0000-0000-4000-8000-000000000023',
} as const;
const KEY = '7c1e0000-0000-4000-8000-0000000000aa';
const GAME_VERSION = 4;
const authUser: V1AuthUser = {
  id: ids.user,
  email: 'quick-result@example.test',
  accountStatus: 'active',
  onboardingStatus: 'completed',
};

type StoredRevision = { id: string; revision: number; state: V1GameResultRevisionState; score?: unknown };
type HarnessOptions = {
  readonly source?: 'tournament' | 'league' | 'friendly';
  readonly gameMissing?: boolean;
  readonly gameState?: string;
  readonly revisions?: readonly StoredRevision[];
  readonly pointerId?: string | null;
  readonly teamMatchStatus?: string;
  readonly eventCount?: number;
  readonly sideTeamIds?: readonly [string | null, string | null];
  /** 참가자 행. 기본은 홈의 옛 명단(리비전 1) + 새 명단(리비전 2) + 무효화된 더 새 명단(리비전 3) + 원정 명단이다. */
  readonly participants?: ReadonlyArray<{ id: string; sideId: string; lineupId: string; position: string | null }>;
  readonly pendingResync?: number;
  readonly phase?: 'group' | 'semi';
  readonly hasAdvancementEdge?: boolean;
  readonly role?: 'platform_ops' | 'tournament_director';
  /** 같은 멱등 키로 이미 저장된 응답(재생·충돌 판정용). */
  readonly existingRecord?: { payloadHash: string; responseStatus: number; responseBody: unknown };
};

const defaultParticipants = [
  { id: 'p-home-old', sideId: ids.homeSide, lineupId: 'lineup-home-1', position: 'GK' },
  { id: 'p-home-gk', sideId: ids.homeSide, lineupId: 'lineup-home-2', position: 'GK' },
  { id: 'p-home-fw', sideId: ids.homeSide, lineupId: 'lineup-home-2', position: 'FW' },
  { id: 'p-away-gk', sideId: ids.awaySide, lineupId: 'lineup-away-1', position: 'GK' },
  // 무효화된 리비전(3)의 선수. 무효화를 거르지 않으면 이 리비전이 "최신"이 되어 명단이 통째로 바뀐다.
  { id: 'p-home-stale', sideId: ids.homeSide, lineupId: 'lineup-home-3', position: 'FW' },
];

function createHarness(options: HarnessOptions = {}) {
  const source = options.source ?? 'tournament';
  const revisions = options.revisions ?? [];
  const latest = [...revisions].sort((a, b) => b.revision - a.revision)[0] ?? null;
  const teamIds = options.sideTeamIds ?? [ids.homeTeam, ids.awayTeam];

  const created: Array<Record<string, unknown>> = [];
  const revisionUpdates: Array<{ where: { id: string }; data: Record<string, unknown> }> = [];
  const participantRows: Array<Record<string, unknown>> = [];
  const outbox: Array<Record<string, unknown>> = [];
  const gameUpdates: Array<{ data: Record<string, unknown> }> = [];
  const periodUpdates: Array<{ where: Record<string, unknown>; data: Record<string, unknown> }> = [];
  const audits: Array<Record<string, unknown>> = [];
  const staffAccessInputs: Array<Record<string, unknown>> = [];

  const gameRow = options.gameMissing === true
    ? null
    : {
        id: ids.game,
        sourceType: 'TEAM_MATCH',
        teamMatchId: ids.fixture,
        state: options.gameState ?? 'SCHEDULED',
        version: GAME_VERSION,
        currentOfficialRevisionId: options.pointerId ?? null,
        competitionConfigVersionId: 'config-v1',
      };
  const teamMatchRow = {
    id: ids.fixture,
    status: options.teamMatchStatus ?? 'matched',
    fieldId: null,
    tournamentId: source === 'friendly' ? null : ids.tournament,
    leagueId: source === 'league' ? ids.tournament : null,
    tournament: source === 'friendly' ? null : { kind: source === 'league' ? 'regular_league' : 'regular_tournament' },
    tournamentDetails:
      source === 'tournament' ? { teamMatchId: ids.fixture, tournamentId: ids.tournament } : null,
  };

  const tx = {
    $queryRaw: async () => [],
    v1Game: {
      findUnique: async () => gameRow,
      update: async (args: { data: Record<string, unknown> }) => {
        gameUpdates.push(args);
        return { id: ids.game, state: 'ENDED', version: GAME_VERSION + 1 };
      },
    },
    v1TeamMatch: { findUnique: async () => teamMatchRow },
    v1TournamentMatchDetails: {
      findUnique: async () =>
        source === 'tournament'
          ? { group: { phase: options.phase ?? 'semi' }, _count: { advancementSources: options.hasAdvancementEdge === false ? 0 : 1 } }
          : null,
    },
    v1IdempotencyRecord: { findUnique: async () => options.existingRecord ?? null, create: async () => ({}) },
    v1GameResultRevision: {
      findFirst: async () => latest,
      create: async (args: { data: Record<string, unknown> }) => {
        created.push({ ...args.data, id: 'quick-rev-1' });
        return { id: 'quick-rev-1', revision: args.data.revision as number, state: V1GameResultRevisionState.DRAFT };
      },
      update: async (args: { where: { id: string }; data: Record<string, unknown> }) => {
        revisionUpdates.push(args);
        return { id: args.where.id, revision: created[0]?.revision as number, state: args.data.state };
      },
    },
    v1GameResultParticipant: {
      createMany: async (args: { data: Array<Record<string, unknown>> }) => {
        participantRows.push(...args.data);
        return { count: args.data.length };
      },
    },
    v1GameSide: {
      findMany: async () => [
        { id: ids.homeSide, teamId: teamIds[0] },
        { id: ids.awaySide, teamId: teamIds[1] },
      ],
    },
    v1GameLineup: {
      findMany: async (args: { where: { invalidatedAt?: null } }) =>
        [
          { id: 'lineup-home-1', sideId: ids.homeSide, revision: 1, state: 'SUBMITTED', invalidatedAt: null },
          { id: 'lineup-home-2', sideId: ids.homeSide, revision: 2, state: 'SUBMITTED', invalidatedAt: null },
          { id: 'lineup-home-3', sideId: ids.homeSide, revision: 3, state: 'SUBMITTED', invalidatedAt: new Date() },
          { id: 'lineup-away-1', sideId: ids.awaySide, revision: 1, state: 'SUBMITTED', invalidatedAt: null },
        ].filter((row) => args.where.invalidatedAt !== null || row.invalidatedAt === null),
    },
    v1GameParticipant: { findMany: async () => options.participants ?? defaultParticipants },
    v1GameEvent: { count: async () => options.eventCount ?? 0 },
    v1OutboxEvent: {
      count: async () => options.pendingResync ?? 0,
      create: async (args: { data: Record<string, unknown> }) => {
        outbox.push(args.data);
        return {};
      },
    },
    v1GamePeriod: {
      updateMany: async (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        periodUpdates.push(args);
        return { count: 0 };
      },
    },
    v1CompetitionConfigVersion: {
      findUnique: async () => ({
        lineup: { positions: [{ code: 'GK', label: '골키퍼', short: 'GK', goalkeeper: true }, { code: 'FW', label: '공격수', short: 'FW' }] },
        result: {},
      }),
    },
  };

  const prisma = {
    $transaction: async <T>(callback: (client: unknown) => Promise<T>) => callback(tx),
    v1Game: tx.v1Game,
    v1TeamMatch: tx.v1TeamMatch,
  } as unknown as PrismaService;
  const staffAccess = {
    assertAccess: async (input: Record<string, unknown>) => {
      staffAccessInputs.push(input);
      return {
        role: options.role ?? 'platform_ops',
        authorizationSubject: `${options.role ?? 'platform_ops'}:${ids.user}@1`,
        assignmentId: null,
        assignmentVersion: null,
      };
    },
  } as unknown as TournamentStaffAccessService;
  const auditWriter = {
    create: async (_client: unknown, input: Record<string, unknown>) => {
      audits.push(input);
      return {};
    },
  } as unknown as OperationAuditWriterService;

  const service = new TournamentResultReviewService(prisma, staffAccess, auditWriter);
  const dtoFor = (score: QuickResultDto['score'], overrides: Partial<QuickResultDto> = {}): QuickResultDto => ({
    clientCommandId: KEY,
    expectedVersion: GAME_VERSION,
    score,
    ...overrides,
  });
  /** `headerKey` 를 `null` 로 주면 Idempotency-Key 헤더가 없는 요청이다(기본값 인자는 undefined 를 삼키므로 null 을 쓴다). */
  const run = (score: QuickResultDto['score'], overrides: Partial<QuickResultDto> = {}, headerKey: string | null = KEY) =>
    service.quickResult(authUser, ids.game, dtoFor(score, overrides), headerKey ?? undefined);

  return { run, created, revisionUpdates, participantRows, outbox, gameUpdates, periodUpdates, audits, staffAccessInputs };
}
type Harness = ReturnType<typeof createHarness>;

async function captureFailure(operation: () => Promise<unknown>): Promise<unknown> {
  try {
    await operation();
  } catch (error) {
    return error;
  }
  throw new Error('Expected the quick result to be rejected');
}

function expectHttp(error: unknown, status: number, code: string): void {
  expect(error).toBeInstanceOf(HttpException);
  expect((error as HttpException).getStatus()).toBe(status);
  expect((error as HttpException).getResponse()).toEqual(expect.objectContaining({ code }));
}

/** 거부된 요청은 어떤 행도 쓰지 않아야 한다. */
function expectNoWrites(harness: Harness): void {
  expect(harness.created).toHaveLength(0);
  expect(harness.revisionUpdates).toHaveLength(0);
  expect(harness.participantRows).toHaveLength(0);
  expect(harness.outbox).toHaveLength(0);
  expect(harness.gameUpdates).toHaveLength(0);
  expect(harness.periodUpdates).toHaveLength(0);
}

describe('quickResult — 권한·경계', () => {
  it('platform_ops 가 아닌 주체(대회 디렉터)는 PERMISSION_DENIED 403 이고 아무것도 쓰지 않는다', async () => {
    const harness = createHarness({ role: 'tournament_director' });

    expectHttp(await captureFailure(() => harness.run({ home: 1, away: 0 })), 403, 'PERMISSION_DENIED');
    expectNoWrites(harness);
  });

  it('친선(대회·리그 소속 아님) 경기는 권한 검사 전에 QUICK_RESULT_UNSUPPORTED 로 닫힌다', async () => {
    const harness = createHarness({ source: 'friendly' });

    expectHttp(await captureFailure(() => harness.run({ home: 1, away: 0 })), 409, 'QUICK_RESULT_UNSUPPORTED');
    expect(harness.staffAccessInputs).toHaveLength(0);
    expectNoWrites(harness);
  });

  it('없는 게임은 404 GAME_NOT_FOUND', async () => {
    const harness = createHarness({ gameMissing: true });

    expectHttp(await captureFailure(() => harness.run({ home: 1, away: 0 })), 404, 'GAME_NOT_FOUND');
  });

  it('Idempotency-Key 가 clientCommandId 와 다르면 422 이고 아무것도 쓰지 않는다', async () => {
    const harness = createHarness();

    const error = await captureFailure(() => harness.run({ home: 1, away: 0 }, {}, 'other-key'));

    expectHttp(error, 422, 'COMMAND_IDEMPOTENCY_KEY_MISMATCH');
    expectNoWrites(harness);
  });

  it('Idempotency-Key 헤더가 없으면 같은 422 다', async () => {
    const harness = createHarness();

    expectHttp(await captureFailure(() => harness.run({ home: 1, away: 0 }, {}, null)), 422, 'COMMAND_IDEMPOTENCY_KEY_MISMATCH');
    expectNoWrites(harness);
  });

  it('expectedVersion 이 낡았으면 409 VERSION_CONFLICT', async () => {
    const harness = createHarness();

    expectHttp(
      await captureFailure(() => harness.run({ home: 1, away: 0 }, { expectedVersion: GAME_VERSION - 1 })),
      409,
      'VERSION_CONFLICT',
    );
    expectNoWrites(harness);
  });
});


describe('quickResult — 멱등 키 재사용', () => {
  const payload = { clientCommandId: KEY, expectedVersion: GAME_VERSION, score: { home: 2, away: 1 } };
  const stored = {
    gameId: ids.game,
    revisionId: 'old-rev',
    revision: 1,
    revisionState: 'OFFICIAL',
    state: 'ENDED',
    version: GAME_VERSION + 1,
    durableCommandId: KEY,
    replayed: false,
    score: { home: 2, away: 1 },
  };

  it('같은 본문의 재요청은 저장된 응답을 그대로 돌려주고 새 행을 쓰지 않는다', async () => {
    const harness = createHarness({
      existingRecord: { payloadHash: canonicalGameCommandPayloadHash(payload), responseStatus: 200, responseBody: stored },
    });

    const response = await harness.run({ home: 2, away: 1 });

    expect(response).toEqual({ gameId: ids.game, revisionId: 'old-rev', version: GAME_VERSION + 1, score: { home: 2, away: 1 } });
    expectNoWrites(harness);
  });

  it('같은 키에 다른 본문은 409 IDEMPOTENCY_PAYLOAD_CONFLICT 다 — 원시 예외로 새면 500 이 된다', async () => {
    const harness = createHarness({
      existingRecord: {
        payloadHash: canonicalGameCommandPayloadHash({ ...payload, score: { home: 0, away: 3 } }),
        responseStatus: 200,
        responseBody: stored,
      },
    });

    expectHttp(await captureFailure(() => harness.run({ home: 2, away: 1 })), 409, 'IDEMPOTENCY_PAYLOAD_CONFLICT');
    expectNoWrites(harness);
  });
});

describe('quickResult — 무효(VOID) 뒤 재입력 — 거부 경로', () => {
  const voided: StoredRevision = { id: 'void-rev', revision: 3, state: V1GameResultRevisionState.VOID };
  const reentry = { gameState: 'ENDED', revisions: [voided], pointerId: 'void-rev', teamMatchStatus: 'completed' } as const;

  it('대조군 — 최초 입력(SCHEDULED)은 팀매치가 completed 면 취소된 경기처럼 거부한다', async () => {
    const harness = createHarness({ teamMatchStatus: 'completed' });

    expectHttp(await captureFailure(() => harness.run({ home: 1, away: 0 })), 409, 'QUICK_RESULT_FIXTURE_CANCELLED');
    expectNoWrites(harness);
  });

  it('무효 뒤 재입력이어도 취소된 팀매치는 거부한다', async () => {
    const harness = createHarness({ ...reentry, teamMatchStatus: 'cancelled' });

    expectHttp(await captureFailure(() => harness.run({ home: 1, away: 0 })), 409, 'QUICK_RESULT_FIXTURE_CANCELLED');
    expectNoWrites(harness);
  });

  it('현재 포인터가 VOID 가 아니면 재입력이 아니다', async () => {
    const harness = createHarness({ ...reentry, pointerId: null });

    expectHttp(await captureFailure(() => harness.run({ home: 1, away: 0 })), 409, 'QUICK_RESULT_NOT_AVAILABLE');
    expectNoWrites(harness);
  });

  it('대조군 — 팀매치가 completed 여도 현재 포인터가 확정본(OFFICIAL)이면 재입력이 아니라 QUICK_RESULT_NOT_AVAILABLE', async () => {
    const harness = createHarness({
      gameState: 'ENDED',
      teamMatchStatus: 'completed',
      revisions: [{ id: 'official-rev', revision: 1, state: V1GameResultRevisionState.OFFICIAL }],
      pointerId: 'official-rev',
    });

    expectHttp(await captureFailure(() => harness.run({ home: 1, away: 0 })), 409, 'QUICK_RESULT_NOT_AVAILABLE');
    expectNoWrites(harness);
  });

  it('대조군 — VOID 가 마지막 리비전이어도 그 위에 확정본이 포인터면 재입력이 아니다', async () => {
    const harness = createHarness({
      gameState: 'ENDED',
      teamMatchStatus: 'completed',
      revisions: [voided],
      pointerId: 'some-other-official',
    });

    expectHttp(await captureFailure(() => harness.run({ home: 1, away: 0 })), 409, 'QUICK_RESULT_NOT_AVAILABLE');
    expectNoWrites(harness);
  });
});

describe('quickResult — 입장 조건 거부(거부된 요청은 아무 행도 쓰지 않는다)', () => {
  const reject = async (options: HarnessOptions, status: number, code: string) => {
    const harness = createHarness(options);
    expectHttp(await captureFailure(() => harness.run({ home: 1, away: 0 })), status, code);
    expectNoWrites(harness);
  };

  it('진행 중이거나 이미 끝난 경기는 QUICK_RESULT_NOT_AVAILABLE', async () => {
    await reject({ gameState: 'LIVE' }, 409, 'QUICK_RESULT_NOT_AVAILABLE');
    // 확정 전 결과(초안·제출)가 있으면 정정·확인 화면의 몫이다.
    await reject({ revisions: [{ id: 'r1', revision: 1, state: V1GameResultRevisionState.DRAFT }] }, 409, 'QUICK_RESULT_NOT_AVAILABLE');
    await reject(
      { gameState: 'ENDED', revisions: [{ id: 'r1', revision: 1, state: V1GameResultRevisionState.SUBMITTED }] },
      409,
      'QUICK_RESULT_NOT_AVAILABLE',
    );
    // 이미 확정된 경기는 정정을 쓴다.
    await reject(
      { gameState: 'ENDED', revisions: [{ id: 'r1', revision: 1, state: V1GameResultRevisionState.OFFICIAL }], pointerId: 'r1' },
      409,
      'QUICK_RESULT_NOT_AVAILABLE',
    );
  });

  it('취소된 팀매치는 게임이 SCHEDULED 여도 QUICK_RESULT_FIXTURE_CANCELLED', async () => {
    await reject({ teamMatchStatus: 'cancelled' }, 409, 'QUICK_RESULT_FIXTURE_CANCELLED');
  });

  it('득점 기록이 하나라도 있으면 QUICK_RESULT_HAS_LIVE_RECORDS', async () => {
    await reject({ eventCount: 1 }, 409, 'QUICK_RESULT_HAS_LIVE_RECORDS');
  });

  it('한쪽 팀이라도 미정이면 QUICK_RESULT_TEAMS_REQUIRED', async () => {
    await reject({ sideTeamIds: [ids.homeTeam, null] }, 409, 'QUICK_RESULT_TEAMS_REQUIRED');
    await reject({ sideTeamIds: [null, null] }, 409, 'QUICK_RESULT_TEAMS_REQUIRED');
  });

  it('한 사이드의 출전자가 0명이면 QUICK_RESULT_ROSTER_SYNCING — 출전자 0명 확정본이 남으면 안 된다', async () => {
    await reject(
      { participants: defaultParticipants.filter((row) => row.sideId !== ids.awaySide) },
      409,
      'QUICK_RESULT_ROSTER_SYNCING',
    );
    await reject({ participants: [] }, 409, 'QUICK_RESULT_ROSTER_SYNCING');
  });

  it('그 경기의 명단 재계산 이벤트가 처리 전이면 QUICK_RESULT_ROSTER_SYNCING', async () => {
    await reject({ pendingResync: 1 }, 409, 'QUICK_RESULT_ROSTER_SYNCING');
  });

  it('입장 조건 순서 — 취소된 경기에서 팀 미정이어도 취소 코드가 먼저 나온다', async () => {
    await reject({ teamMatchStatus: 'cancelled', sideTeamIds: [null, null] }, 409, 'QUICK_RESULT_FIXTURE_CANCELLED');
  });
});


describe('quickResult — 정상 입력은 한 번에 공식 확정된다', () => {
  it('최초 입력: 초안(승계 없음) → 참가자 → 확정 순으로 쓴다', async () => {
    const harness = createHarness();

    const response = await harness.run({ home: 2, away: 1 });

    expect(response).toEqual({ gameId: ids.game, revisionId: 'quick-rev-1', version: GAME_VERSION + 1, score: { home: 2, away: 1 } });
    expect(harness.created).toHaveLength(1);
    expect(harness.created[0]).toMatchObject({
      gameId: ids.game,
      revision: 1,
      reason: QUICK_RESULT_REASON_MARKER,
      goalEvents: [],
      eventsHash: canonicalGameCommandPayloadHash([]),
      missingScorer: false,
      createdByActorType: 'USER',
      createdByUserId: ids.user,
    });
    expect(harness.created[0].score).toEqual({ home: 2, away: 1 });
    // 초안으로 만든 뒤(참가자 insert 트리거가 DRAFT 만 허용한다) 같은 행을 확정으로 올린다.
    expect(harness.created[0]).not.toHaveProperty('state');
    expect(harness.created[0]).not.toHaveProperty('supersedesId');
    expect(harness.revisionUpdates).toHaveLength(1);
    expect(harness.revisionUpdates[0].data).toMatchObject({
      state: V1GameResultRevisionState.OFFICIAL,
      submittedAt: expect.any(Date),
      officialAt: expect.any(Date),
    });
    // 확정 뒤 게임 상태·포인터·팀매치 completed·다음 경기 칸은 DB 로 관측되는 결과라 통합 스펙 7b 가 단언한다.
  });

  it('GAME_RESULT_OFFICIAL 하나만 남기고 검토 알림 대상인 GAME_RESULT_SUBMITTED 는 쓰지 않는다', async () => {
    const harness = createHarness();

    await harness.run({ home: 2, away: 1 });

    expect(harness.outbox).toHaveLength(1);
    expect(harness.outbox[0]).toMatchObject({
      businessKey: `game:${ids.game}:revision:1:officialize`,
      aggregateType: 'GAME',
      aggregateId: ids.game,
      type: 'GAME_RESULT_OFFICIAL',
      revisionId: 'quick-rev-1',
    });
  });

  it('참가자는 사이드별 최신 무효화되지 않은 라인업 리비전의 선수 전원이고 기록은 0 이다 — 옛 명단·무효화된 명단은 섞이지 않는다', async () => {
    const harness = createHarness();

    await harness.run({ home: 2, away: 1 });

    expect(harness.participantRows.map((row) => row.participantId)).toEqual(['p-home-gk', 'p-home-fw', 'p-away-gk']);
    for (const row of harness.participantRows) {
      expect(row).toMatchObject({
        resultRevisionId: 'quick-rev-1',
        started: true,
        goals: 0,
        assists: 0,
        fouls: 0,
        cards: { yellow: 0, red: 0 },
      });
    }
    expect(Object.fromEntries(harness.participantRows.map((row) => [row.participantId, row.goalkeeper]))).toEqual({
      'p-home-gk': true,
      'p-home-fw': false,
      'p-away-gk': true,
    });
  });

  it('권한 검사는 result_officialize 로, 그 경기의 대회를 대상으로 한다', async () => {
    const harness = createHarness();

    await harness.run({ home: 2, away: 1 });

    expect(harness.staffAccessInputs[0]).toMatchObject({ action: 'result_officialize', resource: { tournamentId: ids.tournament } });
  });

  it('정규 리그 경기도 같은 경로로 확정된다', async () => {
    const harness = createHarness({ source: 'league' });

    await harness.run({ home: 0, away: 0 });

    expect(harness.revisionUpdates[0].data).toMatchObject({ state: V1GameResultRevisionState.OFFICIAL });
    expect(harness.outbox.map((row) => row.type)).toEqual(['GAME_RESULT_OFFICIAL']);
  });
});


describe('quickResult — 무효(VOID) 뒤 재입력 — 쓰기', () => {
  const voided: StoredRevision = { id: 'void-rev', revision: 3, state: V1GameResultRevisionState.VOID };
  const reentry = { gameState: 'ENDED', revisions: [voided], pointerId: 'void-rev', teamMatchStatus: 'completed' } as const;

  it('VOID 리비전을 승계하는 새 리비전을 만들고, 번호는 이어서 센다', async () => {
    const harness = createHarness(reentry);

    await harness.run({ home: 0, away: 3 });

    expect(harness.created[0]).toMatchObject({ revision: 4, supersedesId: 'void-rev', reason: QUICK_RESULT_REASON_MARKER });
    expect(harness.revisionUpdates[0].data).toMatchObject({ state: V1GameResultRevisionState.OFFICIAL });
  });
});

describe('quickResult — 승부차기(킥 수는 요구하지 않는다)', () => {
  it('결선 무승부에 승부차기가 없으면 TOURNAMENT_PENALTY_REQUIRED', async () => {
    const harness = createHarness({ phase: 'semi' });

    expectHttp(await captureFailure(() => harness.run({ home: 1, away: 1 })), 409, 'TOURNAMENT_PENALTY_REQUIRED');
    expectNoWrites(harness);
  });

  it('결선 무승부 + 점수만 있는 승부차기는 저장된다 — 킥 수·선축 키 없이 정확히 그 값만', async () => {
    const harness = createHarness({ phase: 'semi' });

    const response = await harness.run({ home: 1, away: 1, penalties: { home: 5, away: 4 } });

    expect(harness.created[0].score).toEqual({ home: 1, away: 1, penalties: { home: 5, away: 4 } });
    expect(response.score).toEqual({ home: 1, away: 1, penalties: { home: 5, away: 4 } });
  });

  it('조별 경기의 무승부는 정상이고, 승부차기를 실으면 TOURNAMENT_PENALTY_NOT_ALLOWED', async () => {
    const group = createHarness({ phase: 'group', hasAdvancementEdge: false });
    await group.run({ home: 1, away: 1 });
    expect(group.created).toHaveLength(1);

    const withPenalties = createHarness({ phase: 'group', hasAdvancementEdge: false });
    expectHttp(
      await captureFailure(() => withPenalties.run({ home: 1, away: 1, penalties: { home: 5, away: 4 } })),
      409,
      'TOURNAMENT_PENALTY_NOT_ALLOWED',
    );
    expectNoWrites(withPenalties);
  });

  it('정규시간에 승부가 난 결선 경기에 승부차기를 실으면 TOURNAMENT_PENALTY_NOT_ALLOWED', async () => {
    const harness = createHarness({ phase: 'semi' });

    expectHttp(
      await captureFailure(() => harness.run({ home: 2, away: 1, penalties: { home: 5, away: 4 } })),
      409,
      'TOURNAMENT_PENALTY_NOT_ALLOWED',
    );
    expectNoWrites(harness);
  });

  it('무효 뒤 재입력은 옛 승부차기를 승계하지 않는다 — 결선 무승부는 다시 입력해야 한다', async () => {
    const harness = createHarness({
      phase: 'semi',
      gameState: 'ENDED',
      teamMatchStatus: 'completed',
      pointerId: 'void-rev',
      revisions: [
        {
          id: 'void-rev',
          revision: 2,
          state: V1GameResultRevisionState.VOID,
          score: { home: 1, away: 1, penalties: { home: 5, away: 4 } },
        },
      ],
    });

    expectHttp(await captureFailure(() => harness.run({ home: 1, away: 1 })), 409, 'TOURNAMENT_PENALTY_REQUIRED');
    expectNoWrites(harness);
  });
});

