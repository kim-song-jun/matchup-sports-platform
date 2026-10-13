import { randomUUID } from 'node:crypto';
import { V1GameSideKey, V1GameSourceType } from '@prisma/client';
import type { V1GamePeriodState, V1GameState } from '@prisma/client';
import { OperationAuditWriterService } from '../../src/common/audit/operation-audit-writer.service';
import { GameTakeoverService } from '../../src/games/game-takeover.service';
import { GamesService, canonicalGameCommandPayloadHash } from '../../src/games/games.service';
import type { GameActorScope, GameSourceCreationInput } from '../../src/games/games.types';
import type { PrismaService } from '../../src/prisma/prisma.service';
import { FOOTBALL_V1_CONFIG } from '../../src/tournaments/competition-config/competition-config';
import {
  FOOTBALL_COMPETITION_CONFIG_ID,
  seedCompetitionConfigVersions,
} from '../../src/tournaments/competition-config/competition-config-backfill';

export const CLOCK_EXPIRY_PERIOD_MS = FOOTBALL_V1_CONFIG.periods[0].durationMinutes * 60_000;

/** The isolated integration environment owns the DB; every fixture row also has a unique ID. */
export async function seedClockExpiryFixture(prisma: PrismaService) {
  await seedCompetitionConfigVersions(prisma);
  const suffix = randomUUID();
  const user = await prisma.v1User.create({
    data: {
      email: `clock-expiry-${suffix}@example.test`,
      accountStatus: 'active',
      onboardingStatus: 'completed',
    },
  });
  const sport = await prisma.v1Sport.upsert({
    where: { code: 'football' },
    update: {},
    create: { code: 'football', name: 'Clock expiry football' },
  });
  const region = await prisma.v1Region.create({
    data: { code: `clock-expiry-${suffix}`, name: 'Clock expiry region', level: 1 },
  });
  const [home, away] = await Promise.all(['Home', 'Away'].map((name) => prisma.v1Team.create({
    data: { ownerUserId: user.id, sportId: sport.id, regionId: region.id, name: `Clock expiry ${name}` },
  })));
  const tournament = await prisma.v1Tournament.create({
    data: {
      sportId: sport.id,
      title: `Clock expiry ${suffix}`,
      competitionConfigVersionId: FOOTBALL_COMPETITION_CONFIG_ID,
    },
  });
  const [homeRegistration, awayRegistration] = await Promise.all([home, away].map((team) =>
    prisma.v1TournamentRegistration.create({
      data: { tournamentId: tournament.id, teamId: team.id, appliedByUserId: user.id, status: 'confirmed' },
    }),
  ));
  await prisma.v1TournamentStaffAssignment.create({
    data: {
      tournamentId: tournament.id,
      userId: user.id,
      role: 'TOURNAMENT_DIRECTOR',
      grantedByUserId: user.id,
    },
  });
  return {
    prisma,
    service: new GamesService(prisma, new OperationAuditWriterService(), new GameTakeoverService()),
    authUser: {
      id: user.id,
      email: user.email,
      accountStatus: 'active' as const,
      onboardingStatus: 'completed' as const,
    },
    sportId: sport.id,
    regionId: region.id,
    homeTeamId: home.id,
    awayTeamId: away.id,
    homeRegistrationId: homeRegistration.id,
    awayRegistrationId: awayRegistration.id,
    tournamentId: tournament.id,
  };
}

type ClockExpiryFixture = Awaited<ReturnType<typeof seedClockExpiryFixture>>;

export async function createClockExpiryGame(
  fixture: ClockExpiryFixture,
  input: {
    readonly gameState?: V1GameState;
    readonly periodState?: V1GamePeriodState;
    readonly startedAt: Date | null;
    readonly pausedTotalMs?: number;
    readonly pausedAt?: Date | null;
    readonly scheduledEndAt?: Date;
  },
) {
  const { prisma } = fixture;
  const match = await prisma.v1TeamMatch.create({
    data: {
      tournamentId: fixture.tournamentId,
      hostTeamId: fixture.homeTeamId,
      approvedApplicantTeamId: fixture.awayTeamId,
      createdByUserId: fixture.authUser.id,
      sportId: fixture.sportId,
      regionId: fixture.regionId,
      title: `Clock expiry ${randomUUID()}`,
      status: 'matched',
      startAt: new Date(Date.now() - 2 * CLOCK_EXPIRY_PERIOD_MS),
      endAt: input.scheduledEndAt ?? new Date(Date.now() + CLOCK_EXPIRY_PERIOD_MS),
      competitionConfigVersionId: FOOTBALL_COMPETITION_CONFIG_ID,
    },
  });
  await prisma.v1TournamentMatchDetails.create({
    data: {
      teamMatchId: match.id,
      tournamentId: fixture.tournamentId,
      round: 'group',
      fixtureNumber: (await prisma.v1TournamentMatchDetails.count({
        where: { tournamentId: fixture.tournamentId },
      })) + 1,
      homeRegistrationId: fixture.homeRegistrationId,
      awayRegistrationId: fixture.awayRegistrationId,
    },
  });
  const source: GameSourceCreationInput = {
    sourceType: V1GameSourceType.TEAM_MATCH,
    sourceId: match.id,
    competitionConfigVersionId: FOOTBALL_COMPETITION_CONFIG_ID,
    sides: [
      { sideKey: V1GameSideKey.HOME, teamId: fixture.homeTeamId, displayNameSnapshot: 'Clock expiry Home' },
      { sideKey: V1GameSideKey.AWAY, teamId: fixture.awayTeamId, displayNameSnapshot: 'Clock expiry Away' },
    ],
    participants: [],
  };
  const actor: GameActorScope = {
    actorType: 'USER',
    actorUserId: fixture.authUser.id,
    role: 'tournament_director',
    tournamentId: fixture.tournamentId,
    fixtureId: match.id,
  };
  const game = await prisma.$transaction((tx) => fixture.service.createFromSourceInTransaction(tx, source, {
    actor,
    expectedVersion: 0,
    durableCommandId: `clock-expiry-create-${match.id}`,
    payloadHash: canonicalGameCommandPayloadHash(source),
  }));
  const state = input.gameState ?? 'LIVE';
  await prisma.$transaction(async (tx) => {
    await tx.v1Game.update({
      where: { id: game.gameId },
      data: { state, version: state === 'SCHEDULED' ? 0 : 1 },
    });
    await tx.v1GamePeriod.updateMany({
      where: { gameId: game.gameId, number: 1 },
      data: {
        state: input.periodState ?? (state === 'SCHEDULED' ? 'SCHEDULED' : state === 'ENDED' ? 'ENDED' : 'LIVE'),
        startedAt: input.startedAt,
        pausedTotalMs: input.pausedTotalMs ?? 0,
        pausedAt: input.pausedAt ?? null,
        endedAt: state === 'ENDED' ? new Date(Date.now() - 60_000) : null,
      },
    });
  });
  return game.gameId;
}

export async function clockExpirySnapshot(prisma: PrismaService, gameId: string) {
  const [game, periods, endPeriodAudits, revisions] = await Promise.all([
    prisma.v1Game.findUniqueOrThrow({
      where: { id: gameId },
      select: { state: true, version: true, currentOfficialRevisionId: true, lastSequence: true },
    }),
    prisma.v1GamePeriod.findMany({
      where: { gameId },
      orderBy: { number: 'asc' },
      select: { number: true, state: true, startedAt: true, endedAt: true, pausedTotalMs: true, pausedAt: true },
    }),
    prisma.v1OperationAudit.findMany({
      where: { resourceType: 'GAME', resourceId: gameId, action: 'GAME_END_PERIOD' },
      select: { actorType: true, actorUserId: true, systemActor: true, before: true, after: true },
    }),
    prisma.v1GameResultRevision.findMany({ where: { gameId }, select: { id: true, state: true } }),
  ]);
  return { game, periods, endPeriodAudits, revisions };
}
