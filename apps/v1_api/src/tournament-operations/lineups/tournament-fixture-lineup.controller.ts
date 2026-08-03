import {
  Body,
  Controller,
  Get,
  Headers,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../auth/current-user.decorator';
import { V1AuthGuard } from '../../auth/v1-auth.guard';
import type { V1AuthUser } from '../../auth/v1-auth-user';
import { SaveGameLineupDto, SubmitGameLineupDto } from '../../games/dto/game-lineup.dto';
import { TournamentFixtureLineupService } from './tournament-fixture-lineup.service';

// Review finding #14 (S2): board/fields/staff all reject malformed uuid path params with a
// contracted 422 via this shared pipe -- this controller was the one sibling missing it, so a
// malformed tournamentId/fixtureId/sideId/lineupId previously fell through to the service layer
// instead of failing fast at the HTTP boundary.
const UUID_PARAM = new ParseUUIDPipe({ errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY });

/**
 * Fixture-scoped adapter over the canonical /games/:gameId/lineups routes.
 * Role-scoped authorization happens inside GamesService (resolveActor), which
 * already applies Task 7's decideTournamentStaffAccess decision for
 * TOURNAMENT_FIXTURE-sourced games -- this controller only needs V1AuthGuard
 * to establish the authenticated actor before delegating.
 */
@Controller('tournament-ops/tournaments/:tournamentId/fixtures/:fixtureId/lineup')
@UseGuards(V1AuthGuard)
export class TournamentFixtureLineupController {
  constructor(private readonly lineupService: TournamentFixtureLineupService) {}

  @Get()
  listLineups(
    @CurrentUser() user: V1AuthUser,
    @Param('tournamentId', UUID_PARAM) tournamentId: string,
    @Param('fixtureId', UUID_PARAM) fixtureId: string,
  ) {
    return this.lineupService.listLineups(user, tournamentId, fixtureId);
  }

  @Put(':sideId')
  saveLineup(
    @CurrentUser() user: V1AuthUser,
    @Param('tournamentId', UUID_PARAM) tournamentId: string,
    @Param('fixtureId', UUID_PARAM) fixtureId: string,
    @Param('sideId', UUID_PARAM) sideId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: SaveGameLineupDto,
  ) {
    return this.lineupService.saveLineup(user, tournamentId, fixtureId, sideId, idempotencyKey, dto);
  }

  @Post(':lineupId/submit')
  submitLineup(
    @CurrentUser() user: V1AuthUser,
    @Param('tournamentId', UUID_PARAM) tournamentId: string,
    @Param('fixtureId', UUID_PARAM) fixtureId: string,
    @Param('lineupId', UUID_PARAM) lineupId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: SubmitGameLineupDto,
  ) {
    return this.lineupService.submitLineup(
      user,
      tournamentId,
      fixtureId,
      lineupId,
      idempotencyKey,
      dto,
    );
  }
}
