import { HttpException } from '@nestjs/common';
import { V1GameResultRevisionState, V1GameSideKey, V1GameSourceType } from '@prisma/client';
import { OperationAuditWriterService } from '../../src/common/audit/operation-audit-writer.service';
import { GameTakeoverService } from '../../src/games/game-takeover.service';
import { GamesService, canonicalGameCommandPayloadHash } from '../../src/games/games.service';
import type { GameActorScope, GameCommandContext, GameSourceCreationInput } from '../../src/games/games.types';
import { PublicTournamentRecordsService } from '../../src/games/public-records/public-tournament-records.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { TournamentResultReviewService } from '../../src/tournament-operations/results/tournament-result-review.service';
import { parsePeriodDurations } from '../../src/tournaments/competition-config/competition-config.parse';
import { TournamentStaffAccessService } from '../../src/tournaments/staff/tournament-staff-access.service';

/**
 * MD-QA #187 — 경기 사건 시각 정정(append-only).
 *
 * 한 경기를 라이브 → 종료(SUBMITTED) → 확정(OFFICIAL)까지 몰고 가며 세 단계의 정정 경로를 실제 DB 로 확인한다.
 *  - 확정 전: 운영 콘솔 커맨드(`correctEventTime`) — 원본 행은 그대로, TIME_CORRECTION 행이 덧붙는다.
 *  - 제출 뒤 확정 전: 같은 커맨드가 SUBMITTED 리비전을 같은 점수의 후속 리비전으로 다시 제출한다.
 *  - 확정 뒤: 콘솔은 409, 플랫폼 운영자만(`correctOfficialEventTime`) 새 공식 리비전으로 대체한다.
 * 어느 단계에서도 점수·카드 수·선수 기록은 바뀌지 않는다.
 */

const ids = {
  operator: '71870000-0000-4000-8000-000000000001',
  platformOps: '71870000-0000-4000-8000-000000000002',
  sport: '71870000-0000-4000-8000-000000000010',
  region: '71870000-0000-4000-8000-000000000011',
  hostTeam: '71870000-0000-4000-8000-000000000020',
  awayTeam: '71870000-0000-4000-8000-000000000021',
  tournament: '71870000-0000-4000-8000-000000000030',
  fixture: '71870000-0000-4000-8000-000000000031',
  assignment: '71870000-0000-4000-8000-000000000040',
  hostRegistration: '71870000-0000-4000-8000-000000000050',
  awayRegistration: '71870000-0000-4000-8000-000000000051',
} as const;

const prisma = new PrismaService();
const staffAccess = new TournamentStaffAccessService(prisma);
const service = new GamesService(prisma, new OperationAuditWriterService(), new GameTakeoverService(), staffAccess);
const resultReview = new TournamentResultReviewService(prisma, staffAccess, new OperationAuditWriterService());
const publicRecords = new PublicTournamentRecordsService(prisma, staffAccess);

const authUser = (id: string) => ({
  id,
  email: `${id}@event-time-correction.example.test`,
  accountStatus: 'active' as const,
  onboardingStatus: 'completed' as const,
});

function context(actor: GameActorScope, commandId: string, payload: unknown): GameCommandContext {
  return { actor, expectedVersion: 0, durableCommandId: commandId, payloadHash: canonicalGameCommandPayloadHash(payload) };
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

async function currentVersion(gameId: string): Promise<number> {
  return (await prisma.v1Game.findUniqueOrThrow({ where: { id: gameId }, select: { version: true } })).version;
}

async function token(gameId: string, clientInstanceId: string): Promise<string> {
  return (await service.requestTakeover(authUser(ids.operator), gameId, { clientInstanceId, lastSequence: 0 })).takeoverToken;
}

async function correct(gameId: string, eventId: string, key: string, clockMs: number, reason = '심판 기록 대조') {
  return service.correctEventTime(authUser(ids.operator), gameId, eventId, key, {
    expectedVersion: await currentVersion(gameId), clientEventId: key, takeoverToken: await token(gameId, key), clockMs, reason,
  });
}

const minute = (ms: number) => Math.max(0, Math.ceil(ms / 60_000));

let gameId: string;
let homeSideId: string;
let scorerId: string;
let cardedId: string;
let cardEventId: string;
let goalEventId: string;
let periodOneMs: number;
let originalCardClock: number;
let originalGoalClock: number;

beforeAll(async () => {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  await prisma.$connect();
  await prisma.v1User.createMany({
    data: [
      { id: ids.operator, email: 'event-time-operator@example.test', accountStatus: 'active', onboardingStatus: 'completed' },
      { id: ids.platformOps, email: 'event-time-ops@example.test', accountStatus: 'active', onboardingStatus: 'completed' },
    ],
  });
  await prisma.v1AdminUser.create({ data: { userId: ids.platformOps, adminRole: 'ops', status: 'active' } });
  await prisma.v1Sport.create({ data: { id: ids.sport, code: 'football-event-time', name: 'Event Time Football' } });
  await prisma.v1Region.create({ data: { id: ids.region, code: 'EVENT_TIME_REGION', name: 'Event Time Region', level: 1 } });
  await prisma.v1Team.createMany({
    data: [
      { id: ids.hostTeam, ownerUserId: ids.operator, sportId: ids.sport, regionId: ids.region, name: 'Event Time Host' },
      { id: ids.awayTeam, ownerUserId: ids.operator, sportId: ids.sport, regionId: ids.region, name: 'Event Time Away' },
    ],
  });
  const config = await prisma.v1CompetitionConfigVersion.findFirstOrThrow({ where: { name: 'football-v1', status: 'ACTIVE' }, orderBy: { version: 'desc' } });
  periodOneMs = (parsePeriodDurations(config.periods)?.[0]?.durationMinutes ?? 45) * 60_000;
  originalCardClock = Math.floor(periodOneMs * 0.5);
  originalGoalClock = Math.floor(periodOneMs * 0.3);
  await prisma.v1Tournament.create({
    data: {
      id: ids.tournament, sportId: ids.sport, regionId: ids.region, title: 'Event Time Cup', kind: 'regular_tournament',
      status: 'in_progress', format: 'league', bracketPublishedAt: new Date(), competitionConfigVersionId: config.id,
    },
  });
  await prisma.v1TournamentRegistration.createMany({
    data: [
      { id: ids.hostRegistration, tournamentId: ids.tournament, teamId: ids.hostTeam, appliedByUserId: ids.operator, status: 'confirmed' },
      { id: ids.awayRegistration, tournamentId: ids.tournament, teamId: ids.awayTeam, appliedByUserId: ids.operator, status: 'confirmed' },
    ],
  });
  await prisma.v1TeamMatch.create({
    data: {
      id: ids.fixture, tournamentId: ids.tournament, sportId: ids.sport, hostTeamId: ids.hostTeam, approvedApplicantTeamId: ids.awayTeam,
      startAt: new Date(Date.now() - 60_000), title: 'Event time fixture', status: 'matched', competitionConfigVersionId: config.id,
    },
  });
  await prisma.v1TournamentMatchDetails.create({
    data: { teamMatchId: ids.fixture, tournamentId: ids.tournament, round: 'group', fixtureNumber: 1, legNumber: 1, homeRegistrationId: ids.hostRegistration, awayRegistrationId: ids.awayRegistration },
  });
  await prisma.v1TournamentStaffAssignment.create({
    data: { id: ids.assignment, tournamentId: ids.tournament, userId: ids.operator, role: 'TOURNAMENT_DIRECTOR', grantedByUserId: ids.operator },
  });
  for (const key of ['PUBLIC_LIVE', 'DIRECTOR_OFFICIALIZE'] as const) {
    await prisma.v1GameOperationFlag.upsert({
      where: { key },
      create: { key, value: 'on', ownerActor: 'platform_ops' },
      update: { value: 'on' },
    });
  }

  const input: GameSourceCreationInput = {
    sourceType: V1GameSourceType.TEAM_MATCH,
    sourceId: ids.fixture,
    competitionConfigVersionId: config.id,
    sides: [
      { sideKey: V1GameSideKey.HOME, teamId: ids.hostTeam, displayNameSnapshot: 'Event Time Host' },
      { sideKey: V1GameSideKey.AWAY, teamId: ids.awayTeam, displayNameSnapshot: 'Event Time Away' },
    ],
    participants: [
      { sourceParticipantId: 'time-scorer', sideKey: V1GameSideKey.HOME, displayNameSnapshot: 'Time Scorer' },
      { sourceParticipantId: 'time-carded', sideKey: V1GameSideKey.HOME, displayNameSnapshot: 'Time Carded' },
      { sourceParticipantId: 'time-away', sideKey: V1GameSideKey.AWAY, displayNameSnapshot: 'Time Away' },
    ],
  };
  const actor: GameActorScope = { actorType: 'USER', actorUserId: ids.operator, role: 'field_operator', tournamentId: ids.tournament, fixtureId: ids.fixture };
  const created = await prisma.$transaction((tx) => service.createFromSourceInTransaction(tx, input, context(actor, 'event-time-source-create', input)));
  gameId = created.gameId;
  const persisted = await prisma.v1Game.findUniqueOrThrow({ where: { id: gameId }, include: { sides: true, participants: true } });
  homeSideId = persisted.sides.find((side) => side.sideKey === 'HOME')!.id;
  scorerId = persisted.participants.find((participant) => participant.displayNameSnapshot === 'Time Scorer')!.id;
  cardedId = persisted.participants.find((participant) => participant.displayNameSnapshot === 'Time Carded')!.id;
  await prisma.v1GameLineup.updateMany({ where: { gameId, revision: 1 }, data: { state: 'SUBMITTED' } });

  await service.executeCommand(authUser(ids.operator), gameId, 'start', 'event-time-start', {
    expectedVersion: await currentVersion(gameId), clientCommandId: 'event-time-start', takeoverToken: await token(gameId, 'event-time-start'),
    occurredAt: new Date().toISOString(), payload: {},
  });
  const cardEvent = await service.appendEvent(authUser(ids.operator), gameId, 'event-time-card', {
    expectedVersion: await currentVersion(gameId), clientEventId: 'event-time-card', takeoverToken: await token(gameId, 'event-time-card'),
    type: 'CARD' as never, sideId: homeSideId, participantId: cardedId, period: 1, clockMs: originalCardClock,
    occurredAt: new Date().toISOString(), payload: { card: 'YELLOW' },
  });
  cardEventId = cardEvent.event!.id;
  const goalEvent = await service.appendEvent(authUser(ids.operator), gameId, 'event-time-goal', {
    expectedVersion: await currentVersion(gameId), clientEventId: 'event-time-goal', takeoverToken: await token(gameId, 'event-time-goal'),
    type: 'GOAL' as never, sideId: homeSideId, participantId: scorerId, period: 1, clockMs: originalGoalClock,
    occurredAt: new Date().toISOString(), payload: {},
  });
  goalEventId = goalEvent.event!.id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('before result confirmation — operator console command', () => {
  it('appends a TIME_CORRECTION row and leaves the original event row untouched', async () => {
    const corrected = Math.floor(periodOneMs * 0.2);
    const result = await correct(gameId, cardEventId, 'event-time-card-fix-1', corrected);
    expect(result.eventTimeCorrection).toEqual({ eventId: cardEventId, period: 1, previousClockMs: originalCardClock, clockMs: corrected });
    expect(result.event).toMatchObject({ type: 'TIME_CORRECTION', correctsEventId: cardEventId, sideId: null, participantId: null, clockMs: corrected });

    const original = await prisma.v1GameEvent.findUniqueOrThrow({ where: { id: cardEventId } });
    expect(original.clockMs).toBe(originalCardClock);
    const row = await prisma.v1GameEvent.findFirstOrThrow({ where: { gameId, correctsEventId: cardEventId } });
    expect(row.payload).toMatchObject({ previousClockMs: originalCardClock, clockMs: corrected, reason: '심판 기록 대조', lane: 'OPERATOR' });
    expect(row.actorUserId).toBe(ids.operator);
  });

  it('applies the latest correction in the console snapshot without breaking the sequence', async () => {
    const latest = Math.floor(periodOneMs * 0.1);
    const result = await correct(gameId, cardEventId, 'event-time-card-fix-2', latest);
    expect(result.eventTimeCorrection?.previousClockMs).toBe(Math.floor(periodOneMs * 0.2));

    const snapshot = await service.listEvents(authUser(ids.operator), gameId, 0);
    expect(snapshot.gap).toBeNull();
    expect(snapshot.events.find((event) => event.id === cardEventId)?.clockMs).toBe(latest);
    expect(snapshot.events.filter((event) => event.type === 'TIME_CORRECTION')).toHaveLength(2);
  });

  it('replays an identical command idempotently without a second row', async () => {
    const dto = {
      expectedVersion: await currentVersion(gameId), clientEventId: 'event-time-card-fix-3',
      takeoverToken: await token(gameId, 'event-time-card-fix-3'), clockMs: Math.floor(periodOneMs * 0.12), reason: '재전송 확인',
    };
    const first = await service.correctEventTime(authUser(ids.operator), gameId, cardEventId, dto.clientEventId, dto);
    const count = await prisma.v1GameEvent.count({ where: { gameId } });
    const replay = await service.correctEventTime(authUser(ids.operator), gameId, cardEventId, dto.clientEventId, dto);
    expect(replay.replayed).toBe(true);
    expect(replay.sequence).toBe(first.sequence);
    expect(await prisma.v1GameEvent.count({ where: { gameId } })).toBe(count);
    // 다음 테스트들이 기대하는 현재 시각(0.1)으로 되돌린다 — 되돌리기도 새 정정 행이다.
    await correct(gameId, cardEventId, 'event-time-card-fix-4', Math.floor(periodOneMs * 0.1));
  });

  it('rejects an unchanged clock, a clock outside the period, a correction-row target and a direct TIME_CORRECTION append', async () => {
    expectHttpCode(await captureFailure(() => correct(gameId, cardEventId, 'event-time-same', Math.floor(periodOneMs * 0.1))), 422, 'EVENT_TIME_UNCHANGED');
    expectHttpCode(await captureFailure(() => correct(gameId, cardEventId, 'event-time-range', periodOneMs + 10 * 60_000)), 422, 'EVENT_CLOCK_OUT_OF_RANGE');
    const correctionRow = await prisma.v1GameEvent.findFirstOrThrow({ where: { gameId, correctsEventId: cardEventId } });
    expectHttpCode(await captureFailure(() => correct(gameId, correctionRow.id, 'event-time-target-row', 1_000)), 422, 'EVENT_TIME_NOT_CORRECTABLE');
    expectHttpCode(await captureFailure(async () => service.reverseEvent(authUser(ids.operator), gameId, correctionRow.id, 'event-time-reverse-row', {
      expectedVersion: await currentVersion(gameId), clientEventId: 'event-time-reverse-row', takeoverToken: await token(gameId, 'event-time-reverse-row'), reason: '정정 취소',
    })), 422, 'EVENT_NOT_REVERSIBLE');
    expectHttpCode(await captureFailure(async () => service.appendEvent(authUser(ids.operator), gameId, 'event-time-direct', {
      expectedVersion: await currentVersion(gameId), clientEventId: 'event-time-direct', takeoverToken: await token(gameId, 'event-time-direct'),
      type: 'TIME_CORRECTION' as never, period: 1, clockMs: 1_000, occurredAt: new Date().toISOString(), payload: {},
    })), 422, 'EVENT_INVALID');
  });

  it('enforces the pointer contract in the database (only TIME_CORRECTION rows, timed targets in the same game)', async () => {
    const lastSequence = (await prisma.v1Game.findUniqueOrThrow({ where: { id: gameId } })).lastSequence;
    await expect(prisma.v1GameEvent.create({
      data: {
        gameId, sequence: lastSequence + 100, clientEventId: 'db-guard-1', payloadHash: 'x', type: 'TIME_CORRECTION', period: 1, clockMs: 0,
        occurredAt: new Date(), actorUserId: ids.operator, payload: {},
      },
    })).rejects.toThrow();
    await expect(prisma.v1GameEvent.create({
      data: {
        gameId, sequence: lastSequence + 101, clientEventId: 'db-guard-2', payloadHash: 'x', type: 'FOUL', period: 1, clockMs: 0,
        occurredAt: new Date(), actorUserId: ids.operator, correctsEventId: cardEventId, payload: {},
      },
    })).rejects.toThrow();
  });

  it('derives the submitted result from corrected clocks with an unchanged score and card count', async () => {
    const correctedGoal = Math.floor(periodOneMs * 0.05);
    await correct(gameId, goalEventId, 'event-time-goal-fix-live', correctedGoal);
    await service.executeCommand(authUser(ids.operator), gameId, 'end', 'event-time-end', {
      expectedVersion: await currentVersion(gameId), clientCommandId: 'event-time-end', takeoverToken: await token(gameId, 'event-time-end'),
      occurredAt: new Date().toISOString(), payload: {},
    });
    const revision = await prisma.v1GameResultRevision.findFirstOrThrow({ where: { gameId }, orderBy: { revision: 'desc' } });
    expect(revision.state).toBe(V1GameResultRevisionState.SUBMITTED);
    expect(revision.score).toMatchObject({ home: 1, away: 0 });
    expect(revision.goalEvents).toEqual([expect.objectContaining({ id: goalEventId, minute: minute(correctedGoal) })]);
    const rows = await prisma.v1GameResultParticipant.findMany({ where: { resultRevisionId: revision.id } });
    expect(rows.find((row) => row.participantId === scorerId)?.goals).toBe(1);
    expect(rows.find((row) => row.participantId === cardedId)?.cards).toMatchObject({ yellow: 1, red: 0 });
  });

  it('re-submits the SUBMITTED revision with the corrected minute after the game ended', async () => {
    const before = await prisma.v1GameResultRevision.findFirstOrThrow({ where: { gameId }, orderBy: { revision: 'desc' } });
    const correctedGoal = Math.floor(periodOneMs * 0.4);
    const result = await correct(gameId, goalEventId, 'event-time-goal-fix-submitted', correctedGoal);
    expect(result.revisionEventTimeSync).toMatchObject({ revisionState: 'SUBMITTED', supersedesRevisionId: before.id });
    const after = await prisma.v1GameResultRevision.findUniqueOrThrow({ where: { id: result.revisionEventTimeSync!.revisionId } });
    expect(after.state).toBe(V1GameResultRevisionState.SUBMITTED);
    expect(after.score).toEqual(before.score);
    expect(after.eventsHash).toBe(before.eventsHash);
    expect(after.goalEvents).toEqual([expect.objectContaining({ id: goalEventId, minute: minute(correctedGoal) })]);
    const beforeRows = await prisma.v1GameResultParticipant.findMany({ where: { resultRevisionId: before.id }, orderBy: { participantId: 'asc' } });
    const afterRows = await prisma.v1GameResultParticipant.findMany({ where: { resultRevisionId: after.id }, orderBy: { participantId: 'asc' } });
    const stats = (rows: typeof beforeRows) => rows.map(({ participantId, goals, assists, fouls, cards }) => ({ participantId, goals, assists, fouls, cards }));
    expect(stats(afterRows)).toEqual(stats(beforeRows));
  });
});

describe('after result confirmation', () => {
  let officialRevisionId: string;

  beforeAll(async () => {
    const submitted = await prisma.v1GameResultRevision.findFirstOrThrow({ where: { gameId }, orderBy: { revision: 'desc' } });
    const officialized = await resultReview.officializeResultRevision(authUser(ids.operator), gameId, submitted.id, 'event-time-officialize', {
      expectedVersion: await currentVersion(gameId),
      clientCommandId: 'event-time-officialize',
      projectionPreviewHash: canonicalGameCommandPayloadHash({
        score: submitted.score, goalEvents: submitted.goalEvents, eventsHash: submitted.eventsHash, mvpParticipantId: submitted.mvpParticipantId,
      }),
    });
    officialRevisionId = officialized.revisionId;
  });

  it('closes the console path with RESULT_ALREADY_OFFICIAL', async () => {
    expectHttpCode(await captureFailure(() => correct(gameId, goalEventId, 'event-time-after-official', 1_000)), 409, 'RESULT_ALREADY_OFFICIAL');
  });

  it('refuses the tournament director on the admin path', async () => {
    expectHttpCode(await captureFailure(async () => resultReview.correctOfficialEventTime(authUser(ids.operator), gameId, goalEventId, 'event-time-director', {
      expectedVersion: await currentVersion(gameId), clientCommandId: 'event-time-director', clockMs: 1_000, reason: '감독 정정',
    })), 403, 'PERMISSION_DENIED');
  });

  it('lets a platform ops admin correct with a reason: new OFFICIAL revision, same score and stats, audited, public timeline updated', async () => {
    const correctedGoal = Math.floor(periodOneMs * 0.15);
    const result = await resultReview.correctOfficialEventTime(authUser(ids.platformOps), gameId, goalEventId, 'event-time-admin', {
      expectedVersion: await currentVersion(gameId), clientCommandId: 'event-time-admin', clockMs: correctedGoal, reason: '경기 감독관 보고서 대조',
    });
    expect(result.eventTimeCorrection).toMatchObject({ eventId: goalEventId, clockMs: correctedGoal, supersededRevisionId: officialRevisionId });
    const game = await prisma.v1Game.findUniqueOrThrow({ where: { id: gameId } });
    expect(game.currentOfficialRevisionId).toBe(result.revisionId);
    const before = await prisma.v1GameResultRevision.findUniqueOrThrow({ where: { id: officialRevisionId } });
    const after = await prisma.v1GameResultRevision.findUniqueOrThrow({ where: { id: result.revisionId } });
    expect(after.state).toBe(V1GameResultRevisionState.OFFICIAL);
    expect(after.supersedesId).toBe(officialRevisionId);
    expect(after.score).toEqual(before.score);
    expect(after.goalEvents).toEqual([expect.objectContaining({ id: goalEventId, minute: minute(correctedGoal) })]);

    const correction = await prisma.v1GameEvent.findFirstOrThrow({ where: { gameId, correctsEventId: goalEventId }, orderBy: { sequence: 'desc' } });
    expect(correction.payload).toMatchObject({ lane: 'PLATFORM_ADMIN', reason: '경기 감독관 보고서 대조', clockMs: correctedGoal });
    expect(correction.actorUserId).toBe(ids.platformOps);
    const audit = await prisma.v1OperationAudit.findFirstOrThrow({ where: { resourceId: gameId, action: 'EVENT_TIME_CORRECT_OFFICIAL' } });
    expect(audit.reason).toBe('경기 감독관 보고서 대조');

    const match = await publicRecords.getMatch(ids.tournament, ids.fixture, undefined);
    const goal = match.events.find((event) => event.type === 'GOAL');
    // 공식 스냅샷은 분(올림)만 저장하지만 공개 행은 정정된 정확한 시각을 싣는다.
    expect(goal?.clockMs).toBe(correctedGoal);
    const cardRow = match.events.find((event) => event.type === 'CARD');
    expect(cardRow?.clockMs).toBe(Math.floor(periodOneMs * 0.1));
    expect(match.events.some((event) => (event.type as string) === 'TIME_CORRECTION')).toBe(false);
  });
});
