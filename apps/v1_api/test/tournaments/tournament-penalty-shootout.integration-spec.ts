import { HttpException } from '@nestjs/common';
import {
  V1GameEventType,
  V1GameResultRevisionState,
  V1GameSideKey,
  V1GameSourceType,
  V1GameState,
} from '@prisma/client';
import { OperationAuditWriterService } from '../../src/common/audit/operation-audit-writer.service';
import { GameTakeoverService } from '../../src/games/game-takeover.service';
import { GamesService, canonicalGameCommandPayloadHash } from '../../src/games/games.service';
import type {
  GameCommandContext,
  GameRevisionMutationResult,
  GameSourceCreationInput,
} from '../../src/games/games.types';
import { PrismaService } from '../../src/prisma/prisma.service';
import { V1GameOperationsWorkerService } from '../../src/jobs/v1-game-operations-worker.service';
import { TournamentStaffAccessService } from '../../src/tournaments/staff/tournament-staff-access.service';
import { TournamentResultReviewService } from '../../src/tournament-operations/results/tournament-result-review.service';
import {
  resolveTournamentFixtureOfficialResult,
  type TournamentFixtureGameForResult,
} from '../../src/tournaments/tournament-fixture-official-result';

/**
 * 트랙 B: 결선(knockout) 경기 승부차기 기록 + 브래킷 진출 판정 반영.
 *
 *   1. 결선 픽스처에서 정규시간 무승부 + `end` 커맨드 payload.penalties로 승부차기를
 *      기록하면 저장되고(`v1_game_result_revisions.score.penalties`), officialize 이후
 *      `resolveTournamentFixtureOfficialResult()`(공개 상세/관리자 브래킷이 실제로 쓰는
 *      함수)가 hasPenalty/homePenaltyScore/awayPenaltyScore로 표면화한다.
 *   2. 같은 케이스에서 `GameResultBracketProjectionService`가 승부차기 승자를 다음 라운드
 *      픽스처에 배정한다 -- 핵심 요구사항.
 *   3. 조별리그(phase: 'group') 픽스처는 같은 `end` 커맨드로 승부차기를 기록할 수 없다
 *      (409 TOURNAMENT_PENALTY_NOT_ALLOWED, 리비전 0건, 게임 상태 롤백).
 *   4. 결선이라도 정규시간이 무승부가 아니면 승부차기를 받지 않는다(같은 코드로 거부).
 *
 * 조별 순위가 승부차기를 승패로 세지 않는다는 요구사항은 이 파일에서 다시 검증하지 않는다
 * -- (3)이 이미 "조별리그 픽스처는 애초에 승부차기를 절대 가질 수 없다"를 구조적으로
 * 증명하고, `tournament-group-standings.spec.ts`가 `standingsFixturesFromGroup()`이
 * `hasPenalty`를 아예 읽지 않는다는 것을 순수 함수 레벨에서 이미 증명했다.
 */
const ids = {
  platformOps: '86000000-0000-4000-8000-000000000001',
  sport: '86000000-0000-4000-8000-000000000010',
  region: '86000000-0000-4000-8000-000000000011',
  hostTeam: '86000000-0000-4000-8000-000000000020',
  opponentTeam: '86000000-0000-4000-8000-000000000021',
  tournament: '86000000-0000-4000-8000-000000000030',
  semiGroup: '86000000-0000-4000-8000-000000000031',
  groupPhaseGroup: '86000000-0000-4000-8000-000000000032',
  knockoutSourceFixture: '86000000-0000-4000-8000-000000000040',
  knockoutTargetFixture: '86000000-0000-4000-8000-000000000041',
  decisiveKnockoutFixture: '86000000-0000-4000-8000-000000000042',
  groupPhaseFixture: '86000000-0000-4000-8000-000000000043',
  drawKnockoutFixture: '86000000-0000-4000-8000-000000000044',
  hostRegistration: '86000000-0000-4000-8000-000000000050',
  opponentRegistration: '86000000-0000-4000-8000-000000000051',
} as const;

const prisma = new PrismaService();
const games = new GamesService(prisma, new OperationAuditWriterService(), new GameTakeoverService());
const staffAccess = new TournamentStaffAccessService(prisma);
const resultReview = new TournamentResultReviewService(prisma, staffAccess, new OperationAuditWriterService());

const authUser = (id: string) => ({
  id,
  email: `${id}@task-penalty.example.test`,
  accountStatus: 'active' as const,
  onboardingStatus: 'completed' as const,
});

function sourceContext(payload: unknown, commandId: string): GameCommandContext {
  return {
    actor: { actorType: 'USER', actorUserId: ids.platformOps, role: 'platform_ops' },
    expectedVersion: 0,
    durableCommandId: commandId,
    payloadHash: canonicalGameCommandPayloadHash(payload),
  };
}

async function captureFailure(operation: () => Promise<unknown>): Promise<unknown> {
  try {
    await operation();
  } catch (error) {
    return error;
  }
  throw new Error('Expected operation to fail');
}

function expectHttpCode(error: unknown, status: number, code: string) {
  expect(error).toBeInstanceOf(HttpException);
  const exception = error as HttpException;
  expect(exception.getStatus()).toBe(status);
  expect(exception.getResponse()).toEqual(expect.objectContaining({ code }));
}

async function grantTakeover(gameId: string, userId: string, seed: string): Promise<string> {
  const grant = await games.requestTakeover(authUser(userId), gameId, {
    clientInstanceId: `task-penalty-${seed}-client`,
    lastSequence: 0,
  });
  return grant.takeoverToken;
}

async function drainOutbox(): Promise<void> {
  const worker = new V1GameOperationsWorkerService(prisma);
  let guard = 0;
  // eslint-disable-next-line no-await-in-loop
  while (await worker.processOne()) {
    guard += 1;
    if (guard > 50) throw new Error('Task penalty outbox drain guard exceeded');
  }
}

async function buildTournamentGame(fixtureId: string): Promise<string> {
  const config = await prisma.v1CompetitionConfigVersion.findFirstOrThrow({
    where: { name: 'football-v1', status: 'ACTIVE' },
    orderBy: { version: 'desc' },
  });
  const input: GameSourceCreationInput = {
    sourceType: V1GameSourceType.TOURNAMENT_FIXTURE,
    sourceId: fixtureId,
    competitionConfigVersionId: config.id,
    sides: [
      { sideKey: V1GameSideKey.HOME, teamId: ids.hostTeam, displayNameSnapshot: 'Penalty Host' },
      { sideKey: V1GameSideKey.AWAY, teamId: ids.opponentTeam, displayNameSnapshot: 'Penalty Opponent' },
    ],
    participants: [
      { sourceParticipantId: `host-player-${fixtureId}`, sideKey: V1GameSideKey.HOME, displayNameSnapshot: 'Host Scorer' },
      { sourceParticipantId: `away-player-${fixtureId}`, sideKey: V1GameSideKey.AWAY, displayNameSnapshot: 'Away Scorer' },
    ],
  };
  const created = await prisma.$transaction((tx) =>
    games.createFromSourceInTransaction(tx, input, sourceContext(input, `task-penalty-source-${fixtureId}`)),
  );
  return created.gameId;
}

/**
 * Drives SCHEDULED -> LIVE -> ENDED with `homeGoals`/`awayGoals` attributed
 * goals, then ends with the given `end` command payload (e.g.
 * `{ penalties: { home, away } }`). Returns the `end` result so callers can
 * assert on both success and rejection paths.
 */
async function driveToEnd(
  gameId: string,
  homeGoals: number,
  awayGoals: number,
  endPayload: Record<string, unknown>,
) {
  const home = await prisma.v1GameSide.findFirstOrThrow({ where: { gameId, sideKey: V1GameSideKey.HOME } });
  const away = await prisma.v1GameSide.findFirstOrThrow({ where: { gameId, sideKey: V1GameSideKey.AWAY } });
  const homeScorer = await prisma.v1GameParticipant.findFirstOrThrow({ where: { gameId, sideId: home.id } });
  const awayScorer = await prisma.v1GameParticipant.findFirstOrThrow({ where: { gameId, sideId: away.id } });
  await prisma.v1GameLineup.updateMany({
    where: { gameId, sideId: { in: [home.id, away.id] }, revision: 1 },
    data: { state: 'SUBMITTED' },
  });
  const startToken = await grantTakeover(gameId, ids.platformOps, `start-${gameId}`);
  await games.executeCommand(authUser(ids.platformOps), gameId, 'start', `task-penalty-start-${gameId}`, {
    expectedVersion: 0,
    clientCommandId: `task-penalty-start-${gameId}`,
    takeoverToken: startToken,
    occurredAt: new Date().toISOString(),
    payload: {},
  });
  let version = 1;
  for (let i = 0; i < homeGoals; i += 1) {
    const token = await grantTakeover(gameId, ids.platformOps, `home-goal-${gameId}-${i}`);
    await games.appendEvent(authUser(ids.platformOps), gameId, `task-penalty-home-goal-${gameId}-${i}`, {
      expectedVersion: version,
      clientEventId: `task-penalty-home-goal-${gameId}-${i}`,
      takeoverToken: token,
      type: V1GameEventType.GOAL,
      sideId: home.id,
      participantId: homeScorer.id,
      period: 1,
      clockMs: 60_000 + i * 1000,
      occurredAt: new Date().toISOString(),
      payload: {},
    });
    version += 1;
  }
  for (let i = 0; i < awayGoals; i += 1) {
    const token = await grantTakeover(gameId, ids.platformOps, `away-goal-${gameId}-${i}`);
    await games.appendEvent(authUser(ids.platformOps), gameId, `task-penalty-away-goal-${gameId}-${i}`, {
      expectedVersion: version,
      clientEventId: `task-penalty-away-goal-${gameId}-${i}`,
      takeoverToken: token,
      type: V1GameEventType.GOAL,
      sideId: away.id,
      participantId: awayScorer.id,
      period: 1,
      clockMs: 70_000 + i * 1000,
      occurredAt: new Date().toISOString(),
      payload: {},
    });
    version += 1;
  }
  return endGame(gameId, version, endPayload);
}

/**
 * `end` 커맨드만 따로 보낸다.
 *
 * 종료가 거부된 뒤 "승부차기를 실어 다시 종료"하는 흐름을 `driveToEnd` 재호출로 표현하면 안 된다 —
 * 골 append 는 이미 커밋됐는데 `clientEventId` 가 경기당 고정이고 `occurredAt` 이 멱등 payload 해시에
 * 들어가므로, 두 번째 호출은 "같은 커맨드 ID, 다른 payload" 로 판정돼 409 로 죽는다(벽시계 의존이라
 * CI 에서도 동일하게 실패한다). 재시도는 골을 다시 넣지 말고 이 함수로 `end` 만 다시 보낸다.
 *
 * `attempt` 는 멱등 키를 분리한다. 거부된 첫 시도는 롤백돼 멱등 레코드를 남기지 않지만, 재시도가
 * 우연히 같은 키를 재사용하지 않도록 호출자가 명시적으로 구분한다.
 */
async function endGame(
  gameId: string,
  expectedVersion: number,
  endPayload: Record<string, unknown>,
  attempt = 1,
) {
  const key = `task-penalty-end-${gameId}-${attempt}`;
  const endToken = await grantTakeover(gameId, ids.platformOps, `end-${gameId}-${attempt}`);
  // 'end' on a TOURNAMENT_FIXTURE game always derives+submits a result
  // revision (GamesService.deriveTournamentRevision), so the union always
  // resolves to GameRevisionMutationResult here -- the generic
  // GameMutationResult branch only ever applies to start/pause/resume/
  // next-period.
  return games.executeCommand(authUser(ids.platformOps), gameId, 'end', key, {
    expectedVersion,
    clientCommandId: key,
    takeoverToken: endToken,
    occurredAt: new Date().toISOString(),
    payload: endPayload,
  }) as Promise<GameRevisionMutationResult>;
}

function previewHash(revision: { score: unknown; eventsHash: string; mvpParticipantId: string | null }): string {
  return canonicalGameCommandPayloadHash({
    score: revision.score,
    eventsHash: revision.eventsHash,
    mvpParticipantId: revision.mvpParticipantId,
  });
}

describe('Track B tournament penalty shootout', () => {
  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for the penalty shootout integration verification');
    }
    await prisma.$connect();
    await prisma.v1User.create({
      data: { id: ids.platformOps, email: 'task-penalty-0@example.test', accountStatus: 'active', onboardingStatus: 'completed' },
    });
    await prisma.v1AdminUser.create({
      data: { userId: ids.platformOps, adminRole: 'ops', status: 'active' },
    });
    await prisma.v1Sport.upsert({
      where: { code: 'football' },
      create: { id: ids.sport, code: 'football', name: 'Task Penalty Football' },
      update: {},
    });
    await prisma.v1Region.create({
      data: { id: ids.region, code: 'TASK_PENALTY_REGION', name: 'Task Penalty Region', level: 1 },
    });
    await prisma.v1Team.createMany({
      data: [
        { id: ids.hostTeam, ownerUserId: ids.platformOps, sportId: ids.sport, regionId: ids.region, name: 'Task Penalty Host' },
        { id: ids.opponentTeam, ownerUserId: ids.platformOps, sportId: ids.sport, regionId: ids.region, name: 'Task Penalty Opponent' },
      ],
    });
    await prisma.v1Tournament.create({
      data: { id: ids.tournament, sportId: ids.sport, title: 'Task Penalty tournament' },
    });
    const config = await prisma.v1CompetitionConfigVersion.findFirstOrThrow({
      where: { name: 'football-v1', status: 'ACTIVE' },
      orderBy: { version: 'desc' },
    });
    // Knockout판별의 단일 기준: V1TournamentGroup.phase. 'semi'는 결선, 'group'은
    // 조별리그 -- round 문자열(한글/영문 혼재 표시 라벨)은 절대 쓰지 않는다.
    await prisma.v1TournamentGroup.create({
      data: { id: ids.semiGroup, tournamentId: ids.tournament, name: '준결승', phase: 'semi' },
    });
    await prisma.v1TournamentGroup.create({
      data: { id: ids.groupPhaseGroup, tournamentId: ids.tournament, name: 'A조', phase: 'group' },
    });
    await prisma.v1TournamentFixture.createMany({
      data: [
        {
          id: ids.knockoutSourceFixture,
          tournamentId: ids.tournament,
          groupId: ids.semiGroup,
          round: '준결승',
          fixtureNumber: 1,
          competitionConfigVersionId: config.id,
        },
        {
          id: ids.knockoutTargetFixture,
          tournamentId: ids.tournament,
          groupId: ids.semiGroup,
          round: '결승',
          fixtureNumber: 1,
          competitionConfigVersionId: config.id,
        },
        {
          id: ids.decisiveKnockoutFixture,
          tournamentId: ids.tournament,
          groupId: ids.semiGroup,
          round: '준결승',
          fixtureNumber: 2,
          competitionConfigVersionId: config.id,
        },
        {
          id: ids.groupPhaseFixture,
          tournamentId: ids.tournament,
          groupId: ids.groupPhaseGroup,
          round: '조별리그',
          fixtureNumber: 1,
          competitionConfigVersionId: config.id,
        },
        {
          id: ids.drawKnockoutFixture,
          tournamentId: ids.tournament,
          groupId: ids.semiGroup,
          round: '준결승',
          fixtureNumber: 3,
          competitionConfigVersionId: config.id,
        },
      ],
    });
    await prisma.v1TournamentRegistration.createMany({
      data: [
        { id: ids.hostRegistration, tournamentId: ids.tournament, teamId: ids.hostTeam, appliedByUserId: ids.platformOps, status: 'confirmed' },
        { id: ids.opponentRegistration, tournamentId: ids.tournament, teamId: ids.opponentTeam, appliedByUserId: ids.platformOps, status: 'confirmed' },
      ],
    });
    for (const fixtureId of [
      ids.knockoutSourceFixture,
      ids.decisiveKnockoutFixture,
      ids.groupPhaseFixture,
      ids.drawKnockoutFixture,
    ]) {
      await prisma.v1TournamentFixture.update({
        where: { id: fixtureId },
        data: { homeRegistrationId: ids.hostRegistration, awayRegistrationId: ids.opponentRegistration },
      });
    }
    await prisma.v1TournamentFixtureAdvancementEdge.create({
      data: {
        tournamentId: ids.tournament,
        sourceFixtureId: ids.knockoutSourceFixture,
        sourceOutcome: 'WINNER',
        targetFixtureId: ids.knockoutTargetFixture,
        targetSide: 'HOME',
      },
    });
    await prisma.v1GameOperationFlag.upsert({
      where: { key: 'DIRECTOR_OFFICIALIZE' },
      create: { key: 'DIRECTOR_OFFICIALIZE', value: 'off', ownerActor: 'platform_ops' },
      update: { value: 'off' },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('결선 무승부 + 승부차기 기록 → 저장되고, 공개 응답 필드에 나오고, 브래킷 승자가 승부차기로 정해진다', async () => {
    const gameId = await buildTournamentGame(ids.knockoutSourceFixture);
    // 선축은 **원정**으로 보낸다. `end` payload 가 가공 없이 리비전 score 에 박히는지를
    // 보는 단언이므로(아래 `toEqual`), 선축을 원정으로 두면 "홈이 무조건 먼저 찬다"는
    // 하드코딩이 서버로 새어 들어오는 회귀도 같은 단언 하나가 잡는다.
    const ended = await driveToEnd(gameId, 1, 1, {
      penalties: { home: 5, away: 4, firstKickSideKey: 'AWAY' },
    });
    expect(ended.revisionState).toBe(V1GameResultRevisionState.SUBMITTED);

    const revision = await prisma.v1GameResultRevision.findUniqueOrThrow({ where: { id: ended.revisionId } });
    // `toEqual`(부분 일치가 아니다)을 유지한다 — 이 단언의 가치는 "정확히 이 키들만"에
    // 있다. `objectContaining` 으로 느슨하게 바꾸면 여분 키 유입도, 키 손실도 못 잡는다.
    expect(revision.score).toEqual({
      home: 1,
      away: 1,
      penalties: { home: 5, away: 4, firstKickSideKey: 'AWAY' },
    });

    const officialized = await resultReview.officializeResultRevision(
      authUser(ids.platformOps),
      gameId,
      revision.id,
      'task-penalty-officialize',
      { expectedVersion: ended.version, clientCommandId: 'task-penalty-officialize', projectionPreviewHash: previewHash(revision) },
    );
    expect(officialized.revisionState).toBe(V1GameResultRevisionState.OFFICIAL);
    await drainOutbox();

    // 브래킷 진출 판정: 승부차기 승자(home, 5-4)가 다음 라운드 HOME 슬롯에 배정된다.
    const target = await prisma.v1TournamentFixture.findUniqueOrThrow({ where: { id: ids.knockoutTargetFixture } });
    expect(target.homeRegistrationId).toBe(ids.hostRegistration);

    // 공개 응답 필드: resolveTournamentFixtureOfficialResult()는 공개 상세
    // (tournament-detail.presenter.ts)와 관리자 브래킷(tournament-bracket.service.ts) 둘 다
    // 실제로 쓰는 조립 함수다.
    const gameForResult = await prisma.v1Game.findUniqueOrThrow({
      where: { id: gameId },
      include: {
        sides: true,
        participants: true,
        events: true,
        currentOfficialRevision: true,
      },
    });
    const resolved = resolveTournamentFixtureOfficialResult(gameForResult as unknown as TournamentFixtureGameForResult);
    expect(resolved).not.toBeNull();
    expect(resolved?.score).toEqual({
      homeScore: 1,
      awayScore: 1,
      hasPenalty: true,
      homePenaltyScore: 5,
      awayPenaltyScore: 4,
    });
  });

  it('조별리그 경기는 같은 end 커맨드로 승부차기를 기록할 수 없다(409, 리비전 0건, 게임 상태 롤백)', async () => {
    const gameId = await buildTournamentGame(ids.groupPhaseFixture);
    const before = await prisma.v1GameResultRevision.count({ where: { gameId } });

    const rejected = await captureFailure(() => driveToEnd(gameId, 1, 1, { penalties: { home: 5, away: 4 } }));
    expectHttpCode(rejected, 409, 'TOURNAMENT_PENALTY_NOT_ALLOWED');

    expect(await prisma.v1GameResultRevision.count({ where: { gameId } })).toBe(before);
    const game = await prisma.v1Game.findUniqueOrThrow({ where: { id: gameId } });
    // The whole `end` transaction (period-close + revision) rolled back, so
    // the game never actually reached ENDED.
    expect(game.state).not.toBe(V1GameState.ENDED);
  });

  /**
   * 운영 콘솔 종료 흐름 개편 요구사항 4의 백엔드 절반. 예전엔 이 `end`가
   * 그대로 통과해 리비전이 SUBMITTED로 저장됐고, 그 뒤 비동기 브래킷
   * 프로젝션이 `resolveWinnerSide`에서 `BRACKET_RESULT_DRAW_UNSUPPORTED`를
   * 던져 outbox 잡이 재시도 끝에 POISONED로 남았다 — 운영자 화면에는
   * "종료 성공"만 보였다. 커맨드 자리에서 거부해야 그 자리에서 승부차기를
   * 입력해 복구할 수 있다.
   */
  it('결선 무승부인데 승부차기가 없으면 경기를 종료할 수 없다(409 TOURNAMENT_PENALTY_REQUIRED, 리비전 0건, 게임 상태 롤백)', async () => {
    const gameId = await buildTournamentGame(ids.drawKnockoutFixture);

    const rejected = await captureFailure(() => driveToEnd(gameId, 1, 1, {}));
    expectHttpCode(rejected, 409, 'TOURNAMENT_PENALTY_REQUIRED');

    expect(await prisma.v1GameResultRevision.count({ where: { gameId } })).toBe(0);
    const game = await prisma.v1Game.findUniqueOrThrow({ where: { id: gameId } });
    expect(game.state).not.toBe(V1GameState.ENDED);

    // 같은 경기에 승부차기 결과를 실어 다시 종료하면 정상적으로 끝난다 —
    // 거부가 막다른 길이 아니라 "입력하고 다시 오세요"라는 복구 가능한
    // 게이트라는 증거. 골은 이미 커밋돼 있으므로 다시 넣지 않고 `end` 만 재전송한다
    // (driveToEnd 를 다시 부르면 고정 clientEventId + 바뀐 occurredAt 으로 멱등 충돌).
    const ended = await endGame(gameId, game.version, { penalties: { home: 4, away: 2 } }, 2);
    expect(ended.revisionState).toBe(V1GameResultRevisionState.SUBMITTED);
  });

  it('결선이라도 정규시간이 무승부가 아니면 승부차기를 받지 않는다(409)', async () => {
    const gameId = await buildTournamentGame(ids.decisiveKnockoutFixture);
    const before = await prisma.v1GameResultRevision.count({ where: { gameId } });

    const rejected = await captureFailure(() => driveToEnd(gameId, 2, 1, { penalties: { home: 5, away: 4 } }));
    expectHttpCode(rejected, 409, 'TOURNAMENT_PENALTY_NOT_ALLOWED');

    expect(await prisma.v1GameResultRevision.count({ where: { gameId } })).toBe(before);
  });
});
