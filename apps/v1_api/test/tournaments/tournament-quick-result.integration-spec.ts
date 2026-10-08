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
