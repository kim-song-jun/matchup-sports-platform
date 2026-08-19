import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PublicRecordsQueryDto } from './dto/public-records-query.dto';
import { decodeRecordCursor, encodeRecordCursor, type RecordCursor } from './public-cursor';

interface TeamRecordFactRow {
  readonly id: string;
  readonly revisionId: string;
  readonly gameId: string;
  readonly opponentTeamId: string | null;
  readonly tournamentId: string | null;
  readonly result: string;
  readonly goalsFor: number;
  readonly goalsAgainst: number;
  readonly officialAt: Date;
  readonly resultRevision: {
    readonly supersedesId: string | null;
    readonly score: Prisma.JsonValue;
    readonly game: {
      readonly currentOfficialRevisionId: string | null;
      readonly teamMatchId: string | null;
      readonly tournamentFixture: { readonly id: string; readonly round: string } | null;
      readonly sides: readonly { readonly teamId: string | null; readonly sideKey: 'HOME' | 'AWAY' }[];
    };
  };
}

/**
 * Task 24 -- `GET /teams/:id/records`. Team aggregates never need consent
 * gating (D-03: "unlinked guest contributes only team aggregates" -- i.e.
 * team-level facts are always public regardless of any player's link/consent
 * state); the only privacy-shaped rule here is the same "only the game's
 * *current* official revision counts" rule the void-projection comment
 * documents, so a corrected or voided result is never double-counted or
 * shown stale.
 */
@Injectable()
export class PublicTeamRecordsService {
  constructor(private readonly prisma: PrismaService) {}

  async getRecords(teamId: string, query: PublicRecordsQueryDto) {
    const team = await this.prisma.v1Team.findUnique({
      where: { id: teamId },
      select: { id: true, name: true, profile: { select: { logoUrl: true } } },
    });
    if (team === null) {
      throw new NotFoundException({ code: 'TEAM_NOT_FOUND', message: 'Team was not found' });
    }

    const limit = query.limit ?? 20;
    const cursor = decodeRecordCursor(query.cursor);
    const seasonRange = seasonBounds(query.season);

    const [rawFacts, summary] = await Promise.all([
      this.fetchRawFacts(teamId, limit, cursor, seasonRange),
      this.fetchSummary(teamId, seasonRange),
    ]);

    const hasMore = rawFacts.length > limit;
    const pageRows = rawFacts.slice(0, limit);
    const currentRows = pageRows.filter(
      (row) => row.resultRevision.game.currentOfficialRevisionId === row.revisionId,
    );

    const opponentTeamIds = Array.from(
      new Set(currentRows.map((row) => row.opponentTeamId).filter((id): id is string => id !== null)),
    );
    const tournamentIds = Array.from(
      new Set(currentRows.map((row) => row.tournamentId).filter((id): id is string => id !== null)),
    );
    const [opponentTeams, tournaments] = await Promise.all([
      opponentTeamIds.length === 0
        ? []
        : this.prisma.v1Team.findMany({
            where: { id: { in: opponentTeamIds } },
            select: { id: true, name: true, profile: { select: { logoUrl: true } } },
          }),
      tournamentIds.length === 0
        ? []
        : this.prisma.v1Tournament.findMany({ where: { id: { in: tournamentIds } }, select: { id: true, title: true } }),
    ]);
    const opponentNameById = new Map(opponentTeams.map((row) => [row.id, row.name]));
    const opponentLogoById = new Map(opponentTeams.map((row) => [row.id, row.profile?.logoUrl ?? null]));
    const tournamentTitleById = new Map(tournaments.map((row) => [row.id, row.title]));

    const items = currentRows.map((row) => {
      const score = parseScore(row.resultRevision.score);
      const ownSide = row.resultRevision.game.sides.find((side) => side.teamId === teamId) ?? null;
      const penalties = score?.penalties && ownSide
        ? ownSide.sideKey === 'HOME'
          ? { for: score.penalties.home, against: score.penalties.away }
          : { for: score.penalties.away, against: score.penalties.home }
        : null;
      return {
      gameId: row.gameId,
      // exactly-one-source: a game is either tournament-sourced (tournamentId set) or
      // team-match-sourced (teamMatchId set), never both -- see V1Game's CHECK constraint.
      teamMatchId: row.resultRevision.game.teamMatchId,
      fixtureId: row.resultRevision.game.tournamentFixture?.id ?? null,
      round: row.resultRevision.game.tournamentFixture?.round ?? null,
      tournamentId: row.tournamentId,
      tournamentTitle: row.tournamentId === null ? null : (tournamentTitleById.get(row.tournamentId) ?? null),
      opponentTeamId: row.opponentTeamId,
      opponentTeamName: row.opponentTeamId === null ? null : (opponentNameById.get(row.opponentTeamId) ?? null),
      opponentTeamLogoUrl: row.opponentTeamId === null ? null : (opponentLogoById.get(row.opponentTeamId) ?? null),
      result: row.result,
      goalsFor: row.goalsFor,
      goalsAgainst: row.goalsAgainst,
      penalties,
      officialAt: row.officialAt.toISOString(),
      isCorrected: row.resultRevision.supersedesId !== null,
    };
    });

    const lastPageRow = pageRows[pageRows.length - 1];
    const nextCursor =
      hasMore && lastPageRow !== undefined
        ? encodeRecordCursor({ key: lastPageRow.officialAt.toISOString(), id: lastPageRow.id })
        : null;

    return {
      teamId: team.id,
      teamName: team.name,
      teamLogoUrl: team.profile?.logoUrl ?? null,
      summary,
      items,
      nextCursor,
    };
  }

  private async fetchRawFacts(
    teamId: string,
    limit: number,
    cursor: RecordCursor | null,
    seasonRange: { readonly gte: Date; readonly lt: Date } | null,
  ): Promise<TeamRecordFactRow[]> {
    return this.prisma.v1TeamRecordFact.findMany({
      where: {
        teamId,
        ...(seasonRange ? { officialAt: seasonRange } : {}),
        ...(cursor
          ? {
              OR: [
                { officialAt: { lt: new Date(cursor.key) } },
                { officialAt: new Date(cursor.key), id: { lt: cursor.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ officialAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      select: {
        id: true,
        revisionId: true,
        gameId: true,
        opponentTeamId: true,
        tournamentId: true,
        result: true,
        goalsFor: true,
        goalsAgainst: true,
        officialAt: true,
        resultRevision: {
          select: {
            supersedesId: true,
            score: true,
            game: {
              select: {
                currentOfficialRevisionId: true,
                teamMatchId: true,
                tournamentFixture: { select: { id: true, round: true } },
                sides: { select: { teamId: true, sideKey: true } },
              },
            },
          },
        },
      },
    });
  }

  private async fetchSummary(
    teamId: string,
    seasonRange: { readonly gte: Date; readonly lt: Date } | null,
  ): Promise<{
    played: number;
    won: number;
    drawn: number;
    lost: number;
    goalsFor: number;
    goalsAgainst: number;
  }> {
    type SummaryRow = {
      played: number;
      won: number;
      drawn: number;
      lost: number;
      goalsFor: number;
      goalsAgainst: number;
    };
    const rows = seasonRange
      ? await this.prisma.$queryRaw<SummaryRow[]>`
          SELECT
            COUNT(*)::int AS played,
            COUNT(*) FILTER (WHERE trf.result = 'WON')::int AS won,
            COUNT(*) FILTER (WHERE trf.result = 'DRAWN')::int AS drawn,
            COUNT(*) FILTER (WHERE trf.result = 'LOST')::int AS lost,
            COALESCE(SUM(trf.goals_for), 0)::int AS "goalsFor",
            COALESCE(SUM(trf.goals_against), 0)::int AS "goalsAgainst"
          FROM v1_team_record_facts trf
          INNER JOIN v1_games g ON g.id = trf.game_id AND g.current_official_revision_id = trf.revision_id
          WHERE trf.team_id = ${teamId}
            AND trf.official_at >= ${seasonRange.gte}
            AND trf.official_at < ${seasonRange.lt}
        `
      : await this.prisma.$queryRaw<SummaryRow[]>`
          SELECT
            COUNT(*)::int AS played,
            COUNT(*) FILTER (WHERE trf.result = 'WON')::int AS won,
            COUNT(*) FILTER (WHERE trf.result = 'DRAWN')::int AS drawn,
            COUNT(*) FILTER (WHERE trf.result = 'LOST')::int AS lost,
            COALESCE(SUM(trf.goals_for), 0)::int AS "goalsFor",
            COALESCE(SUM(trf.goals_against), 0)::int AS "goalsAgainst"
          FROM v1_team_record_facts trf
          INNER JOIN v1_games g ON g.id = trf.game_id AND g.current_official_revision_id = trf.revision_id
          WHERE trf.team_id = ${teamId}
        `;
    const row = rows[0];
    return {
      played: row?.played ?? 0,
      won: row?.won ?? 0,
      drawn: row?.drawn ?? 0,
      lost: row?.lost ?? 0,
      goalsFor: row?.goalsFor ?? 0,
      goalsAgainst: row?.goalsAgainst ?? 0,
    };
  }
}

function parseScore(value: Prisma.JsonValue): {
  readonly home: number;
  readonly away: number;
  readonly penalties: { readonly home: number; readonly away: number } | null;
} | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, Prisma.JsonValue | undefined>;
  const regulation = record.regulation;
  const nestedRegulation =
    typeof regulation === 'object' && regulation !== null && !Array.isArray(regulation)
      ? regulation as Record<string, Prisma.JsonValue | undefined>
      : undefined;
  const home = record.home ?? nestedRegulation?.home;
  const away = record.away ?? nestedRegulation?.away;
  if (typeof home !== 'number' || typeof away !== 'number') return null;
  const rawPenalty = record.penalties ?? record.penalty;
  const penalties =
    typeof rawPenalty === 'object' && rawPenalty !== null && !Array.isArray(rawPenalty) &&
    typeof (rawPenalty as { home?: unknown }).home === 'number' &&
    typeof (rawPenalty as { away?: unknown }).away === 'number'
      ? { home: (rawPenalty as { home: number }).home, away: (rawPenalty as { away: number }).away }
      : null;
  return { home, away, penalties };
}

function seasonBounds(season: string | undefined): { readonly gte: Date; readonly lt: Date } | null {
  if (season === undefined) return null;
  const year = Number.parseInt(season, 10);
  return {
    gte: new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0)),
    lt: new Date(Date.UTC(year + 1, 0, 1, 0, 0, 0, 0)),
  };
}
