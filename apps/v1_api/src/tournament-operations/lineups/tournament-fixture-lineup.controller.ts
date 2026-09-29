import {
  Controller,
  Get,
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

  /** 쓰기 경로는 409 로 조정 API 를 안내한다. 경로 파라미터 형식 검사(422)는 그대로다. */
  @Put(':sideId')
  saveLineup(
    @CurrentUser() user: V1AuthUser,
    @Param('tournamentId', UUID_PARAM) tournamentId: string,
    @Param('fixtureId', UUID_PARAM) fixtureId: string,
    @Param('sideId', UUID_PARAM) _sideId: string,
  ) {
    return this.lineupService.rejectLineupWrite(user, tournamentId, fixtureId);
  }

  @Post(':lineupId/submit')
  submitLineup(
    @CurrentUser() user: V1AuthUser,
    @Param('tournamentId', UUID_PARAM) tournamentId: string,
    @Param('fixtureId', UUID_PARAM) fixtureId: string,
    @Param('lineupId', UUID_PARAM) _lineupId: string,
  ) {
    return this.lineupService.rejectLineupWrite(user, tournamentId, fixtureId);
  }
}
