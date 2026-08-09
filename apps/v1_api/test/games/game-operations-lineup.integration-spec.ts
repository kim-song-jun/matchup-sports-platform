import { V1GameSideKey, V1GameSourceType } from '@prisma/client';
import { OperationAuditWriterService } from '../../src/common/audit/operation-audit-writer.service';
import { GameTakeoverService } from '../../src/games/game-takeover.service';
import { canonicalGameCommandPayloadHash, GamesService } from '../../src/games/games.service';
import type { GameCommandContext, GameSourceCreationInput } from '../../src/games/games.types';
import { PrismaService } from '../../src/prisma/prisma.service';

/**
 * T3 Task 2 — the live recording console needs to read both sides' lineups
 * for a TEAM_MATCH game (a recorder has to tap opponent players too), but
 * pre-kickoff lineup privacy (see games.service.ts `listLineups`) must still
 * hold before the game starts. This proves `listOperationsLineups` narrows
 * to own-side only while SCHEDULED and opens up to both sides once LIVE.
 */

const ids = {
  hostUser: '6b000000-0000-4000-8000-000000000001',
  opponentUser: '6b000000-0000-4000-8000-000000000002',
  sport: '6b000000-0000-4000-8000-000000000010',
  region: '6b000000-0000-4000-8000-000000000011',
  hostTeam: '6b000000-0000-4000-8000-000000000020',
  opponentTeam: '6b000000-0000-4000-8000-000000000021',
  teamMatch: '6b000000-0000-4000-8000-000000000030',
} as const;

const prisma = new PrismaService();
const games = new GamesService(prisma, new OperationAuditWriterService(), new GameTakeoverService());

const authUser = (id: string) => ({
  id,
  email: `${id}@example.test`,
  accountStatus: 'active' as const,
  onboardingStatus: 'completed' as const,
});

function creationContext(commandId: string, payload: unknown): GameCommandContext {
  return {
    actor: { actorType: 'USER', actorUserId: ids.hostUser, role: 'team_owner' },
    expectedVersion: 0,
    durableCommandId: commandId,
    payloadHash: canonicalGameCommandPayloadHash(payload),
  };
}

describe('T3 Task 2 — GamesService.listOperationsLineups (both-sides live lineup read)', () => {
  let gameId: string;
  let hostSideId: string;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for T3 Task 2 integration verification');
    }
    await prisma.$connect();
    const config = await prisma.v1CompetitionConfigVersion.findFirst({
      where: { name: 'futsal-v1', status: 'ACTIVE' },
      orderBy: { version: 'desc' },
    });
    if (config === null) {
      throw new Error('Task 11 futsal-v1 preset is required');
    }
    const configId = config.id;

    await prisma.v1User.createMany({
      data: [ids.hostUser, ids.opponentUser].map((id, index) => ({
        id,
        email: `task-t3-ops-lineup-${index}@example.test`,
        accountStatus: 'active',
        onboardingStatus: 'completed',
      })),
    });
    await prisma.v1Sport.create({
      data: { id: ids.sport, code: 'futsal', name: 'T3 Ops Lineup Futsal' },
    });
    await prisma.v1Region.create({
      data: { id: ids.region, code: 'T3_OPS_LINEUP_REGION', name: 'T3 Ops Lineup Region', level: 1 },
    });
    await prisma.v1Team.createMany({
      data: [
        { id: ids.hostTeam, ownerUserId: ids.hostUser, sportId: ids.sport, regionId: ids.region, name: 'T3 Ops Lineup Host' },
        { id: ids.opponentTeam, ownerUserId: ids.opponentUser, sportId: ids.sport, regionId: ids.region, name: 'T3 Ops Lineup Opponent' },
      ],
    });
    await prisma.v1TeamMembership.createMany({
      data: [
        { teamId: ids.hostTeam, userId: ids.hostUser, role: 'owner', status: 'active' },
        { teamId: ids.opponentTeam, userId: ids.opponentUser, role: 'owner', status: 'active' },
      ],
    });
    await prisma.v1TeamMatch.create({
      data: {
        id: ids.teamMatch,
        hostTeamId: ids.hostTeam,
        createdByUserId: ids.hostUser,
        sportId: ids.sport,
        regionId: ids.region,
        title: 'T3 ops lineup match',
        placeName: 'T3 futsal court',
        startAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
        approvedApplicantTeamId: ids.opponentTeam,
        competitionConfigVersionId: configId,
      },
    });

    const input: GameSourceCreationInput = {
      sourceType: V1GameSourceType.TEAM_MATCH,
      sourceId: ids.teamMatch,
      competitionConfigVersionId: configId,
      sides: [
        { sideKey: V1GameSideKey.HOME, teamId: ids.hostTeam, displayNameSnapshot: 'T3 Ops Lineup Host' },
        { sideKey: V1GameSideKey.AWAY, teamId: ids.opponentTeam, displayNameSnapshot: 'T3 Ops Lineup Opponent' },
      ],
      participants: [],
    };
    const created = await prisma.$transaction((tx) =>
      games.createFromSourceInTransaction(tx, input, creationContext('ops-lineup-source-create', input)),
    );
    gameId = created.gameId;
    hostSideId = (
      await prisma.v1GameSide.findFirstOrThrow({ where: { gameId, sideKey: V1GameSideKey.HOME } })
    ).id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('SCHEDULED 상태에서는 호스트 매니저에게도 자기 사이드만 돌려준다(사전 라인업 비공개 유지)', async () => {
    const result = await games.listOperationsLineups(authUser(ids.hostUser), gameId);
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((lineup) => lineup.sideId === hostSideId)).toBe(true);
  });

  it('경기가 LIVE로 전환되면 양쪽 사이드를 모두 돌려준다', async () => {
    await prisma.v1GamePeriod.updateMany({ where: { gameId, number: 1 }, data: { state: 'LIVE', startedAt: new Date() } });
    await prisma.v1Game.update({ where: { id: gameId }, data: { state: 'LIVE' } });

    const result = await games.listOperationsLineups(authUser(ids.hostUser), gameId);
    const sideIds = new Set(result.map((lineup) => lineup.sideId));
    expect(sideIds.has(hostSideId)).toBe(true);
    expect(sideIds.size).toBe(2);
  });
});
