import { HttpException } from '@nestjs/common';
import { V1GameEventType, V1GamePeriodState, V1GameSideKey, V1GameSourceType } from '@prisma/client';
import { OperationAuditWriterService } from '../../src/common/audit/operation-audit-writer.service';
import { GameTakeoverService } from '../../src/games/game-takeover.service';
import { GamesService, canonicalGameCommandPayloadHash } from '../../src/games/games.service';
import type {
  GameActorScope,
  GameCommandContext,
  GameSourceCreationInput,
} from '../../src/games/games.types';
import { PrismaService } from '../../src/prisma/prisma.service';

// Task T1-1 follow-up: game-team-match-score-invariant.integration-spec.ts
// proves the TEAM_MATCH-with-zero-events exemption in game-invariants.ts
// (a submitted score is authoritative when no V1GameEvent rows exist). That
// spec's own comment flags the opposite boundary as untested: once a team
// match DOES carry real events (now possible after Task T1-1 opened
// event_append to the host), the submitted score must agree with them. This
// spec closes that gap end to end through the real service.
const ids = {
  hostOwner: '89000000-0000-4000-8000-000000000001',
  hostManager: '89000000-0000-4000-8000-000000000002',
  opponentOwner: '89000000-0000-4000-8000-000000000003',
  sport: '89000000-0000-4000-8000-000000000010',
  region: '89000000-0000-4000-8000-000000000011',
  hostTeam: '89000000-0000-4000-8000-000000000020',
  opponentTeam: '89000000-0000-4000-8000-000000000021',
  teamMatch: '89000000-0000-4000-8000-000000000030',
} as const;

const prisma = new PrismaService();
const service = new GamesService(prisma, new OperationAuditWriterService(), new GameTakeoverService());

const authUser = (id: string) => ({
  id,
  email: `${id}@task-t1-1-mismatch.example.test`,
  accountStatus: 'active' as const,
  onboardingStatus: 'completed' as const,
});

function context(actor: GameActorScope, commandId: string, payload: unknown): GameCommandContext {
  return {
    actor,
    expectedVersion: 0,
    durableCommandId: commandId,
    payloadHash: canonicalGameCommandPayloadHash(payload),
  };
}

function expectHttpCode(error: unknown, status: number, code: string) {
  expect(error).toBeInstanceOf(HttpException);
  const exception = error as HttpException;
  expect(exception.getStatus()).toBe(status);
  expect(exception.getResponse()).toEqual(expect.objectContaining({ code }));
}

async function captureFailure(operation: () => Promise<unknown>): Promise<unknown> {
  try {
    await operation();
  } catch (error) {
    return error;
  }
  throw new Error('Expected operation to fail');
}

describe('Task T1-1 team-match SCORE_EVENT_MISMATCH once real events exist', () => {
  let configId: string;
  let gameId: string;
  let hostSideId: string;
  let awaySideId: string;
  let hostOneId: string;
  let hostTwoId: string;
  let awayOneId: string;

  async function currentVersion(): Promise<number> {
    return (await prisma.v1Game.findUniqueOrThrow({ where: { id: gameId }, select: { version: true } })).version;
  }

  async function recordGoal(clientEventId: string, sideId: string, participantId: string) {
    const version = await currentVersion();
    return service.appendEvent(authUser(ids.hostManager), gameId, clientEventId, {
      expectedVersion: version,
      clientEventId,
      takeoverToken: 'n/a',
      type: V1GameEventType.GOAL,
      sideId,
      participantId,
      period: 1,
      clockMs: 30_000,
      occurredAt: new Date().toISOString(),
      payload: {},
    });
  }

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for T1-1 integration verification');
    }
    await prisma.$connect();
    const config = await prisma.v1CompetitionConfigVersion.findFirst({
      where: { name: 'football-v1', status: 'ACTIVE' },
      orderBy: { version: 'desc' },
    });
    if (config === null) {
      throw new Error('Task 11 football-v1 preset is required');
    }
    configId = config.id;
    await prisma.v1User.createMany({
      data: [ids.hostOwner, ids.hostManager, ids.opponentOwner].map((id, index) => ({
        id,
        email: `task-t1-1-mismatch-${index}@example.test`,
        accountStatus: 'active',
        onboardingStatus: 'completed',
      })),
    });
    await prisma.v1Sport.create({ data: { id: ids.sport, code: 'football', name: 'T1-1 Mismatch Football' } });
    await prisma.v1Region.create({
      data: { id: ids.region, code: 'T1_1_MISMATCH_REGION', name: 'T1-1 Mismatch Region', level: 1 },
    });
    await prisma.v1Team.createMany({
      data: [
        { id: ids.hostTeam, ownerUserId: ids.hostOwner, sportId: ids.sport, regionId: ids.region, name: 'T1-1 Mismatch Host' },
        { id: ids.opponentTeam, ownerUserId: ids.opponentOwner, sportId: ids.sport, regionId: ids.region, name: 'T1-1 Mismatch Opponent' },
      ],
    });
    await prisma.v1TeamMembership.createMany({
      data: [
        { teamId: ids.hostTeam, userId: ids.hostOwner, role: 'owner', status: 'active' },
        { teamId: ids.hostTeam, userId: ids.hostManager, role: 'manager', status: 'active' },
        { teamId: ids.opponentTeam, userId: ids.opponentOwner, role: 'owner', status: 'active' },
      ],
    });
    await prisma.v1TeamMatch.create({
      data: {
        id: ids.teamMatch,
        hostTeamId: ids.hostTeam,
        createdByUserId: ids.hostOwner,
        sportId: ids.sport,
        regionId: ids.region,
        title: 'T1-1 mismatch team match',
        placeName: 'T1-1 mismatch ground',
        startAt: new Date('2026-08-21T00:00:00.000Z'),
        status: 'matched' as const,
        approvedApplicantTeamId: ids.opponentTeam,
        competitionConfigVersionId: configId,
      },
    });

    const input: GameSourceCreationInput = {
      sourceType: V1GameSourceType.TEAM_MATCH,
      sourceId: ids.teamMatch,
      competitionConfigVersionId: configId,
      sides: [
        { sideKey: V1GameSideKey.HOME, teamId: ids.hostTeam, displayNameSnapshot: 'T1-1 Mismatch Host' },
        { sideKey: V1GameSideKey.AWAY, teamId: ids.opponentTeam, displayNameSnapshot: 'T1-1 Mismatch Opponent' },
      ],
      participants: [
        { sourceParticipantId: 'host-1', sideKey: V1GameSideKey.HOME, displayNameSnapshot: 'T1-1 Mismatch Host One' },
        { sourceParticipantId: 'host-2', sideKey: V1GameSideKey.HOME, displayNameSnapshot: 'T1-1 Mismatch Host Two' },
        { sourceParticipantId: 'away-1', sideKey: V1GameSideKey.AWAY, displayNameSnapshot: 'T1-1 Mismatch Away One' },
      ],
    };
    const actor: GameActorScope = { actorType: 'USER', actorUserId: ids.hostOwner, role: 'team_owner', teamId: ids.hostTeam };
    const created = await prisma.$transaction((tx) =>
      service.createFromSourceInTransaction(tx, input, context(actor, 't1-1-mismatch-source-create', input)),
    );
    gameId = created.gameId;
    hostSideId = (await prisma.v1GameSide.findFirstOrThrow({ where: { gameId, sideKey: V1GameSideKey.HOME } })).id;
    awaySideId = (await prisma.v1GameSide.findFirstOrThrow({ where: { gameId, sideKey: V1GameSideKey.AWAY } })).id;
    const participants = await prisma.v1GameParticipant.findMany({ where: { gameId } });
    hostOneId = participants.find((p) => p.displayNameSnapshot === 'T1-1 Mismatch Host One')!.id;
    hostTwoId = participants.find((p) => p.displayNameSnapshot === 'T1-1 Mismatch Host Two')!.id;
    awayOneId = participants.find((p) => p.displayNameSnapshot === 'T1-1 Mismatch Away One')!.id;

    // T1-0 made "a LIVE period exists" a precondition of appendEvent; see the
    // matching comment in game-team-match-event-authority.integration-spec.ts
    // for why this is set directly instead of through the command layer.
    await prisma.v1GamePeriod.updateMany({
      where: { gameId, number: 1 },
      data: { state: V1GamePeriodState.LIVE, startedAt: new Date() },
    });

    // Real recorded score: HOME 2 (both by host-1), AWAY 1.
    await recordGoal('t1-1-mismatch-goal-1', hostSideId, hostOneId);
    await recordGoal('t1-1-mismatch-goal-2', hostSideId, hostOneId);
    await recordGoal('t1-1-mismatch-goal-3', awaySideId, awayOneId);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('rejects a submitted score that contradicts the real recorded GOAL events with 422 SCORE_EVENT_MISMATCH', async () => {
    const revisionCountBefore = await prisma.v1GameResultRevision.count({ where: { gameId } });
    const version = await currentVersion();
    const mismatch = await captureFailure(() =>
      service.createResultRevision(authUser(ids.hostManager), gameId, 't1-1-mismatch-draft', {
        expectedVersion: version,
        clientCommandId: 't1-1-mismatch-draft',
        score: { home: 3, away: 1 },
        actualParticipants: [
          { participantId: hostOneId, sideId: hostSideId, started: true, goals: 3, cards: { yellow: 0, red: 0 }, goalkeeper: false },
          { participantId: hostTwoId, sideId: hostSideId, started: true, goals: 0, cards: { yellow: 0, red: 0 }, goalkeeper: false },
          { participantId: awayOneId, sideId: awaySideId, started: true, goals: 1, cards: { yellow: 0, red: 0 }, goalkeeper: false },
        ],
        eventsHash: 't1-1-mismatch-events',
      }),
    );
    expectHttpCode(mismatch, 422, 'SCORE_EVENT_MISMATCH');
    expect(await prisma.v1GameResultRevision.count({ where: { gameId } })).toBe(revisionCountBefore);
  });

  /**
   * 이 케이스는 두 가지를 함께 본다 — 한 번의 제출이 저장하는 것 전부이기 때문이다:
   *   ① 이벤트와 일치하는 스코어는 통과하고 득점이 그대로 저장된다
   *   ② **`started` 는 DTO 값을 무시하고 전부 true 다** (정본 §3: 명단 = 출전자.
   *      결과 행이 있다는 것 자체가 "뛰었다" 이므로 후보 개념이 없다)
   *
   * ②를 여기 붙인 이유: 게임 하나에 DRAFT 리비전은 동시에 하나뿐이라 별도 테스트로
   * 두 번째 리비전을 만들 수 없다(RESULT_REVISION_ALREADY_EXISTS). 그리고 DTO 에
   * `started: false` 를 실어야 "값을 실었나 / true 로 고정했나" 가 갈린다 — 이 파일의
   * 다른 케이스처럼 true 를 보내면 두 구현이 같은 결과를 내서 아무것도 증명하지 못한다
   * (실측: 고정을 되돌리는 변이가 유닛 43건 전부 green 이었다).
   */
  it('이벤트와 일치하는 스코어를 받고, started 는 DTO 값을 무시해 전부 true 로 저장한다', async () => {
    const version = await currentVersion();
    const draft = await service.createResultRevision(authUser(ids.hostManager), gameId, 't1-1-match-draft', {
      expectedVersion: version,
      clientCommandId: 't1-1-match-draft',
      score: { home: 2, away: 1 },
      actualParticipants: [
        // 옛 클라이언트가 "후보" 라고 보내는 모양 — 저장은 출전자로 한다.
        { participantId: hostOneId, sideId: hostSideId, started: false, goals: 2, cards: { yellow: 0, red: 0 }, goalkeeper: false },
        { participantId: hostTwoId, sideId: hostSideId, started: false, goals: 0, cards: { yellow: 0, red: 0 }, goalkeeper: false },
        { participantId: awayOneId, sideId: awaySideId, started: false, goals: 1, cards: { yellow: 0, red: 0 }, goalkeeper: false },
      ],
      eventsHash: 't1-1-match-events',
    });
    expect(draft.revisionState).toBe('DRAFT');
    const persisted = await prisma.v1GameResultParticipant.findMany({ where: { resultRevisionId: draft.revisionId } });
    expect(persisted.find((p) => p.participantId === hostOneId)?.goals).toBe(2);
    expect(persisted).toHaveLength(3);
    expect(persisted.map((row) => row.started)).toEqual([true, true, true]);
  });

});