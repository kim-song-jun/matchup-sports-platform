import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PublicRecordsQueryDto } from './dto/public-records-query.dto';
import { decodeRecordCursor, encodeRecordCursor, isAfterCursor, type RecordCursor } from './public-cursor';
import { isParticipantPubliclyEligible, loadParticipantConsentEligibility } from './public-consent';

interface EligibleResultRow {
  readonly participantResultId: string;
  readonly resultRevisionId: string;
  readonly participantId: string;
  readonly gameId: string;
  readonly sourceType: string;
  readonly tournamentFixtureId: string | null;
  readonly sideId: string;
  readonly goals: number;
  readonly cardsYellow: number;
  readonly cardsRed: number;
  readonly minutesPlayed: number | null;
  readonly started: boolean;
  readonly goalkeeper: boolean;
  readonly officialAt: Date;
  readonly isCorrected: boolean;
  readonly isMvp: boolean;
  readonly score: { home: number; away: number } | null;
}

/**
 * Task 24 -- `GET /users/:id/records`. The one route where D-03's consent
 * gate is load-bearing: a `V1GameResultParticipant` row only ever
 * contributes here when (a) it is reached through the game's *current*
 * official revision (a voided or superseded revision structurally has no
 * path in -- see `GameResultVoidProjectionService`'s comment) and (b) the
 * specific participant row passes `isParticipantPubliclyEligible` against
 * that revision's `officialAt`. An unlinked guest, a linked-but-unconsented
 * participant, or a since-revoked consent all fail (b) and are silently
 * absent -- never a placeholder/error row, per "no `PENDING_IDENTITY` row is
 * created" in the todo.
 */
@Injectable()
export class PublicUserRecordsService {
  constructor(private readonly prisma: PrismaService) {}

  async getRecords(userId: string, query: PublicRecordsQueryDto) {
    const user = await this.prisma.v1User.findUnique({
      where: { id: userId },
      select: { id: true, profile: { select: { nickname: true } } },
    });
    if (user === null) {
      throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'User was not found' });
    }

    const eligibleRows = await this.loadEligibleRows(userId, query.season);
    const cursor = decodeRecordCursor(query.cursor);
    const limit = query.limit ?? 20;

    const ordered = eligibleRows
      .slice()
      .sort((a, b) => rowCursorOf(b).key.localeCompare(rowCursorOf(a).key) || rowCursorOf(b).id.localeCompare(rowCursorOf(a).id));
    const afterCursor =
      cursor === null ? ordered : ordered.filter((row) => isAfterCursor(rowCursorOf(row), cursor, 'desc'));
    const page = afterCursor.slice(0, limit);
    const hasMore = afterCursor.length > limit;

    const detail = await this.hydrate(page);

    const summary = {
      appearances: eligibleRows.length,
      goals: eligibleRows.reduce((sum, row) => sum + row.goals, 0),
      yellowCards: eligibleRows.reduce((sum, row) => sum + row.cardsYellow, 0),
      redCards: eligibleRows.reduce((sum, row) => sum + row.cardsRed, 0),
      mvpCount: eligibleRows.filter((row) => row.isMvp).length,
    };

    const lastRow = page[page.length - 1];
    const nextCursor = hasMore && lastRow !== undefined ? encodeRecordCursor(rowCursorOf(lastRow)) : null;

    return {
      userId: user.id,
      nickname: user.profile?.nickname ?? null,
      summary,
      items: detail,
      nextCursor,
    };
  }

  private async loadEligibleRows(userId: string, season: string | undefined): Promise<EligibleResultRow[]> {
    const links = await this.prisma.v1ParticipantIdentityLinkCurrent.findMany({
      where: { userId },
      select: { participantId: true },
    });
    if (links.length === 0) return [];
    const participantIds = links.map((link) => link.participantId);

    const eligibility = await loadParticipantConsentEligibility(this.prisma, participantIds);

    const resultRows = await this.prisma.v1GameResultParticipant.findMany({
      where: { participantId: { in: participantIds } },
      select: {
        id: true,
        resultRevisionId: true,
        participantId: true,
        sideId: true,
        started: true,
        minutesPlayed: true,
        goals: true,
        cards: true,
        goalkeeper: true,
        resultRevision: {
          select: {
            id: true,
            gameId: true,
            officialAt: true,
            supersedesId: true,
            mvpParticipantId: true,
            score: true,
            game: {
              select: { sourceType: true, tournamentFixtureId: true, currentOfficialRevisionId: true },
            },
          },
        },
      },
    });

    const seasonRange = seasonBounds(season);
    const eligible: EligibleResultRow[] = [];
    for (const row of resultRows) {
      const revision = row.resultRevision;
      const isCurrent = revision.game.currentOfficialRevisionId === revision.id;
      if (!isCurrent || revision.officialAt === null) continue;

      const consent = eligibility.get(row.participantId);
      if (consent === undefined || !isParticipantPubliclyEligible(consent, revision.officialAt)) continue;

      if (seasonRange && (revision.officialAt < seasonRange.gte || revision.officialAt >= seasonRange.lt)) {
        continue;
      }

      const cards = parseCards(row.cards);
      eligible.push({
        participantResultId: row.id,
        resultRevisionId: revision.id,
        participantId: row.participantId,
        gameId: revision.gameId,
        sourceType: revision.game.sourceType,
        tournamentFixtureId: revision.game.tournamentFixtureId,
        sideId: row.sideId,
        goals: row.goals,
        cardsYellow: cards.yellow,
        cardsRed: cards.red,
        minutesPlayed: row.minutesPlayed,
        started: row.started,
        goalkeeper: row.goalkeeper,
        officialAt: revision.officialAt,
        isCorrected: revision.supersedesId !== null,
        isMvp: revision.mvpParticipantId === row.participantId,
        score: parseScore(revision.score),
      });
    }
    return eligible;
  }

  private async hydrate(rows: readonly EligibleResultRow[]) {
    if (rows.length === 0) return [];

    const gameIds = Array.from(new Set(rows.map((row) => row.gameId)));
    const fixtureIds = Array.from(
      new Set(rows.map((row) => row.tournamentFixtureId).filter((id): id is string => id !== null)),
    );

    const [sides, fixtures] = await Promise.all([
      this.prisma.v1GameSide.findMany({
        where: { gameId: { in: gameIds } },
        select: { id: true, gameId: true, sideKey: true, teamId: true, displayNameSnapshot: true },
      }),
      fixtureIds.length === 0
        ? []
        : this.prisma.v1TournamentFixture.findMany({
            where: { id: { in: fixtureIds } },
            select: { id: true, tournamentId: true, round: true },
          }),
    ]);

    const sidesByGame = new Map<string, typeof sides>();
    for (const side of sides) {
      const list = sidesByGame.get(side.gameId) ?? [];
      list.push(side);
      sidesByGame.set(side.gameId, list);
    }
    const fixtureById = new Map(fixtures.map((fixture) => [fixture.id, fixture]));

    const teamIds = Array.from(
      new Set(sides.map((side) => side.teamId).filter((id): id is string => id !== null)),
    );
    const tournamentIds = Array.from(
      new Set(fixtures.map((fixture) => fixture.tournamentId)),
    );
    const [teams, tournaments] = await Promise.all([
      teamIds.length === 0
        ? []
        : this.prisma.v1Team.findMany({ where: { id: { in: teamIds } }, select: { id: true, name: true } }),
      tournamentIds.length === 0
        ? []
        : this.prisma.v1Tournament.findMany({ where: { id: { in: tournamentIds } }, select: { id: true, title: true } }),
    ]);
    const teamNameById = new Map(teams.map((team) => [team.id, team.name]));
    const tournamentTitleById = new Map(tournaments.map((tournament) => [tournament.id, tournament.title]));

    return rows.map((row) => {
      const gameSides = sidesByGame.get(row.gameId) ?? [];
      const ownSide = gameSides.find((side) => side.id === row.sideId) ?? null;
      const opponentSide = gameSides.find((side) => side.id !== row.sideId) ?? null;
      const fixture = row.tournamentFixtureId === null ? null : (fixtureById.get(row.tournamentFixtureId) ?? null);

      let result: 'WON' | 'LOST' | 'DRAWN' | null = null;
      if (row.score !== null && ownSide !== null) {
        const own = ownSide.sideKey === 'HOME' ? row.score.home : row.score.away;
        const opponent = ownSide.sideKey === 'HOME' ? row.score.away : row.score.home;
        result = own > opponent ? 'WON' : own < opponent ? 'LOST' : 'DRAWN';
      }

      return {
        id: row.participantResultId,
        gameId: row.gameId,
        matchType: row.sourceType === 'TOURNAMENT_FIXTURE' ? ('tournament' as const) : ('team_match' as const),
        tournamentId: fixture?.tournamentId ?? null,
        tournamentTitle: fixture ? (tournamentTitleById.get(fixture.tournamentId) ?? null) : null,
        round: fixture?.round ?? null,
        teamId: ownSide?.teamId ?? null,
        teamName: ownSide ? (ownSide.teamId ? (teamNameById.get(ownSide.teamId) ?? null) : ownSide.displayNameSnapshot) : null,
        opponentTeamId: opponentSide?.teamId ?? null,
        opponentTeamName: opponentSide
          ? (opponentSide.teamId ? (teamNameById.get(opponentSide.teamId) ?? null) : opponentSide.displayNameSnapshot)
          : null,
        result,
        goals: row.goals,
        cards: { yellow: row.cardsYellow, red: row.cardsRed },
        minutesPlayed: row.minutesPlayed,
        started: row.started,
        goalkeeper: row.goalkeeper,
        mvp: row.isMvp,
        isCorrected: row.isCorrected,
        officialAt: row.officialAt.toISOString(),
      };
    });
  }
}

function rowCursorOf(row: EligibleResultRow): RecordCursor {
  return { key: row.officialAt.toISOString(), id: row.resultRevisionId };
}

function parseCards(value: Prisma.JsonValue): { yellow: number; red: number } {
  if (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as { yellow?: unknown }).yellow === 'number' &&
    typeof (value as { red?: unknown }).red === 'number'
  ) {
    return { yellow: (value as { yellow: number }).yellow, red: (value as { red: number }).red };
  }
  return { yellow: 0, red: 0 };
}

function parseScore(value: Prisma.JsonValue): { home: number; away: number } | null {
  if (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as { home?: unknown }).home === 'number' &&
    typeof (value as { away?: unknown }).away === 'number'
  ) {
    return { home: (value as { home: number }).home, away: (value as { away: number }).away };
  }
  return null;
}

function seasonBounds(season: string | undefined): { readonly gte: Date; readonly lt: Date } | null {
  if (season === undefined) return null;
  const year = Number.parseInt(season, 10);
  return {
    gte: new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0)),
    lt: new Date(Date.UTC(year + 1, 0, 1, 0, 0, 0, 0)),
  };
}
