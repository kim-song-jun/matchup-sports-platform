import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { V1AuthUser } from '../../auth/v1-auth-user';
import { GamesService } from '../../games/games.service';
import type { SaveGameLineupDto, SubmitGameLineupDto } from '../../games/dto/game-lineup.dto';
import {
  TournamentStaffAccessService,
  type TournamentStaffResource,
} from '../../tournaments/staff/tournament-staff-access.service';
import type { TournamentStaffAction } from '../../tournaments/staff/tournament-staff-policy';

type CanonicalGameLookup = {
  readonly tournamentId: string;
  readonly teamMatchId: string;
  readonly fieldId: string | null;
  readonly game: { readonly id: string; readonly sourceType: string } | null;
};

/**
 * Thin canonical teamMatchId -> gameId adapter over GamesService's already-shipped lineup
 * capture/submit methods (listLineups/saveLineup/submitLineup).
 *
 * GamesService.resolveActor() still performs the authoritative, full
 * role-scoped authorization for TEAM_MATCH-sourced games (the same
 * decideTournamentStaffAccess pure decision function that backs Task 7's
 * TournamentStaffAccessService -- see apps/v1_api/src/games/games.service.ts
 * resolveActor()), so this adapter does not re-implement that decision logic.
 *
 * Authorization runs before existence-sensitive errors. A canonical Details
 * row from another tournament never contributes its field to the requested
 * resource, so denied callers cannot use this route as an existence oracle.
 */
@Injectable()
export class TournamentFixtureLineupService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gamesService: GamesService,
    private readonly access: TournamentStaffAccessService,
  ) {}

  private async authorizeAndResolveGameId(
    userId: string,
    tournamentId: string,
    fixtureId: string,
    action: TournamentStaffAction,
  ): Promise<string> {
    const canonicalRow = await this.prisma.v1TeamMatch.findUnique({
      where: { id: fixtureId },
      select: {
        tournamentId: true,
        leagueId: true,
        deletedAt: true,
        fieldId: true,
        tournament: { select: { kind: true } },
        tournamentDetails: { select: { teamMatchId: true, tournamentId: true } },
        game: { select: { id: true, sourceType: true } },
      },
    });
    const isCanonicalTournament = canonicalRow !== null
      && canonicalRow.deletedAt === null
      && canonicalRow.tournamentId === tournamentId
      && canonicalRow.leagueId === null
      && canonicalRow.tournamentDetails !== null
      && canonicalRow.tournamentDetails.tournamentId === tournamentId
      && canonicalRow.tournamentDetails.teamMatchId === fixtureId
      && (canonicalRow.tournament?.kind === 'regular_tournament' || canonicalRow.tournament?.kind === null);
    const isRegularLeague = canonicalRow !== null
      && canonicalRow.deletedAt === null
      && canonicalRow.tournamentId === tournamentId
      && canonicalRow.leagueId === tournamentId
      && canonicalRow.tournament?.kind === 'regular_league'
      && canonicalRow.tournamentDetails === null;
    const canonical: CanonicalGameLookup | null = canonicalRow === null || (!isCanonicalTournament && !isRegularLeague)
      ? null
      : {
          tournamentId,
          teamMatchId: fixtureId,
          fieldId: canonicalRow.fieldId,
          game: canonicalRow.game,
        };

    // Authorize before existence-sensitive errors. A row owned by another
    // tournament must not contribute its field to the requested scope.
    const resource: TournamentStaffResource =
      canonical?.tournamentId === tournamentId && canonical.fieldId !== null
        ? { tournamentId, fixtureId: canonical.teamMatchId, fieldId: canonical.fieldId }
        : { tournamentId, fixtureId };
    await this.access.assertAccess({ userId, action, resource });

    if (canonical === null || canonical.tournamentId !== tournamentId) {
      throw new NotFoundException({
        code: 'TOURNAMENT_FIXTURE_GAME_NOT_FOUND',
        message: '경기 정보를 찾을 수 없어요.',
      });
    }
    if (canonical.game === null) {
      throw new NotFoundException({
        code: 'TOURNAMENT_FIXTURE_GAME_NOT_FOUND',
        message: '경기 정보를 찾을 수 없어요.',
      });
    }
    if (canonical.game.sourceType !== 'TEAM_MATCH') {
      throw new ConflictException({
        code: 'TOURNAMENT_MATCH_SOURCE_INVALID',
        message: '대회 경기 출처가 올바르지 않아요.',
      });
    }
    return canonical.game.id;
  }

  /**
   * Task 21 addition: the response now carries `gameId` alongside `lineups`
   * (previously a bare `V1GameLineup[]`) -- the live operations console
   * resolves `fixtureId -> gameId` here BEFORE any lineup has ever been
   * saved (an empty `lineups` array on its own carried no id to call any
   * `/games/:gameId/*` route with).
   *
   * This is a shape change, not a field addition. Its consumers are known and
   * both were updated in the same change, so this is not an unreviewed break:
   *   - the live operations console added by this task reads `gameId` and
   *     `lineups` directly (apps/v1_web/.../operate/operate-console.tsx)
   *   - the pre-existing integration coverage from the Task 18 merge
   *     (test/tournaments/tournament-operations-board.integration-spec.ts) had
   *     its assertions moved to the new envelope
   * An earlier draft of this comment claimed there was no consumer at all;
   * that was wrong even as written, since the console above is part of this
   * same task. See `docs/api/domains/tournament-operations.md`'s Task 21 note.
   */
  async listLineups(user: V1AuthUser, tournamentId: string, fixtureId: string) {
    const gameId = await this.authorizeAndResolveGameId(user.id, tournamentId, fixtureId, 'read');
    const lineups = await this.gamesService.listLineups(user, gameId);
    return { gameId, lineups };
  }

  async saveLineup(
    user: V1AuthUser,
    tournamentId: string,
    fixtureId: string,
    sideId: string,
    idempotencyKey: string | undefined,
    dto: SaveGameLineupDto,
  ) {
    const gameId = await this.authorizeAndResolveGameId(
      user.id,
      tournamentId,
      fixtureId,
      'lineup_mutate',
    );
    return this.gamesService.saveLineup(user, gameId, sideId, idempotencyKey, dto);
  }

  async submitLineup(
    user: V1AuthUser,
    tournamentId: string,
    fixtureId: string,
    lineupId: string,
    idempotencyKey: string | undefined,
    dto: SubmitGameLineupDto,
  ) {
    const gameId = await this.authorizeAndResolveGameId(
      user.id,
      tournamentId,
      fixtureId,
      'lineup_mutate',
    );
    return this.gamesService.submitLineup(user, gameId, lineupId, idempotencyKey, dto);
  }
}
