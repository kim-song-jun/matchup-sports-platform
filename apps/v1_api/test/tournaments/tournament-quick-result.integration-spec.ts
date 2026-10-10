import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { V1GameSideKey, V1GameSourceType } from '@prisma/client';
import request = require('supertest');
import { canonicalGameCommandPayloadHash, GamesService } from '../../src/games/games.service';
import type { GameCommandContext, GameSourceCreationInput } from '../../src/games/games.types';
import { PrismaService } from '../../src/prisma/prisma.service';
import { ManagedTermsRuntimeService } from '../../src/terms/managed-terms-runtime.service';
import { TournamentResultReviewService } from '../../src/tournament-operations/results/tournament-result-review.service';
import { seedLeagueOnTournamentAxis } from '../fixtures/league-on-tournament-axis.fixture';
import { drainOutboxWorker } from '../helpers/drain-outbox-worker';
import { createV1IntegrationApp } from '../integration/integration-app';

/**
 * 어드민 빠른 결과 확정(`POST /admin/games/:gameId/quick-result`) 통합 계약.
 * 유닛 스펙은 게이트와 쓰는 행을 고정하고, 여기서는 진출·워커 소비·권한·멱등·롤백을 실제 DB 로 본다.
 */
const suite = randomUUID().slice(0, 8);
const users = {
  ops: randomUUID(),
  support: randomUUID(),
  director: randomUUID(),
  plain: randomUUID(),
  ownerA: randomUUID(),
  ownerB: randomUUID(),
};

let app: INestApplication;
let cleanup: (() => Promise<void>) | undefined;
let prisma: PrismaService;
let games: GamesService;
let resultReview: TournamentResultReviewService;
let configId: string;
let sportId: string;
let regionId: string;
let opsAdminRowId: string;
const teams: Record<'a' | 'b' | 'c' | 'd', string> = { a: randomUUID(), b: randomUUID(), c: randomUUID(), d: randomUUID() };

const authUser = (id: string) => ({
  id,
  email: `${id}@quick-result.test`,
  accountStatus: 'active' as const,
  onboardingStatus: 'completed' as const,
});

async function createUser(id: string, adminRole?: 'owner' | 'ops' | 'support'): Promise<string | null> {
  await prisma.v1User.create({
    data: {
      id,
      email: `${id}@quick-result.test`,
      onboardingStatus: 'completed',
      phoneVerifiedAt: new Date('2026-08-01T00:00:00.000Z'),
      accountStatus: 'active',
    },
  });
  const terms = app.get(ManagedTermsRuntimeService);
  const signup = await terms.currentSignupTerms();
  await terms.acceptSignupTerms(
    id,
    signup.items.filter((item) => item.requirement === 'required').map((item) => item.documentId),
  );
  if (adminRole === undefined) return null;
  const admin = await prisma.v1AdminUser.create({ data: { userId: id, adminRole, status: 'active' } });
  return admin.id;
}

function sourceContext(payload: unknown, commandId: string): GameCommandContext {
  return {
    actor: { actorType: 'USER', actorUserId: users.ops, role: 'platform_ops' },
    expectedVersion: 0,
    durableCommandId: commandId,
    payloadHash: canonicalGameCommandPayloadHash(payload),
  };
}

type FixtureSide = { teamId: string | null; withPlayer: boolean };

/** 팀매치 + 게임(+ 사이드마다 선수 1명, GK). 게임 id 를 돌려준다. */
async function createGameFor(teamMatchId: string, home: FixtureSide, away: FixtureSide): Promise<string> {
  const participants: GameSourceCreationInput['participants'] = [
    ...(home.withPlayer
      ? [{ sourceParticipantId: `${teamMatchId}-home`, sideKey: V1GameSideKey.HOME, displayNameSnapshot: '홈 선수', position: 'GK' }]
      : []),
    ...(away.withPlayer
      ? [{ sourceParticipantId: `${teamMatchId}-away`, sideKey: V1GameSideKey.AWAY, displayNameSnapshot: '원정 선수', position: 'GK' }]
      : []),
  ];
  const input: GameSourceCreationInput = {
    sourceType: V1GameSourceType.TEAM_MATCH,
    sourceId: teamMatchId,
    competitionConfigVersionId: configId,
    sides: [
      { sideKey: V1GameSideKey.HOME, teamId: home.teamId, displayNameSnapshot: home.teamId === null ? 'TBD' : '홈 팀' },
      { sideKey: V1GameSideKey.AWAY, teamId: away.teamId, displayNameSnapshot: away.teamId === null ? 'TBD' : '원정 팀' },
    ],
    participants,
  };
  const created = await prisma.$transaction((tx) =>
    games.createFromSourceInTransaction(tx, input, sourceContext(input, `qr-src-${teamMatchId}`)),
  );
  return created.gameId;
}

type Bracket = {
  tournamentId: string;
  registration: Record<'a' | 'b' | 'c' | 'd', string>;
  semi1: { teamMatchId: string; gameId: string };
  semi2: { teamMatchId: string; gameId: string };
  final: { teamMatchId: string; gameId: string };
};

/** 4강 2경기(A–B, C–D) + 결승(양 팀 미정). 4강 승자가 결승 HOME/AWAY 로 진출한다. */
async function createBracket(): Promise<Bracket> {
  const tournamentId = randomUUID();
  await prisma.v1Tournament.create({
    data: {
      id: tournamentId,
      sportId,
      regionId,
      title: `QR 토너먼트 ${suite} ${tournamentId.slice(0, 4)}`,
      status: 'in_progress',
      kind: 'regular_tournament',
      format: 'knockout',
      competitionConfigVersionId: configId,
    },
  });
  const registration = { a: randomUUID(), b: randomUUID(), c: randomUUID(), d: randomUUID() };
  await prisma.v1TournamentRegistration.createMany({
    data: (['a', 'b', 'c', 'd'] as const).map((key) => ({
      id: registration[key],
      tournamentId,
      teamId: teams[key],
      appliedByUserId: users.ops,
      status: 'confirmed' as const,
    })),
  });
  const semiGroupId = randomUUID();
  const finalGroupId = randomUUID();
  await prisma.v1TournamentGroup.createMany({
    data: [
      { id: semiGroupId, tournamentId, name: '4강', phase: 'semi' },
      { id: finalGroupId, tournamentId, name: '결승', phase: 'final' },
    ],
  });

  const makeFixture = async (
    groupId: string,
    round: string,
    fixtureNumber: number,
    home: 'a' | 'b' | 'c' | 'd' | null,
    away: 'a' | 'b' | 'c' | 'd' | null,
  ) => {
    const teamMatchId = randomUUID();
    await prisma.v1TeamMatch.create({
      data: {
        id: teamMatchId,
        tournamentId,
        sportId,
        title: `QR ${round} ${fixtureNumber}`,
        status: 'matched',
        competitionConfigVersionId: configId,
        hostTeamId: home === null ? null : teams[home],
        approvedApplicantTeamId: away === null ? null : teams[away],
      },
    });
    await prisma.v1TournamentMatchDetails.create({
      data: {
        teamMatchId,
        tournamentId,
        groupId,
        round,
        fixtureNumber,
        homeRegistrationId: home === null ? null : registration[home],
        awayRegistrationId: away === null ? null : registration[away],
      },
    });
    const gameId = await createGameFor(
      teamMatchId,
      { teamId: home === null ? null : teams[home], withPlayer: home !== null },
      { teamId: away === null ? null : teams[away], withPlayer: away !== null },
    );
    return { teamMatchId, gameId };
  };

  const semi1 = await makeFixture(semiGroupId, '4강', 1, 'a', 'b');
  const semi2 = await makeFixture(semiGroupId, '4강', 2, 'c', 'd');
  const final = await makeFixture(finalGroupId, '결승', 3, null, null);
  await prisma.v1TournamentMatchAdvancementEdge.createMany({
    data: [
      { tournamentId, sourceTeamMatchId: semi1.teamMatchId, sourceOutcome: 'WINNER', targetTeamMatchId: final.teamMatchId, targetSide: 'HOME' },
      { tournamentId, sourceTeamMatchId: semi2.teamMatchId, sourceOutcome: 'WINNER', targetTeamMatchId: final.teamMatchId, targetSide: 'AWAY' },
    ],
  });
  return { tournamentId, registration, semi1, semi2, final };
}

/** 조별 리그 1경기(A–B). 조 단계(phase 'group')라 확정 시 순위 투영이 돈다. */
async function createGroupFixture(): Promise<{ tournamentId: string; groupId: string; registration: Record<'a' | 'b', string>; gameId: string }> {
  const tournamentId = randomUUID();
  await prisma.v1Tournament.create({
    data: {
      id: tournamentId,
      sportId,
      regionId,
      title: `QR 조별 ${suite} ${tournamentId.slice(0, 4)}`,
      status: 'in_progress',
      kind: 'regular_tournament',
      format: 'group_knockout',
      competitionConfigVersionId: configId,
    },
  });
  const registration = { a: randomUUID(), b: randomUUID() };
  await prisma.v1TournamentRegistration.createMany({
    data: (['a', 'b'] as const).map((key) => ({
      id: registration[key],
      tournamentId,
      teamId: teams[key],
      appliedByUserId: users.ops,
      status: 'confirmed' as const,
    })),
  });
  const groupId = randomUUID();
  await prisma.v1TournamentGroup.create({ data: { id: groupId, tournamentId, name: 'A조', phase: 'group' } });
  await prisma.v1TournamentGroupTeam.createMany({
    data: (['a', 'b'] as const).map((key, index) => ({ groupId, registrationId: registration[key], sortOrder: index })),
  });
  const teamMatchId = randomUUID();
  await prisma.v1TeamMatch.create({
    data: {
      id: teamMatchId,
      tournamentId,
      sportId,
      title: 'QR 조별 1',
      status: 'matched',
      competitionConfigVersionId: configId,
      hostTeamId: teams.a,
      approvedApplicantTeamId: teams.b,
    },
  });
  await prisma.v1TournamentMatchDetails.create({
    data: {
      teamMatchId,
      tournamentId,
      groupId,
      round: '조별',
      fixtureNumber: 1,
      homeRegistrationId: registration.a,
      awayRegistrationId: registration.b,
    },
  });
  const gameId = await createGameFor(teamMatchId, { teamId: teams.a, withPlayer: true }, { teamId: teams.b, withPlayer: true });
  return { tournamentId, groupId, registration, gameId };
}

type QuickScore = { home: number; away: number; penalties?: { home: number; away: number } };

async function gameVersion(gameId: string): Promise<number> {
  return (await prisma.v1Game.findUniqueOrThrow({ where: { id: gameId } })).version;
}

async function quickResult(
  gameId: string,
  userId: string | null,
  score: QuickScore,
  options: { key?: string; headerKey?: string; version?: number } = {},
) {
  const key = options.key ?? randomUUID();
  const version = options.version ?? (await gameVersion(gameId));
  let call = request(app.getHttpServer()).post(`/api/v1/admin/games/${gameId}/quick-result`);
  if (userId !== null) call = call.set('x-v1-user-id', userId);
  return call.set('Idempotency-Key', options.headerKey ?? key).send({ clientCommandId: key, expectedVersion: version, score });
}

const revisionCount = (gameId: string) => prisma.v1GameResultRevision.count({ where: { gameId } });
const outboxCount = (gameId: string, type: string) =>
  prisma.v1OutboxEvent.count({ where: { aggregateType: 'GAME', aggregateId: gameId, type } });
/**
 * 이미 소비된 공식 결과 이벤트를 PENDING 으로 되돌려 워커가 다시 받게 한다(at-least-once 재전달 모사).
 * 되돌릴 이벤트가 없거나 워커가 다시 처리하지 않았으면 그 자체로 실패한다 — 재소비 단언이 빈 드레인으로 통과하지 못하게 한다.
 */
async function redeliverOfficialEvents(gameId: string): Promise<void> {
  const where = { aggregateType: 'GAME', aggregateId: gameId, type: 'GAME_RESULT_OFFICIAL' } as const;
  const before = await prisma.v1OutboxEvent.findMany({ where: { ...where, status: 'COMPLETED' } });
  expect(before.length).toBeGreaterThan(0);
  await prisma.v1OutboxEvent.updateMany({
    where: { id: { in: before.map((event) => event.id) } },
    // v1_outbox_version_cas 트리거가 UPDATE 마다 version + 1 을 요구한다(어기면 40001).
    data: { status: 'PENDING', leaseOwner: null, leaseUntil: null, availableAt: new Date(Date.now() - 1_000), version: { increment: 1 } },
  });
  await drainOutboxWorker(prisma);
  const after = await prisma.v1OutboxEvent.findMany({ where: { id: { in: before.map((event) => event.id) } } });
  for (const event of after) {
    expect(event.status).toBe('COMPLETED');
    expect(event.attempts).toBeGreaterThan(before.find((row) => row.id === event.id)!.attempts);
  }
}
const finalDetails = (teamMatchId: string) =>
  prisma.v1TournamentMatchDetails.findUniqueOrThrow({ where: { teamMatchId } });

beforeAll(async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required for the quick-result integration suite');
  }
  ({ app, cleanup } = await createV1IntegrationApp());
  prisma = app.get(PrismaService);
  games = app.get(GamesService);
  resultReview = app.get(TournamentResultReviewService);

  opsAdminRowId = (await createUser(users.ops, 'ops')) as string;
  await createUser(users.support, 'support');
  await createUser(users.director);
  await createUser(users.plain);
  await createUser(users.ownerA);
  await createUser(users.ownerB);

  const config = await prisma.v1CompetitionConfigVersion.findFirst({
    where: { name: 'futsal-v1', status: 'ACTIVE' },
    orderBy: { version: 'desc' },
  });
  if (config === null) throw new Error('futsal-v1 프리셋이 필요하다');
  configId = config.id;
  sportId = (
    await prisma.v1Sport.upsert({ where: { code: 'futsal' }, create: { code: 'futsal', name: '풋살' }, update: {} })
  ).id;
  regionId = (await prisma.v1Region.create({ data: { code: `QR_REGION_${suite}`, name: 'QR 지역', level: 1 } })).id;
  for (const key of ['a', 'b', 'c', 'd'] as const) {
    await prisma.v1Team.create({
      data: { id: teams[key], ownerUserId: users.ops, sportId, regionId, name: `QR-${suite}-${key.toUpperCase()}` },
    });
  }
  // 완료 알림 수신자는 양 팀 owner·manager 활성 멤버십이다.
  await prisma.v1TeamMembership.createMany({
    data: [
      { teamId: teams.a, userId: users.ownerA, role: 'owner', status: 'active' },
      { teamId: teams.b, userId: users.ownerB, role: 'owner', status: 'active' },
    ],
  });
});


/** 대진 경기의 "완료" 알림 수(양 팀 owner 1명씩이면 2). 정정 뒤에도 늘지 않아야 한다. */
function notifiedCount(teamMatchId: string): Promise<number> {
  return prisma.v1Notification.count({ where: { businessKey: { startsWith: `tournament-fixture-completed:${teamMatchId}:` } } });
}

describe('빠른 결과 — 대회 경기', () => {
  it('4강을 점수만으로 확정하면 승자가 결승 칸에 들어가고 확정본·감사·outbox 가 일반 확정과 같은 모양이다', async () => {
    const bracket = await createBracket();
    const { gameId, teamMatchId } = bracket.semi1;
    const version = await gameVersion(gameId);

    const response = await quickResult(gameId, users.ops, { home: 2, away: 1 });

    expect(response.status).toBe(201);
    expect(response.body.data).toEqual({
      gameId,
      revisionId: expect.any(String),
      version: version + 1,
      score: { home: 2, away: 1 },
    });
    const revision = await prisma.v1GameResultRevision.findUniqueOrThrow({ where: { id: response.body.data.revisionId } });
    expect(revision).toMatchObject({
      state: 'OFFICIAL',
      reason: '[quick-result]',
      supersedesId: null,
      eventsHash: canonicalGameCommandPayloadHash([]),
      createdByUserId: users.ops,
    });
    expect(revision.goalEvents).toEqual([]);
    expect(revision.submittedAt).not.toBeNull();
    expect(revision.officialAt).not.toBeNull();
    // 양 팀 선수 1명씩이 출전자로 기록된다(기록은 0).
    const players = await prisma.v1GameResultParticipant.findMany({ where: { resultRevisionId: revision.id } });
    expect(players).toHaveLength(2);
    expect(players.every((player) => player.started && player.goals === 0 && player.assists === 0)).toBe(true);
    expect(await prisma.v1Game.findUniqueOrThrow({ where: { id: gameId } })).toMatchObject({
      state: 'ENDED',
      currentOfficialRevisionId: revision.id,
    });
    expect((await prisma.v1TeamMatch.findUniqueOrThrow({ where: { id: teamMatchId } })).status).toBe('completed');
    // 승자(홈 A)가 결승 HOME 으로 진출했고, 아직 확정 안 된 다른 4강의 몫(AWAY)은 비어 있다.
    const final = await finalDetails(bracket.final.teamMatchId);
    expect(final.homeRegistrationId).toBe(bracket.registration.a);
    expect(final.awayRegistrationId).toBeNull();
    expect(await outboxCount(gameId, 'GAME_RESULT_OFFICIAL')).toBe(1);
    expect(await outboxCount(gameId, 'GAME_RESULT_SUBMITTED')).toBe(0);
    expect(await prisma.v1OperationAudit.count({ where: { resourceId: gameId, action: 'QUICK_RESULT' } })).toBe(1);
  });

  it('조별 경기를 점수만으로 확정하면 워커가 그 조 순위에 이긴 팀 승 1·승점, 진 팀 패 1을 남기고 이벤트를 다시 받아도 행·집계가 그대로다', async () => {
    const group = await createGroupFixture();
    const response = await quickResult(group.gameId, users.ops, { home: 2, away: 1 });
    expect(response.status).toBe(201);

    await drainOutboxWorker(prisma);

    const rows = await prisma.v1TournamentStanding.findMany({ where: { groupId: group.groupId } });
    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.registrationId === group.registration.a)).toMatchObject({
      wins: 1, draws: 0, losses: 0, points: 3, goalsFor: 2, goalsAgainst: 1, position: 1,
    });
    expect(rows.find((row) => row.registrationId === group.registration.b)).toMatchObject({
      wins: 0, draws: 0, losses: 1, points: 0, goalsFor: 1, goalsAgainst: 2, position: 2,
    });
    expect(await prisma.v1TournamentOverallStanding.count({ where: { tournamentId: group.tournamentId } })).toBe(2);

    await redeliverOfficialEvents(group.gameId);
    const stat = (row: (typeof rows)[number]) => ({
      registrationId: row.registrationId, wins: row.wins, draws: row.draws, losses: row.losses,
      points: row.points, goalsFor: row.goalsFor, goalsAgainst: row.goalsAgainst, position: row.position,
    });
    const afterRows = await prisma.v1TournamentStanding.findMany({ where: { groupId: group.groupId } });
    expect(afterRows.map(stat).sort((x, y) => x.position! - y.position!)).toEqual(rows.map(stat).sort((x, y) => x.position! - y.position!));
    expect(await prisma.v1TournamentOverallStanding.count({ where: { tournamentId: group.tournamentId } })).toBe(2);
  });

  it('결선 무승부는 점수만 있는 승부차기로 확정되고(킥 수 없음), 승부차기 승자가 진출한다', async () => {
    const bracket = await createBracket();

    const missing = await quickResult(bracket.semi1.gameId, users.ops, { home: 1, away: 1 });
    expect(missing.status).toBe(409);
    expect(missing.body.code).toBe('TOURNAMENT_PENALTY_REQUIRED');
    expect(await revisionCount(bracket.semi1.gameId)).toBe(0);

    const response = await quickResult(bracket.semi1.gameId, users.ops, { home: 1, away: 1, penalties: { home: 3, away: 4 } });

    expect(response.status).toBe(201);
    const revision = await prisma.v1GameResultRevision.findUniqueOrThrow({ where: { id: response.body.data.revisionId } });
    expect(revision.score).toEqual({ home: 1, away: 1, penalties: { home: 3, away: 4 } });
    expect((await finalDetails(bracket.final.teamMatchId)).homeRegistrationId).toBe(bracket.registration.b);
  });

  it('워커가 소비하면 공식 기록·완료 알림(양 팀 1건씩)이 생기고, 두 4강이 모두 확정되면 결승의 홈·원정 칸이 둘 다 찬다', async () => {
    const bracket = await createBracket();
    const first = await quickResult(bracket.semi1.gameId, users.ops, { home: 1, away: 1, penalties: { home: 5, away: 4 } });
    expect(first.status).toBe(201);

    // 개인 기록(출전)은 워커가 아니라 명령 시점에 쓰인다 — 워커 소비 전에 이미 양 팀 명단 선수마다 1건이 확정본에 붙어 있어야 한다.
    const roster = await prisma.v1GameParticipant.findMany({ where: { gameId: bracket.semi1.gameId } });
    const appearances = await prisma.v1GameResultParticipant.findMany({ where: { resultRevisionId: first.body.data.revisionId } });
    expect(roster).toHaveLength(2);
    expect(appearances.map((row) => row.participantId).sort()).toEqual(roster.map((row) => row.id).sort());
    expect(appearances.every((row) => row.started)).toBe(true);

    await drainOutboxWorker(prisma);

    expect(
      await prisma.v1GameOfficialFact.findUnique({ where: { revisionId: first.body.data.revisionId } }),
    ).toMatchObject({ gameId: bracket.semi1.gameId });
    expect(await notifiedCount(bracket.semi1.teamMatchId)).toBe(2);
    expect(await finalDetails(bracket.final.teamMatchId)).toMatchObject({
      homeRegistrationId: bracket.registration.a,
      awayRegistrationId: null,
    });

    // 팀 전적: 정규시간 1:1 이고 승부차기 5:4 — 득점 컬럼은 정규시간만, 승패는 승부차기로 가른다.
    const facts = await prisma.v1TeamRecordFact.findMany({ where: { revisionId: first.body.data.revisionId } });
    expect(facts).toHaveLength(2);
    expect(facts.find((fact) => fact.teamId === teams.a)).toMatchObject({
      gameId: bracket.semi1.gameId,
      opponentTeamId: teams.b,
      tournamentId: bracket.tournamentId,
      result: 'WON',
      goalsFor: 1,
      goalsAgainst: 1,
    });
    expect(facts.find((fact) => fact.teamId === teams.b)).toMatchObject({
      opponentTeamId: teams.a,
      result: 'LOST',
      goalsFor: 1,
      goalsAgainst: 1,
    });

    // 4강은 조별 순위에 반영되지 않는다(phase !== 'group'). 통합 순위도 같은 투영기가 조 단계에서만 갱신하므로 함께 0이다.
    expect(await prisma.v1TournamentStanding.count({ where: { registration: { tournamentId: bracket.tournamentId } } })).toBe(0);
    expect(await prisma.v1TournamentOverallStanding.count({ where: { tournamentId: bracket.tournamentId } })).toBe(0);

    // 이미 소비한 이벤트를 다시 전달해도 전적·알림이 늘지 않는다.
    await redeliverOfficialEvents(bracket.semi1.gameId);
    expect(await prisma.v1TeamRecordFact.count({ where: { revisionId: first.body.data.revisionId } })).toBe(2);
    expect(await notifiedCount(bracket.semi1.teamMatchId)).toBe(2);

    const second = await quickResult(bracket.semi2.gameId, users.ops, { home: 0, away: 2 });
    expect(second.status).toBe(201);
    await drainOutboxWorker(prisma);

    expect(await finalDetails(bracket.final.teamMatchId)).toMatchObject({
      homeRegistrationId: bracket.registration.a,
      awayRegistrationId: bracket.registration.d,
    });
    for (const fixture of [bracket.semi1, bracket.semi2]) {
      expect((await prisma.v1TeamMatch.findUniqueOrThrow({ where: { id: fixture.teamMatchId } })).status).toBe('completed');
    }
  });

  it('출전자는 사이드별 최신 무효화되지 않은 라인업 리비전의 선수만이다 — 무효화된 새 리비전의 선수는 섞이지 않는다', async () => {
    const bracket = await createBracket();
    const { gameId } = bracket.semi1;
    const homeSide = await prisma.v1GameSide.findFirstOrThrow({ where: { gameId, sideKey: V1GameSideKey.HOME } });
    const current = await prisma.v1GameLineup.findFirstOrThrow({
      where: { gameId, sideId: homeSide.id, invalidatedAt: null },
      orderBy: { revision: 'desc' },
    });
    // 명단 동기화가 남기는 모양: 더 높은 리비전이 있지만 무효화됐다. 이것이 "최신"으로 뽑히면 명단이 통째로 바뀐다.
    const stale = await prisma.v1GameLineup.create({
      data: {
        gameId,
        sideId: homeSide.id,
        revision: current.revision + 1,
        state: 'SUBMITTED',
        submittedAt: new Date(),
        invalidatedAt: new Date(),
        invalidationReason: 'qr-test',
      },
    });
    const strayParticipant = await prisma.v1GameParticipant.create({
      data: { gameId, sideId: homeSide.id, lineupId: stale.id, displayNameSnapshot: '무효 명단 선수', position: 'FW' },
    });

    const response = await quickResult(gameId, users.ops, { home: 1, away: 0 });

    expect(response.status).toBe(201);
    const players = await prisma.v1GameResultParticipant.findMany({ where: { resultRevisionId: response.body.data.revisionId } });
    expect(players).toHaveLength(2);
    expect(players.map((player) => player.participantId)).not.toContain(strayParticipant.id);
  });
});
type LeagueMatchOptions = { status?: 'matched' | 'cancelled'; homePlayer?: boolean; awayPlayer?: boolean };

/** 정규 리그 대진 하나(Details 없음, TeamMatch.leagueId === tournamentId). 팀 A(홈) vs B(원정). */
async function createLeagueMatch(leagueId: string, options: LeagueMatchOptions = {}) {
  const teamMatchId = randomUUID();
  const status = options.status ?? 'matched';
  await prisma.v1TeamMatch.create({
    data: {
      id: teamMatchId,
      tournamentId: leagueId,
      leagueId,
      sportId,
      regionId,
      title: `QR 리그 대진 ${teamMatchId.slice(0, 4)}`,
      placeName: 'QR 구장',
      startAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
      createdByUserId: users.ops,
      hostTeamId: teams.a,
      approvedApplicantTeamId: teams.b,
      competitionConfigVersionId: configId,
      status: 'matched',
    },
  });
  const gameId = await createGameFor(
    teamMatchId,
    { teamId: teams.a, withPlayer: options.homePlayer ?? true },
    { teamId: teams.b, withPlayer: options.awayPlayer ?? true },
  );
  if (status === 'cancelled') {
    // 리그 취소는 팀매치만 취소하고 게임은 SCHEDULED 로 남긴다(게임 상태로는 못 거른다).
    await prisma.v1TeamMatch.update({ where: { id: teamMatchId }, data: { status: 'cancelled', cancelledAt: new Date() } });
  }
  return { teamMatchId, gameId };
}

async function createLeague(): Promise<string> {
  const leagueId = randomUUID();
  await seedLeagueOnTournamentAxis(prisma, {
    id: leagueId,
    title: `QR 리그 ${suite} ${leagueId.slice(0, 4)}`,
    sportId,
    sportCode: 'futsal',
    regionId,
    createdByAdminUserId: opsAdminRowId,
    state: 'active',
  });
  return leagueId;
}
describe('빠른 결과 — 정규 리그 경기', () => {
  it('마지막 대진이 확정되고 워커가 소비하면 리그가 완료된다 — 중간까지는 완료되지 않는다', async () => {
    const leagueId = await createLeague();
    const first = await createLeagueMatch(leagueId);
    const second = await createLeagueMatch(leagueId);
    const statusOf = async () => (await prisma.v1Tournament.findUniqueOrThrow({ where: { id: leagueId } })).status;

    const one = await quickResult(first.gameId, users.ops, { home: 2, away: 1 });
    expect(one.status).toBe(201);
    await drainOutboxWorker(prisma);
    expect(await statusOf()).not.toBe('completed');
    expect((await prisma.v1TeamMatch.findUniqueOrThrow({ where: { id: first.teamMatchId } })).status).toBe('completed');

    // 리그에는 승부차기가 없다 — 무승부는 그대로 확정된다.
    const two = await quickResult(second.gameId, users.ops, { home: 0, away: 0 });
    expect(two.status).toBe(201);
    await drainOutboxWorker(prisma);

    expect(await statusOf()).toBe('completed');
    for (const response of [one, two]) {
      const revision = await prisma.v1GameResultRevision.findUniqueOrThrow({ where: { id: response.body.data.revisionId } });
      expect(revision).toMatchObject({ state: 'OFFICIAL', reason: '[quick-result]' });
      expect(await prisma.v1GameOfficialFact.findUnique({ where: { revisionId: revision.id } })).not.toBeNull();
    }
  });

  it('취소된 리그 대진은 게임이 SCHEDULED 여도 QUICK_RESULT_FIXTURE_CANCELLED — 같은 리그의 정상 대진은 확정된다', async () => {
    const leagueId = await createLeague();
    const cancelled = await createLeagueMatch(leagueId, { status: 'cancelled' });
    const normal = await createLeagueMatch(leagueId);

    const rejected = await quickResult(cancelled.gameId, users.ops, { home: 1, away: 0 });

    expect(rejected.status).toBe(409);
    expect(rejected.body.code).toBe('QUICK_RESULT_FIXTURE_CANCELLED');
    expect(await revisionCount(cancelled.gameId)).toBe(0);
    expect((await prisma.v1TeamMatch.findUniqueOrThrow({ where: { id: cancelled.teamMatchId } })).status).toBe('cancelled');
    expect((await quickResult(normal.gameId, users.ops, { home: 1, away: 0 })).status).toBe(201);
  });

  it('출전자가 0명인 사이드가 있으면 QUICK_RESULT_ROSTER_SYNCING — 출전자 0명 확정본을 남기지 않는다', async () => {
    const leagueId = await createLeague();
    const empty = await createLeagueMatch(leagueId, { awayPlayer: false });

    const rejected = await quickResult(empty.gameId, users.ops, { home: 1, away: 0 });

    expect(rejected.status).toBe(409);
    expect(rejected.body.code).toBe('QUICK_RESULT_ROSTER_SYNCING');
    expect(await revisionCount(empty.gameId)).toBe(0);
  });

  it('그 경기의 명단 재계산 이벤트가 처리 전이면 409, 처리가 끝나면 확정된다', async () => {
    const leagueId = await createLeague();
    const match = await createLeagueMatch(leagueId);
    const pending = await prisma.v1OutboxEvent.create({
      data: {
        businessKey: `roster-resync:GAME:${match.gameId}:${randomUUID()}`,
        aggregateType: 'GAME',
        aggregateId: match.gameId,
        type: 'COMPETITION_ROSTER_RESYNC',
        payload: { scope: 'game', gameId: match.gameId },
        status: 'PENDING',
        // 워커가 집어 가 갱신과 겹치지 않도록 먼 미래로 둔다(입장 조건 검사는 availableAt 을 보지 않는다).
        availableAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    const blocked = await quickResult(match.gameId, users.ops, { home: 1, away: 0 });
    expect(blocked.status).toBe(409);
    expect(blocked.body.code).toBe('QUICK_RESULT_ROSTER_SYNCING');
    expect(await revisionCount(match.gameId)).toBe(0);

    // 가짜 이벤트를 워커 대신 직접 완료 처리한다(version CAS 트리거가 증가를 요구한다).
    await prisma.v1OutboxEvent.update({ where: { id: pending.id }, data: { status: 'COMPLETED', version: { increment: 1 } } });

    expect((await quickResult(match.gameId, users.ops, { home: 1, away: 0 })).status).toBe(201);
  });
});

describe('빠른 결과 — 대회·리그 소속이 아닌 팀매치', () => {
  it('친선 팀매치는 QUICK_RESULT_UNSUPPORTED 409 이고 아무것도 쓰지 않는다', async () => {
    const teamMatchId = randomUUID();
    await prisma.v1TeamMatch.create({
      data: {
        id: teamMatchId,
        sportId,
        regionId,
        title: 'QR 친선',
        placeName: 'QR 구장',
        startAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
        createdByUserId: users.ops,
        hostTeamId: teams.a,
        approvedApplicantTeamId: teams.b,
        competitionConfigVersionId: configId,
        status: 'matched',
      },
    });
    const gameId = await createGameFor(teamMatchId, { teamId: teams.a, withPlayer: true }, { teamId: teams.b, withPlayer: true });

    const response = await quickResult(gameId, users.ops, { home: 1, away: 0 });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('QUICK_RESULT_UNSUPPORTED');
    expect(await revisionCount(gameId)).toBe(0);
    expect((await prisma.v1Game.findUniqueOrThrow({ where: { id: gameId } })).state).toBe('SCHEDULED');
  });
});

describe('빠른 결과 — 입장 조건 거부(대회)', () => {
  it('득점 기록이 하나라도 있으면 QUICK_RESULT_HAS_LIVE_RECORDS', async () => {
    const bracket = await createBracket();
    const { gameId } = bracket.semi1;
    await prisma.v1GameEvent.create({
      data: {
        gameId,
        sequence: 1,
        clientEventId: `qr-event-${randomUUID()}`,
        payloadHash: canonicalGameCommandPayloadHash(['qr-event']),
        type: 'GOAL',
        period: 1,
        clockMs: 60_000,
        occurredAt: new Date(),
        actorUserId: users.ops,
        payload: {},
      },
    });

    const response = await quickResult(gameId, users.ops, { home: 1, away: 0 });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('QUICK_RESULT_HAS_LIVE_RECORDS');
    expect(await revisionCount(gameId)).toBe(0);
  });

  it('팀이 정해지지 않은 결승은 QUICK_RESULT_TEAMS_REQUIRED', async () => {
    const bracket = await createBracket();

    const response = await quickResult(bracket.final.gameId, users.ops, { home: 1, away: 0 });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('QUICK_RESULT_TEAMS_REQUIRED');
    expect(await revisionCount(bracket.final.gameId)).toBe(0);
  });
});

function previewHash(revision: { score: unknown; goalEvents: unknown; eventsHash: string; mvpParticipantId: string | null }): string {
  return canonicalGameCommandPayloadHash({
    score: revision.score,
    goalEvents: revision.goalEvents,
    eventsHash: revision.eventsHash,
    mvpParticipantId: revision.mvpParticipantId,
  });
}

afterAll(async () => cleanup?.());

describe('빠른 결과 — 권한', () => {
  it('support 어드민·대회 디렉터·일반 사용자는 403 이고 아무것도 쓰지 않는다 — 비로그인은 401, 플랫폼 어드민은 같은 경기를 확정한다', async () => {
    const bracket = await createBracket();
    const { gameId } = bracket.semi1;
    // 디렉터는 이 대회의 스태프 배정이 있어도 어드민이 아니면 이 경로를 못 쓴다.
    await prisma.v1TournamentStaffAssignment.create({
      data: { tournamentId: bracket.tournamentId, userId: users.director, role: 'TOURNAMENT_DIRECTOR', grantedByUserId: users.ops },
    });

    for (const userId of [users.support, users.director, users.plain]) {
      const response = await quickResult(gameId, userId, { home: 1, away: 0 });
      expect(response.status).toBe(403);
      expect(response.body.code).toBe('PERMISSION_DENIED');
    }
    expect((await quickResult(gameId, null, { home: 1, away: 0 })).status).toBe(401);
    expect(await revisionCount(gameId)).toBe(0);
    expect(await outboxCount(gameId, 'GAME_RESULT_OFFICIAL')).toBe(0);

    expect((await quickResult(gameId, users.ops, { home: 1, away: 0 })).status).toBe(201);
  });
});

describe('빠른 결과 — 요청 경계', () => {
  it('expectedVersion 이 낡았으면 409 VERSION_CONFLICT, Idempotency-Key 가 본문과 다르면 422', async () => {
    const bracket = await createBracket();
    const { gameId } = bracket.semi1;
    const version = await gameVersion(gameId);

    const stale = await quickResult(gameId, users.ops, { home: 1, away: 0 }, { version: version + 1 });
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe('VERSION_CONFLICT');

    const mismatch = await quickResult(gameId, users.ops, { home: 1, away: 0 }, { headerKey: randomUUID() });
    expect(mismatch.status).toBe(422);
    expect(mismatch.body.code).toBe('COMMAND_IDEMPOTENCY_KEY_MISMATCH');

    expect(await revisionCount(gameId)).toBe(0);
  });
});

describe('빠른 결과 — 멱등 재생', () => {
  it('같은 키·같은 본문의 재요청은 같은 응답이고 새 행을 만들지 않는다 — 같은 키에 다른 본문은 충돌이다', async () => {
    const bracket = await createBracket();
    const { gameId } = bracket.semi1;
    const key = randomUUID();
    const version = await gameVersion(gameId);

    const first = await quickResult(gameId, users.ops, { home: 2, away: 1 }, { key, version });
    const replay = await quickResult(gameId, users.ops, { home: 2, away: 1 }, { key, version });

    expect(first.status).toBe(201);
    expect(replay.status).toBe(201);
    expect(replay.body.data).toEqual(first.body.data);
    expect(await revisionCount(gameId)).toBe(1);
    expect(await outboxCount(gameId, 'GAME_RESULT_OFFICIAL')).toBe(1);

    const conflicting = await quickResult(gameId, users.ops, { home: 3, away: 0 }, { key, version });
    expect(conflicting.status).toBe(409);
    expect(conflicting.body.code).toBe('IDEMPOTENCY_PAYLOAD_CONFLICT');
    expect(await revisionCount(gameId)).toBe(1);
  });
});

describe('빠른 결과 — 정정', () => {
  it('승부차기 승자 정정은 킥 수 없이 통과하고 다음 칸을 다시 채우되 완료 알림은 다시 가지 않는다', async () => {
    const bracket = await createBracket();
    const { gameId, teamMatchId } = bracket.semi1;
    const first = await quickResult(gameId, users.ops, { home: 1, away: 1, penalties: { home: 5, away: 4 } });
    expect(first.status).toBe(201);
    await drainOutboxWorker(prisma);
    expect(await notifiedCount(teamMatchId)).toBe(2);
    expect((await finalDetails(bracket.final.teamMatchId)).homeRegistrationId).toBe(bracket.registration.a);

    // 같은 경기의 승부차기 승자를 바꾼다. 득점 기록이 없어 킥 수를 요구하지 않는다(Task 3).
    const base = await prisma.v1GameResultRevision.findUniqueOrThrow({ where: { id: first.body.data.revisionId } });
    const baseParticipants = await prisma.v1GameResultParticipant.findMany({ where: { resultRevisionId: base.id } });
    const correctionKey = `qr-correction-${randomUUID()}`;
    const draft = await resultReview.createResultCorrection(authUser(users.ops), gameId, correctionKey, {
      expectedVersion: await gameVersion(gameId),
      clientCommandId: correctionKey,
      baseRevisionId: base.id,
      reason: '승부차기 승자 정정',
      changes: {
        score: { home: 1, away: 1, penalties: { home: 4, away: 5 } },
        actualParticipants: baseParticipants.map((row) => ({
          participantId: row.participantId,
          sideId: row.sideId,
          started: true,
          goals: 0,
          cards: { yellow: 0, red: 0 },
          goalkeeper: row.goalkeeper,
        })),
        eventsHash: canonicalGameCommandPayloadHash([]),
      },
    } as never);
    const draftRow = await prisma.v1GameResultRevision.findUniqueOrThrow({ where: { id: draft.revisionId } });
    const officializeKey = `qr-officialize-${randomUUID()}`;
    await resultReview.officializeResultRevision(authUser(users.ops), gameId, draft.revisionId, officializeKey, {
      expectedVersion: draft.version,
      clientCommandId: officializeKey,
      projectionPreviewHash: previewHash(draftRow),
    } as never);
    await drainOutboxWorker(prisma);

    expect((await finalDetails(bracket.final.teamMatchId)).homeRegistrationId).toBe(bracket.registration.b);
    expect(await notifiedCount(teamMatchId)).toBe(2);

    // 정정본은 자기 전적 2건을 따로 남기고(승부차기 승자가 바뀌어 결과가 뒤집힌다), 첫 확정본의 전적은 그대로다.
    const corrected = await prisma.v1TeamRecordFact.findMany({ where: { revisionId: draft.revisionId } });
    expect(corrected.find((fact) => fact.teamId === teams.a)?.result).toBe('LOST');
    expect(corrected.find((fact) => fact.teamId === teams.b)?.result).toBe('WON');
    expect(corrected).toHaveLength(2);
    expect(await prisma.v1TeamRecordFact.count({ where: { revisionId: base.id } })).toBe(2);

    // 정정 뒤 공식 결과 이벤트를 다시 전달해도 두 확정본의 전적 행 수는 늘지 않는다.
    await redeliverOfficialEvents(gameId);
    expect(await prisma.v1TeamRecordFact.count({ where: { revisionId: draft.revisionId } })).toBe(2);
    expect(await prisma.v1TeamRecordFact.count({ where: { revisionId: base.id } })).toBe(2);
  });
});

describe('빠른 결과 — 이미 확정된 경기(재입력 허용의 대조군)', () => {
  it('팀매치가 completed 여도 현재 포인터가 확정본(VOID 아님)이면 QUICK_RESULT_NOT_AVAILABLE 이고 리비전은 늘지 않는다', async () => {
    const bracket = await createBracket();
    const { gameId, teamMatchId } = bracket.semi1;
    const first = await quickResult(gameId, users.ops, { home: 1, away: 0 });
    expect(first.status).toBe(201);
    // 무효 뒤 재입력이 completed 를 허용하는 것과 같은 상태(completed)인데도 VOID 가 아니라서 거부돼야 한다.
    expect((await prisma.v1TeamMatch.findUniqueOrThrow({ where: { id: teamMatchId } })).status).toBe('completed');
    expect((await prisma.v1Game.findUniqueOrThrow({ where: { id: gameId } })).currentOfficialRevisionId).toBe(
      first.body.data.revisionId,
    );

    const again = await quickResult(gameId, users.ops, { home: 3, away: 0 });

    expect(again.status).toBe(409);
    expect(again.body.code).toBe('QUICK_RESULT_NOT_AVAILABLE');
    expect(await revisionCount(gameId)).toBe(1);
    expect((await finalDetails(bracket.final.teamMatchId)).homeRegistrationId).toBe(bracket.registration.a);
  });
});

describe('빠른 결과 — 다음 경기가 이미 시작된 경우', () => {
  it('다음 경기가 이미 시작됐으면 NEXT_FIXTURE_CONFLICT 이고 부분 적용 없이 전부 롤백된다', async () => {
    const bracket = await createBracket();
    const { gameId, teamMatchId } = bracket.semi1;
    await prisma.v1Game.update({ where: { id: bracket.final.gameId }, data: { state: 'LIVE' } });

    const response = await quickResult(gameId, users.ops, { home: 2, away: 0 });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('NEXT_FIXTURE_CONFLICT');
    expect(await revisionCount(gameId)).toBe(0);
    expect(await prisma.v1Game.findUniqueOrThrow({ where: { id: gameId } })).toMatchObject({
      state: 'SCHEDULED',
      currentOfficialRevisionId: null,
    });
    expect((await prisma.v1TeamMatch.findUniqueOrThrow({ where: { id: teamMatchId } })).status).toBe('matched');
    expect(await outboxCount(gameId, 'GAME_RESULT_OFFICIAL')).toBe(0);
  });
});

describe('빠른 결과 — 무효 뒤 재입력', () => {
  it('무효 처리한 경기는 다시 점수를 넣을 수 있고, VOID 리비전을 승계하며 진출이 새 승자로 바뀐다', async () => {
    const bracket = await createBracket();
    const { gameId, teamMatchId } = bracket.semi1;
    const first = await quickResult(gameId, users.ops, { home: 2, away: 1 });
    expect(first.status).toBe(201);
    expect((await finalDetails(bracket.final.teamMatchId)).homeRegistrationId).toBe(bracket.registration.a);

    const voidKey = `qr-void-${randomUUID()}`;
    const voided = await resultReview.voidResultRevision(authUser(users.ops), gameId, first.body.data.revisionId, voidKey, {
      expectedVersion: await gameVersion(gameId),
      clientCommandId: voidKey,
      reason: '점수 오입력',
    } as never);
    expect((await finalDetails(bracket.final.teamMatchId)).homeRegistrationId).toBeNull();
    // 무효는 팀매치 상태를 되돌리지 않는다 — 재입력 입장 조건이 completed 를 허용해야 하는 이유다.
    expect((await prisma.v1TeamMatch.findUniqueOrThrow({ where: { id: teamMatchId } })).status).toBe('completed');

    const reentry = await quickResult(gameId, users.ops, { home: 0, away: 3 });

    expect(reentry.status).toBe(201);
    const revision = await prisma.v1GameResultRevision.findUniqueOrThrow({ where: { id: reentry.body.data.revisionId } });
    expect(revision).toMatchObject({ state: 'OFFICIAL', supersedesId: voided.revisionId, revision: 3, reason: '[quick-result]' });
    expect((await prisma.v1Game.findUniqueOrThrow({ where: { id: gameId } })).currentOfficialRevisionId).toBe(revision.id);
    expect((await finalDetails(bracket.final.teamMatchId)).homeRegistrationId).toBe(bracket.registration.b);
    expect(await outboxCount(gameId, 'GAME_RESULT_OFFICIAL')).toBe(2);
  });
});
