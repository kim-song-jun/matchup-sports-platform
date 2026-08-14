import { HttpException } from '@nestjs/common';
import { V1GameEventType, V1GameSideKey, V1GameSourceType, V1GameState } from '@prisma/client';
import { OperationAuditWriterService } from '../../src/common/audit/operation-audit-writer.service';
import { GameTakeoverService } from '../../src/games/game-takeover.service';
import { GamesService, canonicalGameCommandPayloadHash } from '../../src/games/games.service';
import type {
  GameActorScope,
  GameCommandContext,
  GameSourceCreationInput,
} from '../../src/games/games.types';
import { PrismaService } from '../../src/prisma/prisma.service';

/**
 * 이슈 #375 — "전반 종료"를 누르면 곧장 후반이 시작되고 전반 상태로 되돌릴
 * 수 없던 문제의 수정 검증. 구 `next-period`(fused 종료+시작)는
 * `game-period-lifecycle.integration-spec.ts`가 여전히 그대로 검증하고
 * 있고(배포 호환용으로 동작을 절대 바꾸지 않았다 — advancePeriod의
 * @deprecated 문서 참고), 이 파일은 새로 분리된 `end-period`/`start-period`
 * 와 신설된 `revert-period`만 다룬다.
 */
const ids = {
  director: '66000000-0000-4000-8000-000000000001',
  sport: '66000000-0000-4000-8000-000000000010',
  region: '66000000-0000-4000-8000-000000000011',
  hostTeam: '66000000-0000-4000-8000-000000000020',
  opponentTeam: '66000000-0000-4000-8000-000000000021',
  tournament: '66000000-0000-4000-8000-000000000030',
  fixture: '66000000-0000-4000-8000-000000000040',
  fixtureHalftimeEnd: '66000000-0000-4000-8000-000000000041',
  fixtureFinalPeriodEnd: '66000000-0000-4000-8000-000000000042',
} as const;

const prisma = new PrismaService();
const service = new GamesService(prisma, new OperationAuditWriterService(), new GameTakeoverService());

const authUser = (id: string) => ({
  id,
  email: `${id}@issue-375.example.test`,
  accountStatus: 'active' as const,
  onboardingStatus: 'completed' as const,
});

function sourceContext(actor: GameActorScope, commandId: string, payload: unknown): GameCommandContext {
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

describe('이슈 #375 — end-period/start-period/revert-period drive an observable HALFTIME state', () => {
  let configId: string;
  let gameId: string;
  let homeSideId: string;
  let homeParticipantId: string;
  let takeoverToken: string;
  let version: number;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for the issue-375 halftime integration suite');
    }
    await prisma.$connect();
    const config = await prisma.v1CompetitionConfigVersion.findFirst({
      where: { name: 'football-v1', status: 'ACTIVE' },
      orderBy: { version: 'desc' },
    });
    if (config === null) {
      throw new Error('The migrated football-v1 competition preset is required');
    }
    configId = config.id;

    await prisma.v1User.create({
      data: {
        id: ids.director,
        email: 'issue-375-director@example.test',
        accountStatus: 'active',
        onboardingStatus: 'completed',
      },
    });
    await prisma.v1Sport.create({ data: { id: ids.sport, code: 'football', name: 'Issue 375 Football' } });
    await prisma.v1Region.create({
      data: { id: ids.region, code: 'ISSUE_375_REGION', name: 'Issue 375 Region', level: 1 },
    });
    await prisma.v1Team.createMany({
      data: [
        { id: ids.hostTeam, ownerUserId: ids.director, sportId: ids.sport, regionId: ids.region, name: 'Issue 375 Host' },
        {
          id: ids.opponentTeam,
          ownerUserId: ids.director,
          sportId: ids.sport,
          regionId: ids.region,
          name: 'Issue 375 Opponent',
        },
      ],
    });
    await prisma.v1Tournament.create({
      data: { id: ids.tournament, sportId: ids.sport, title: 'Issue 375 tournament', competitionConfigVersionId: configId },
    });
    await prisma.v1TournamentFixture.create({
      data: {
        id: ids.fixture,
        tournamentId: ids.tournament,
        round: 'group',
        fixtureNumber: 1,
        competitionConfigVersionId: configId,
      },
    });
    await prisma.v1TournamentStaffAssignment.create({
      data: {
        tournamentId: ids.tournament,
        userId: ids.director,
        role: 'TOURNAMENT_DIRECTOR',
        grantedByUserId: ids.director,
      },
    });

    const input: GameSourceCreationInput = {
      sourceType: V1GameSourceType.TOURNAMENT_FIXTURE,
      sourceId: ids.fixture,
      competitionConfigVersionId: configId,
      sides: [
        { sideKey: V1GameSideKey.HOME, teamId: ids.hostTeam, displayNameSnapshot: 'Issue 375 Host' },
        { sideKey: V1GameSideKey.AWAY, teamId: ids.opponentTeam, displayNameSnapshot: 'Issue 375 Opponent' },
      ],
      participants: [
        { sourceParticipantId: 'issue-375-home-player-1', sideKey: V1GameSideKey.HOME, displayNameSnapshot: 'Issue 375 Scorer' },
      ],
    };
    const actor: GameActorScope = {
      actorType: 'USER',
      actorUserId: ids.director,
      role: 'tournament_director',
      tournamentId: ids.tournament,
      fixtureId: ids.fixture,
    };
    const created = await prisma.$transaction((tx) =>
      service.createFromSourceInTransaction(tx, input, sourceContext(actor, 'issue-375-create', input)),
    );
    gameId = created.gameId;
    const home = await prisma.v1GameSide.findFirstOrThrow({ where: { gameId, sideKey: V1GameSideKey.HOME } });
    homeSideId = home.id;
    const homeParticipant = await prisma.v1GameParticipant.findFirstOrThrow({ where: { gameId, sideId: home.id } });
    homeParticipantId = homeParticipant.id;
    await prisma.v1GameLineup.updateMany({
      where: { gameId, revision: 1 },
      data: { state: 'SUBMITTED' },
    });
    takeoverToken = (
      await service.requestTakeover(authUser(ids.director), gameId, { clientInstanceId: 'issue-375-client', lastSequence: 0 })
    ).takeoverToken;

    await service.executeCommand(authUser(ids.director), gameId, 'start', 'issue-375-start', {
      expectedVersion: 0,
      clientCommandId: 'issue-375-start',
      takeoverToken,
      occurredAt: new Date().toISOString(),
      payload: {},
    });
    version = 1;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('end-period closes period 1 without starting period 2 — HALFTIME is an observable state with no LIVE period, and the command replays idempotently', async () => {
    const dto = {
      expectedVersion: version,
      clientCommandId: 'issue-375-end-period',
      takeoverToken,
      occurredAt: new Date().toISOString(),
      payload: {},
    };
    const result = await service.executeCommand(
      authUser(ids.director),
      gameId,
      'end-period',
      'issue-375-end-period',
      dto,
    );
    version = result.version;

    const periods = await prisma.v1GamePeriod.findMany({ where: { gameId }, orderBy: { number: 'asc' } });
    expect(periods[0]).toEqual(expect.objectContaining({ number: 1, state: 'ENDED' }));
    expect(periods[0].endedAt).not.toBeNull();
    expect(periods[1]).toEqual(expect.objectContaining({ number: 2, state: 'HALFTIME', startedAt: null }));
    // 요건의 핵심 관측: 하프타임 도중 "어떤 피리어드도 LIVE가 아니다".
    expect(periods.some((period) => period.state === 'LIVE')).toBe(false);
    // 게임 자체는 여전히 LIVE다 — HALFTIME은 피리어드 상태이지 게임 상태가
    // 아니다(운영 보드는 계속 "진행 중"으로 정확히 표시한다).
    expect(result.state).toBe(V1GameState.LIVE);

    // 같은 Idempotency-Key로 재호출해도 중복 적용되지 않는다.
    const replay = await service.executeCommand(
      authUser(ids.director),
      gameId,
      'end-period',
      'issue-375-end-period',
      dto,
    );
    expect(replay).toEqual({ ...result, replayed: true });
    const periodsAfterReplay = await prisma.v1GamePeriod.findMany({ where: { gameId }, orderBy: { number: 'asc' } });
    expect(periodsAfterReplay).toEqual(periods);
  });

  it('rejects an event on the HALFTIME period (409 PERIOD_NOT_STARTED) — it has not actually started yet', async () => {
    const rejected = await captureFailure(() =>
      service.appendEvent(authUser(ids.director), gameId, 'issue-375-event-during-halftime', {
        expectedVersion: version,
        clientEventId: 'issue-375-event-during-halftime',
        takeoverToken,
        type: V1GameEventType.GOAL,
        sideId: homeSideId,
        participantId: homeParticipantId,
        period: 2,
        clockMs: 0,
        occurredAt: new Date().toISOString(),
        payload: {},
      }),
    );
    expectHttpCode(rejected, 409, 'PERIOD_NOT_STARTED');
  });

  it('rejects pause during HALFTIME (409 PERIOD_NOT_STARTED) — there is no LIVE period to pause', async () => {
    const rejected = await captureFailure(() =>
      service.executeCommand(authUser(ids.director), gameId, 'pause', 'issue-375-pause-during-halftime', {
        expectedVersion: version,
        clientCommandId: 'issue-375-pause-during-halftime',
        takeoverToken,
        occurredAt: new Date().toISOString(),
        payload: {},
      }),
    );
    expectHttpCode(rejected, 409, 'PERIOD_NOT_STARTED');
    // 실패한 시도가 game.version을 소비하지 않았는지 확인 — 다음 단계의
    // expectedVersion 계산이 이 테스트의 성패에 좌우되지 않게 한다.
    const game = await prisma.v1Game.findUniqueOrThrow({ where: { id: gameId } });
    expect(game.version).toBe(version);
  });

  it('start-period opens period 2 LIVE from HALFTIME', async () => {
    const result = await service.executeCommand(authUser(ids.director), gameId, 'start-period', 'issue-375-start-period', {
      expectedVersion: version,
      clientCommandId: 'issue-375-start-period',
      takeoverToken,
      occurredAt: new Date().toISOString(),
      payload: {},
    });
    version = result.version;

    const periods = await prisma.v1GamePeriod.findMany({ where: { gameId }, orderBy: { number: 'asc' } });
    expect(periods[0]).toEqual(expect.objectContaining({ number: 1, state: 'ENDED' }));
    expect(periods[1]).toEqual(expect.objectContaining({ number: 2, state: 'LIVE' }));
    expect(periods[1].startedAt).not.toBeNull();
  });

  it('revert-period restores period 1 to LIVE and period 2 fully back to not-yet-started (SCHEDULED, startedAt null) — no events were recorded yet', async () => {
    const result = await service.executeCommand(authUser(ids.director), gameId, 'revert-period', 'issue-375-revert-1', {
      expectedVersion: version,
      clientCommandId: 'issue-375-revert-1',
      takeoverToken,
      occurredAt: new Date().toISOString(),
      payload: {},
    });
    version = result.version;

    const periods = await prisma.v1GamePeriod.findMany({ where: { gameId }, orderBy: { number: 'asc' } });
    expect(periods[0]).toEqual(expect.objectContaining({ number: 1, state: 'LIVE', endedAt: null }));
    expect(periods[0].startedAt).not.toBeNull();
    // 되돌리기는 하프타임을 거쳐온 흔적(HALFTIME)이 아니라 애초에
    // 시작조차 안 했던 상태(SCHEDULED)로 완전히 복구한다.
    expect(periods[1]).toEqual(
      expect.objectContaining({ number: 2, state: 'SCHEDULED', startedAt: null, pausedTotalMs: 0, pausedAt: null }),
    );
  });

  it('rejects revert-period once the next period has a recorded event (409 PERIOD_REVERT_HAS_EVENTS) — this is the data-integrity gate', async () => {
    // 다시 하프타임 → 후반 시작까지 재현한다(직전 테스트가 전반으로 되돌려
    // 놨으므로).
    const endAgain = await service.executeCommand(authUser(ids.director), gameId, 'end-period', 'issue-375-end-period-2', {
      expectedVersion: version,
      clientCommandId: 'issue-375-end-period-2',
      takeoverToken,
      occurredAt: new Date().toISOString(),
      payload: {},
    });
    version = endAgain.version;
    const startAgain = await service.executeCommand(authUser(ids.director), gameId, 'start-period', 'issue-375-start-period-2', {
      expectedVersion: version,
      clientCommandId: 'issue-375-start-period-2',
      takeoverToken,
      occurredAt: new Date().toISOString(),
      payload: {},
    });
    version = startAgain.version;

    const goal = await service.appendEvent(authUser(ids.director), gameId, 'issue-375-goal-period-2', {
      expectedVersion: version,
      clientEventId: 'issue-375-goal-period-2',
      takeoverToken,
      type: V1GameEventType.GOAL,
      sideId: homeSideId,
      participantId: homeParticipantId,
      period: 2,
      clockMs: 1000,
      occurredAt: new Date().toISOString(),
      payload: {},
    });
    version = goal.version;

    const rejected = await captureFailure(() =>
      service.executeCommand(authUser(ids.director), gameId, 'revert-period', 'issue-375-revert-blocked', {
        expectedVersion: version,
        clientCommandId: 'issue-375-revert-blocked',
        takeoverToken,
        occurredAt: new Date().toISOString(),
        payload: {},
      }),
    );
    expectHttpCode(rejected, 409, 'PERIOD_REVERT_HAS_EVENTS');

    // 거부된 시도가 실제로 아무것도 바꾸지 않았는지 확인 — 피리어드 2는
    // 여전히 LIVE이고 기록된 골도 그대로다(reject 자체가 부작용 없이
    // 순수하게 실패했는지).
    const periods = await prisma.v1GamePeriod.findMany({ where: { gameId }, orderBy: { number: 'asc' } });
    expect(periods[1]).toEqual(expect.objectContaining({ number: 2, state: 'LIVE' }));
    const events = await prisma.v1GameEvent.findMany({ where: { gameId, period: 2 } });
    expect(events).toHaveLength(1);
  });
});

describe('이슈 #375 — 경기 종료가 하프타임 도중에도 다음 피리어드를 영원히 HALFTIME으로 남기지 않는다', () => {
  let configId: string;
  let gameId: string;
  let takeoverToken: string;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for the issue-375 halftime integration suite');
    }
    await prisma.$connect();
    const config = await prisma.v1CompetitionConfigVersion.findFirst({
      where: { name: 'football-v1', status: 'ACTIVE' },
      orderBy: { version: 'desc' },
    });
    if (config === null) {
      throw new Error('The migrated football-v1 competition preset is required');
    }
    configId = config.id;

    await prisma.v1TournamentFixture.create({
      data: {
        id: ids.fixtureHalftimeEnd,
        tournamentId: ids.tournament,
        round: 'group',
        fixtureNumber: 2,
        competitionConfigVersionId: configId,
      },
    });

    const input: GameSourceCreationInput = {
      sourceType: V1GameSourceType.TOURNAMENT_FIXTURE,
      sourceId: ids.fixtureHalftimeEnd,
      competitionConfigVersionId: configId,
      sides: [
        { sideKey: V1GameSideKey.HOME, teamId: ids.hostTeam, displayNameSnapshot: 'Issue 375 Host' },
        { sideKey: V1GameSideKey.AWAY, teamId: ids.opponentTeam, displayNameSnapshot: 'Issue 375 Opponent' },
      ],
      participants: [],
    };
    const actor: GameActorScope = {
      actorType: 'USER',
      actorUserId: ids.director,
      role: 'tournament_director',
      tournamentId: ids.tournament,
      fixtureId: ids.fixtureHalftimeEnd,
    };
    const created = await prisma.$transaction((tx) =>
      service.createFromSourceInTransaction(tx, input, sourceContext(actor, 'issue-375-create-2', input)),
    );
    gameId = created.gameId;
    await prisma.v1GameLineup.updateMany({
      where: { gameId, revision: 1 },
      data: { state: 'SUBMITTED' },
    });
    takeoverToken = (
      await service.requestTakeover(authUser(ids.director), gameId, { clientInstanceId: 'issue-375-client-2', lastSequence: 0 })
    ).takeoverToken;

    await service.executeCommand(authUser(ids.director), gameId, 'start', 'issue-375-start-2', {
      expectedVersion: 0,
      clientCommandId: 'issue-375-start-2',
      takeoverToken,
      occurredAt: new Date().toISOString(),
      payload: {},
    });
    await service.executeCommand(authUser(ids.director), gameId, 'end-period', 'issue-375-end-period-halftime-end', {
      expectedVersion: 1,
      clientCommandId: 'issue-375-end-period-halftime-end',
      takeoverToken,
      occurredAt: new Date().toISOString(),
      payload: {},
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('경기 종료를 누르면 HALFTIME이던 피리어드도 ENDED로 닫힌다', async () => {
    await service.executeCommand(authUser(ids.director), gameId, 'end', 'issue-375-end-during-halftime', {
      expectedVersion: 2,
      clientCommandId: 'issue-375-end-during-halftime',
      takeoverToken,
      occurredAt: new Date().toISOString(),
      payload: {},
    });

    const periods = await prisma.v1GamePeriod.findMany({ where: { gameId }, orderBy: { number: 'asc' } });
    expect(periods.every((period) => period.state === 'ENDED' && period.endedAt !== null)).toBe(true);
  });
});

/**
 * 운영 콘솔 종료 흐름 개편(사용자 결정: 후반 종료 → 승부차기 → 경기 종료) —
 * `end-period`가 마지막 피리어드에서 `NO_NEXT_PERIOD` 409로 거부되던 것을
 * 풀었다. 이 스위트가 못박는 계약은 두 가지다.
 *   1. 마지막 피리어드도 `end-period`로 닫힌다 — 승격시킬 다음 피리어드가
 *      없으므로 HALFTIME 피리어드는 생기지 않고, 게임은 여전히 LIVE다.
 *   2. **그 단계는 결과를 확정하지 않는다** — 결과 리비전(SUBMITTED)과
 *      `GAME_RESULT_SUBMITTED` outbox는 여전히 `end`에서만 만들어진다.
 *      이게 깨지면 "후반은 끝났지만 결과는 확정 전"이라는 중간 단계 자체가
 *      의미를 잃고(승부차기를 입력할 자리가 사라진다) 예전 한-트랜잭션
 *      동작으로 되돌아간다.
 */
describe('정규 시간 종료 — 마지막 피리어드도 end-period로 닫고, 결과는 아직 만들지 않는다', () => {
  let gameId: string;
  let takeoverToken: string;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for the final-period end integration suite');
    }
    await prisma.$connect();
    const config = await prisma.v1CompetitionConfigVersion.findFirstOrThrow({
      where: { name: 'football-v1', status: 'ACTIVE' },
      orderBy: { version: 'desc' },
    });

    await prisma.v1TournamentFixture.create({
      data: {
        id: ids.fixtureFinalPeriodEnd,
        tournamentId: ids.tournament,
        round: 'group',
        fixtureNumber: 3,
        competitionConfigVersionId: config.id,
      },
    });

    const input: GameSourceCreationInput = {
      sourceType: V1GameSourceType.TOURNAMENT_FIXTURE,
      sourceId: ids.fixtureFinalPeriodEnd,
      competitionConfigVersionId: config.id,
      sides: [
        { sideKey: V1GameSideKey.HOME, teamId: ids.hostTeam, displayNameSnapshot: 'Issue 375 Host' },
        { sideKey: V1GameSideKey.AWAY, teamId: ids.opponentTeam, displayNameSnapshot: 'Issue 375 Opponent' },
      ],
      participants: [],
    };
    const actor: GameActorScope = {
      actorType: 'USER',
      actorUserId: ids.director,
      role: 'tournament_director',
      tournamentId: ids.tournament,
      fixtureId: ids.fixtureFinalPeriodEnd,
    };
    const created = await prisma.$transaction((tx) =>
      service.createFromSourceInTransaction(tx, input, sourceContext(actor, 'final-period-create', input)),
    );
    gameId = created.gameId;
    await prisma.v1GameLineup.updateMany({ where: { gameId, revision: 1 }, data: { state: 'SUBMITTED' } });
    takeoverToken = (
      await service.requestTakeover(authUser(ids.director), gameId, {
        clientInstanceId: 'final-period-client',
        lastSequence: 0,
      })
    ).takeoverToken;

    // SCHEDULED → LIVE(피리어드 1) → 전반 종료 → 후반 시작: 마지막
    // 피리어드가 LIVE인 상태까지 몰고 간다.
    await service.executeCommand(authUser(ids.director), gameId, 'start', 'final-period-start', {
      expectedVersion: 0,
      clientCommandId: 'final-period-start',
      takeoverToken,
      occurredAt: new Date().toISOString(),
      payload: {},
    });
    await service.executeCommand(authUser(ids.director), gameId, 'end-period', 'final-period-end-1', {
      expectedVersion: 1,
      clientCommandId: 'final-period-end-1',
      takeoverToken,
      occurredAt: new Date().toISOString(),
      payload: {},
    });
    await service.executeCommand(authUser(ids.director), gameId, 'start-period', 'final-period-start-2', {
      expectedVersion: 2,
      clientCommandId: 'final-period-start-2',
      takeoverToken,
      occurredAt: new Date().toISOString(),
      payload: {},
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('마지막 피리어드를 end-period로 닫으면 HALFTIME 없이 전부 ENDED가 되고, 결과 리비전은 아직 생기지 않는다', async () => {
    const result = await service.executeCommand(authUser(ids.director), gameId, 'end-period', 'final-period-end-2', {
      expectedVersion: 3,
      clientCommandId: 'final-period-end-2',
      takeoverToken,
      occurredAt: new Date().toISOString(),
      payload: {},
    });

    expect(result.state).toBe(V1GameState.LIVE);
    const periods = await prisma.v1GamePeriod.findMany({ where: { gameId }, orderBy: { number: 'asc' } });
    expect(periods.every((period) => period.state === 'ENDED' && period.endedAt !== null)).toBe(true);
    expect(periods.some((period) => period.state === 'HALFTIME')).toBe(false);
    // 중간 단계의 정의 그 자체: 결과는 아직 없다.
    expect(await prisma.v1GameResultRevision.count({ where: { gameId } })).toBe(0);

    // 그다음 `end`가 비로소 결과를 만든다 — 이미 ENDED인 피리어드에는
    // no-op이므로 한 번에 끝냈을 때와 결과가 같다.
    const ended = await service.executeCommand(authUser(ids.director), gameId, 'end', 'final-period-game-end', {
      expectedVersion: result.version,
      clientCommandId: 'final-period-game-end',
      takeoverToken,
      occurredAt: new Date().toISOString(),
      payload: {},
    });
    expect(ended.state).toBe(V1GameState.ENDED);
    expect(await prisma.v1GameResultRevision.count({ where: { gameId } })).toBe(1);
  });
});
