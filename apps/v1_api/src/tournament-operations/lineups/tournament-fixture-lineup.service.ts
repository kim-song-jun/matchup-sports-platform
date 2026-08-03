import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { V1AuthUser } from '../../auth/v1-auth-user';
import { GamesService } from '../../games/games.service';
import type { SaveGameLineupDto, SubmitGameLineupDto } from '../../games/dto/game-lineup.dto';

/**
 * Thin fixtureId -> gameId adapter over GamesService's already-shipped lineup
 * capture/submit methods (listLineups/saveLineup/submitLineup).
 *
 * GamesService.resolveActor() already performs full role-scoped authorization
 * for TOURNAMENT_FIXTURE-sourced games using the same decideTournamentStaffAccess
 * pure decision function that backs Task 7's TournamentStaffAccessService (see
 * apps/v1_api/src/games/games.service.ts resolveActor()). This adapter therefore
 * does not re-derive authorization -- it only resolves fixtureId -> gameId scoped
 * to the given tournamentId (rejecting cross-tournament fixture ids with 404) and
 * delegates the actual read/mutation + role check to GamesService.
 */
@Injectable()
export class TournamentFixtureLineupService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gamesService: GamesService,
  ) {}

  private async resolveGameId(tournamentId: string, fixtureId: string): Promise<string> {
    const fixture = await this.prisma.v1TournamentFixture.findUnique({
      where: { tournamentId_id: { tournamentId, id: fixtureId } },
      select: { game: { select: { id: true } } },
    });
    if (fixture === null || fixture.game === null) {
      throw new NotFoundException({
        code: 'TOURNAMENT_FIXTURE_GAME_NOT_FOUND',
        message: '경기 정보를 찾을 수 없어요.',
      });
    }
    return fixture.game.id;
  }

  async listLineups(user: V1AuthUser, tournamentId: string, fixtureId: string) {
    const gameId = await this.resolveGameId(tournamentId, fixtureId);
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
    const gameId = await this.resolveGameId(tournamentId, fixtureId);
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
    const gameId = await this.resolveGameId(tournamentId, fixtureId);
    return this.gamesService.submitLineup(user, gameId, lineupId, idempotencyKey, dto);
  }
}
