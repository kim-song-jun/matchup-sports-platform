import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { V1AuthUser } from '../../auth/v1-auth-user';
import { GamesService } from '../../games/games.service';
import type { SaveGameLineupDto, SubmitGameLineupDto } from '../../games/dto/game-lineup.dto';
import {
  TournamentStaffAccessService,
  type TournamentStaffResource,
} from '../../tournaments/staff/tournament-staff-access.service';
import type { TournamentStaffAction } from '../../tournaments/staff/tournament-staff-policy';

type FixtureGameLookup = {
  readonly fieldId: string | null;
  readonly game: { readonly id: string } | null;
};

/**
 * Thin fixtureId -> gameId adapter over GamesService's already-shipped lineup
 * capture/submit methods (listLineups/saveLineup/submitLineup).
 *
 * GamesService.resolveActor() still performs the authoritative, full
 * role-scoped authorization for TOURNAMENT_FIXTURE-sourced games (the same
 * decideTournamentStaffAccess pure decision function that backs Task 7's
 * TournamentStaffAccessService -- see apps/v1_api/src/games/games.service.ts
 * resolveActor()), so this adapter does not re-implement that decision logic.
 *
 * Task 18 review P1-4: it previously ran that check TOO LATE. `resolveGameId()`
 * queried fixture/game existence FIRST and threw 404 immediately for a
 * nonexistent fixture/game -- before GamesService ever got a chance to
 * authorize the caller. An unauthenticated-for-this-tournament caller could
 * therefore fingerprint which fixture/game ids exist by comparing "404
 * immediately" (does not exist) against "403 from GamesService" (exists, but
 * I'm not allowed to see it) -- an existence oracle a denied caller should
 * never get. `authorizeAndResolveGameId()` fixes the order: it loads the
 * fixture row's `fieldId` (needed so a FIELD_OPERATOR scoped by *field*, not
 * by explicit fixtureId, is still correctly authorized for `read` -- see
 * tournament-staff-policy.ts's `fieldOrCourtId` scope check) and its linked
 * game id in ONE query, calls `TournamentStaffAccessService.assertAccess()`
 * with that resource FIRST, and only after that call succeeds does it decide
 * "not found" from the SAME already-fetched row. A caller who is not
 * authorized for this tournamentId/fixtureId/fieldId combination gets the
 * identical 403 STAFF_SCOPE_DENIED whether or not the fixture/game actually
 * exists; 404 TOURNAMENT_FIXTURE_GAME_NOT_FOUND is only ever reachable by a
 * caller who has already been authorized for that scope.
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
    const fixture: FixtureGameLookup | null = await this.prisma.v1TournamentFixture.findUnique({
      where: { tournamentId_id: { tournamentId, id: fixtureId } },
      select: { fieldId: true, game: { select: { id: true } } },
    });

    // Authorize FIRST, from whatever this lookup actually returned (a
    // nonexistent fixture yields `fieldId: undefined` here, same as an
    // existing-but-unassigned-field fixture would for scope purposes) --
    // never branch on existence before this call.
    const resource: TournamentStaffResource =
      fixture?.fieldId != null
        ? { tournamentId, fixtureId, fieldId: fixture.fieldId }
        : { tournamentId, fixtureId };
    await this.access.assertAccess({ userId, action, resource });

    if (fixture === null || fixture.game === null) {
      throw new NotFoundException({
        code: 'TOURNAMENT_FIXTURE_GAME_NOT_FOUND',
        message: '경기 정보를 찾을 수 없어요.',
      });
    }
    return fixture.game.id;
  }

  async listLineups(user: V1AuthUser, tournamentId: string, fixtureId: string) {
    const gameId = await this.authorizeAndResolveGameId(user.id, tournamentId, fixtureId, 'read');
    return this.gamesService.listLineups(user, gameId);
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
