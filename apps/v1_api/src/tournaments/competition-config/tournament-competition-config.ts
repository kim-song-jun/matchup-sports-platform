import { Prisma, V1CompetitionKind } from '@prisma/client';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { V1AuthUser } from '../../auth/v1-auth-user';
import { AdminContextService } from '../../common/admin-context.service';
import { PrismaService } from '../../prisma/prisma.service';
import { normalizeCompetitionSportCode } from './competition-config';
import { ChangeTournamentCompetitionConfigDto } from './competition-config.dto';
import { ALL_COMPETITION_KINDS, findTournamentOnSurface, findTournamentOnSurfaceOrThrow, TOURNAMENT_KINDS } from '../tournament-surface-lookup';
import { computePeriodCount } from '../../games/games.service';

type ConfigCountClient = {
  v1TeamMatch: PrismaService['v1TeamMatch'];
  v1TournamentStanding: PrismaService['v1TournamentStanding'];
};

function teamMatchOwnershipWhere(kind: V1CompetitionKind | null, tournamentId: string): Prisma.V1TeamMatchWhereInput {
  if (kind === V1CompetitionKind.regular_league) {
    return { tournamentId, leagueId: tournamentId, tournamentDetails: { is: null } };
  }
  return { tournamentId, leagueId: null, tournamentDetails: { isNot: null } };
}

/** Rows the internal repair may move without crossing a history boundary. */
export function mutableTeamMatchRepointWhere(
  staleVersionIds: readonly string[],
): Prisma.V1TeamMatchWhereInput {
  const untouchedGame: Prisma.V1TeamMatchWhereInput = {
    OR: [
      { game: null },
      {
        game: {
          is: {
            sourceType: 'TEAM_MATCH',
            state: 'SCHEDULED',
            lineups: { none: {} },
            events: { none: {} },
            resultRevisions: { none: {} },
            periods: { none: { OR: [
              { state: { not: 'SCHEDULED' } },
              { startedAt: { not: null } },
              { endedAt: { not: null } },
              { pausedAt: { not: null } },
            ] } },
          },
        },
      },
    ],
  };
  return {
    competitionConfigVersionId: { in: [...staleVersionIds] },
    status: { not: 'completed' },
    AND: [
      {
        OR: [
          { tournamentId: null, leagueId: null, tournamentDetails: { is: null } },
          {
            tournamentId: { not: null },
            leagueId: null,
            tournamentDetails: { isNot: null },
            tournament: { is: { OR: [{ kind: V1CompetitionKind.regular_tournament }, { kind: null }] } },
          },
          {
            tournamentId: { not: null },
            leagueId: { not: null },
            tournamentDetails: { is: null },
            tournament: { is: { kind: V1CompetitionKind.regular_league } },
          },
        ],
      },
      untouchedGame,
    ],
  };
}

async function calculateImpact(
  db: ConfigCountClient,
  matchOwnership: Prisma.V1TeamMatchWhereInput,
) {
  const [fixtureCount, completedFixtureCount, standingCount, recordedStandingCount, legacyResultFixtureCount, startedGameCount] = await Promise.all([
    db.v1TeamMatch.count({ where: matchOwnership }),
    db.v1TeamMatch.count({ where: { ...matchOwnership, status: 'completed' } }),
    db.v1TournamentStanding.count({ where: { group: { tournamentId: matchOwnership.tournamentId as string } } }),
    db.v1TournamentStanding.count({
      where: {
        group: { tournamentId: matchOwnership.tournamentId as string },
        OR: [
          { points: { not: 0 } }, { wins: { not: 0 } }, { draws: { not: 0 } },
          { losses: { not: 0 } }, { goalsFor: { not: 0 } }, { goalsAgainst: { not: 0 } },
        ],
      },
    }),
    db.v1TeamMatch.count({
      where: { ...matchOwnership, game: { is: { sourceType: 'TEAM_MATCH', resultRevisions: { some: {} } } } },
    }),
    db.v1TeamMatch.count({
      where: {
        ...matchOwnership,
        game: { is: { sourceType: 'TEAM_MATCH', OR: [
          { state: { not: 'SCHEDULED' } }, { lineups: { some: {} } }, { events: { some: {} } },
          { resultRevisions: { some: {} } },
          { periods: { some: { OR: [{ state: { not: 'SCHEDULED' } }, { startedAt: { not: null } }, { endedAt: { not: null } }, { pausedAt: { not: null } }] } } },
        ] } },
      },
    }),
  ]);
  return {
    fixtureCount,
    completedFixtureCount,
    standingCount,
    requiresRecalculation: completedFixtureCount > 0 || recordedStandingCount > 0 || legacyResultFixtureCount > 0 || startedGameCount > 0,
  };
}

export class TournamentCompetitionConfig {
  constructor(
    private readonly prisma: PrismaService,
    private readonly adminContext: AdminContextService,
  ) {}

  async change(
    user: V1AuthUser,
    tournamentId: string,
    dto: ChangeTournamentCompetitionConfigDto,
  ) {
    return this.changeWithKinds(user, tournamentId, dto, TOURNAMENT_KINDS);
  }

  /**
   * The repair runner is an internal, all-competition-kind operation. Keep it
   * separate from the public tournament PATCH so regular leagues cannot gain
   * access to that endpoint by accident.
   */
  async changeForInternalRepoint(
    user: V1AuthUser,
    tournamentId: string,
    dto: ChangeTournamentCompetitionConfigDto,
  ) {
    return this.changeWithKinds(user, tournamentId, dto, ALL_COMPETITION_KINDS);
  }

  private async changeWithKinds(
    user: V1AuthUser,
    tournamentId: string,
    dto: ChangeTournamentCompetitionConfigDto,
    allowedKinds: readonly V1CompetitionKind[],
  ) {
    const admin = await this.adminContext.getMutationAdmin(user.id);
    const tournament = await findTournamentOnSurface(this.prisma, allowedKinds, {
      where: { id: tournamentId, deletedAt: null },
      include: { sport: true },
    });
    if (!tournament) {
      throw new NotFoundException({
        code: 'TOURNAMENT_NOT_FOUND',
        message: '대회를 찾을 수 없어요.',
      });
    }
    if (tournament.updatedAt.toISOString() !== dto.expectedVersion) {
      throw new ConflictException({
        code: 'TOURNAMENT_VERSION_CONFLICT',
        message: '대회 설정이 다른 요청에서 변경됐어요. 다시 확인해 주세요.',
      });
    }
    const selected = await this.prisma.v1CompetitionConfigVersion.findUnique({
      where: { id: dto.competitionConfigVersionId },
    });
    if (!selected) {
      throw new NotFoundException({
        code: 'COMPETITION_CONFIG_NOT_FOUND',
        message: '경기 설정을 찾을 수 없어요.',
      });
    }
    if (selected.sportCode !== normalizeCompetitionSportCode(tournament.sport.code)) {
      throw new BadRequestException({
        code: 'COMPETITION_CONFIG_SPORT_MISMATCH',
        message: '대회 종목과 경기 설정 종목이 달라요.',
      });
    }

    const effectivePreviewHash = selected.contentHash;

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`league-fixture-generation:${tournamentId}`}, 0))`;
      // Match creators use the same tournament advisory key and then lock
      // canonical rows before reading their game state. Keep this lock order
      // stable (tournament -> Game id -> TeamMatch id) so a config change
      // cannot approve a stale preview while a creator is committing.
      await tx.$queryRaw`SELECT id FROM v1_tournaments WHERE id = ${tournamentId} FOR UPDATE`;
      // GamesService locks Game before resolving/locking its TeamMatch. The
      // explicit OF clause prevents the join from taking an implicit TM lock.
      const lockedTournament = await findTournamentOnSurface(tx, allowedKinds, {
        where: { id: tournamentId, deletedAt: null },
        include: { sport: true },
      });
      if (!lockedTournament || lockedTournament.updatedAt.toISOString() !== dto.expectedVersion) {
        throw new ConflictException({
          code: 'TOURNAMENT_VERSION_CONFLICT',
          message: '대회 설정이 다른 요청에서 변경됐어요. 다시 확인해 주세요.',
        });
      }
      const matchOwnership = teamMatchOwnershipWhere(lockedTournament.kind, tournamentId);
      if (lockedTournament.kind === V1CompetitionKind.regular_league) {
        await tx.$queryRaw`SELECT g.id FROM v1_games g JOIN v1_team_matches tm ON tm.id = g.team_match_id WHERE tm.tournament_id = ${tournamentId} AND tm.league_id = ${tournamentId} AND g.source_type = 'TEAM_MATCH' ORDER BY g.id FOR UPDATE OF g`;
        await tx.$queryRaw`SELECT tm.id FROM v1_team_matches tm WHERE tm.tournament_id = ${tournamentId} AND tm.league_id = ${tournamentId} AND NOT EXISTS (SELECT 1 FROM v1_tournament_match_details d WHERE d.team_match_id = tm.id) ORDER BY tm.id FOR UPDATE OF tm`;
      } else {
        await tx.$queryRaw`SELECT g.id FROM v1_games g JOIN v1_team_matches tm ON tm.id = g.team_match_id WHERE tm.tournament_id = ${tournamentId} AND tm.league_id IS NULL AND g.source_type = 'TEAM_MATCH' ORDER BY g.id FOR UPDATE OF g`;
        await tx.$queryRaw`SELECT tm.id FROM v1_team_matches tm WHERE tm.tournament_id = ${tournamentId} AND tm.league_id IS NULL AND EXISTS (SELECT 1 FROM v1_tournament_match_details d WHERE d.team_match_id = tm.id AND d.tournament_id = tm.tournament_id) ORDER BY tm.id FOR UPDATE OF tm`;
      }
      const impact = await calculateImpact(tx, matchOwnership);
      if (impact.requiresRecalculation && (!dto.confirmRecalculation || dto.previewHash !== effectivePreviewHash)) {
        return { changed: false as const, currentCompetitionConfigVersionId: lockedTournament.competitionConfigVersionId, requestedCompetitionConfigVersionId: selected.id, expectedVersion: lockedTournament.updatedAt.toISOString(), previewHash: effectivePreviewHash, impact, confirmationRequired: true, teamMatchesRepointed: 0 };
      }
      if (lockedTournament.competitionConfigVersionId === selected.id) {
        return { changed: false as const, currentCompetitionConfigVersionId: selected.id, expectedVersion: lockedTournament.updatedAt.toISOString(), previewHash: effectivePreviewHash, impact, confirmationRequired: false, teamMatchesRepointed: 0 };
      }
      const changed = await tx.v1Tournament.updateMany({
        where: { id: lockedTournament.id, updatedAt: lockedTournament.updatedAt },
        data: { competitionConfigVersionId: selected.id },
      });
      if (changed.count !== 1) throw new ConflictException({ code: 'TOURNAMENT_VERSION_CONFLICT', message: '대회 설정이 다른 요청에서 변경됐어요. 다시 확인해 주세요.' });
      // Existing games, periods, lineups, events and revisions stay pinned.
      // Only untouched canonical TeamMatches/games follow the new pin.
      const repointedTeamMatches = await tx.v1TeamMatch.updateMany({
        where: {
          ...matchOwnership,
          status: { not: 'completed' },
          OR: [
            { game: null },
            { game: { is: { sourceType: 'TEAM_MATCH', state: 'SCHEDULED', lineups: { none: {} }, events: { none: {} }, resultRevisions: { none: {} }, periods: { none: { OR: [{ state: { not: 'SCHEDULED' } }, { startedAt: { not: null } }, { endedAt: { not: null } }, { pausedAt: { not: null } }] } } } } },
          ],
        },
        data: { competitionConfigVersionId: selected.id },
      });
      await tx.v1Game.updateMany({
        where: {
          teamMatch: { is: { ...matchOwnership, status: { not: 'completed' } } },
          sourceType: 'TEAM_MATCH',
          state: 'SCHEDULED',
          lineups: { none: {} },
          events: { none: {} },
          resultRevisions: { none: {} },
          periods: { none: { OR: [{ state: { not: 'SCHEDULED' } }, { startedAt: { not: null } }, { endedAt: { not: null } }, { pausedAt: { not: null } }] } },
        },
        data: { competitionConfigVersionId: selected.id },
      });
      const untouchedGames = await tx.v1Game.findMany({
        where: {
          teamMatch: { is: { ...matchOwnership, status: { not: 'completed' } } },
          sourceType: 'TEAM_MATCH', state: 'SCHEDULED', lineups: { none: {} }, events: { none: {} }, resultRevisions: { none: {} },
          periods: { none: { OR: [{ state: { not: 'SCHEDULED' } }, { startedAt: { not: null } }, { endedAt: { not: null } }, { pausedAt: { not: null } }] } },
        },
        select: { id: true, periods: { select: { id: true, number: true }, orderBy: { number: 'asc' } } },
      });
      const desiredPeriodCount = computePeriodCount(selected.periods);
      for (const game of untouchedGames) {
        if (game.periods.length < desiredPeriodCount) {
          const existingNumbers = new Set(game.periods.map((period) => period.number));
          await tx.v1GamePeriod.createMany({
            data: Array.from({ length: desiredPeriodCount }, (_, index) => index + 1)
              .filter((number) => !existingNumbers.has(number))
              .map((number) => ({ gameId: game.id, number })),
          });
        } else if (game.periods.length > desiredPeriodCount) {
          await tx.v1GamePeriod.deleteMany({ where: { gameId: game.id, number: { gt: desiredPeriodCount } } });
        }
      }
      await this.adminContext.logAdminAction(
        admin,
        {
          action: 'tournament.competition_config.change',
          targetType: 'tournament',
          targetId: tournamentId,
          beforeJson: { competitionConfigVersionId: tournament.competitionConfigVersionId },
          afterJson: { competitionConfigVersionId: selected.id, impact },
        },
        tx,
      );
      // 이 재조회는 CAS 갱신 직후 최신 행을 읽는 것이라 종류 조건이 이미 위에서
      // 검증됐지만, **원시 호출을 남기지 않는다** — 남기면 다음 사람이 여기만 예외라고
      // 읽고 새 원시 호출을 붙일 여지가 생긴다.
      return {
        changed: true as const,
        updated: await findTournamentOnSurfaceOrThrow(tx, allowedKinds, { where: { id: tournamentId } }),
        impact,
        teamMatchesRepointed: repointedTeamMatches.count,
      };
    });
    if (!updated.changed) return updated;
    return {
      changed: true,
      currentCompetitionConfigVersionId: selected.id,
      expectedVersion: updated.updated.updatedAt.toISOString(),
      previewHash: effectivePreviewHash,
      impact: updated.impact,
      confirmationRequired: false,
      teamMatchesRepointed: updated.teamMatchesRepointed,
    };
  }
}
