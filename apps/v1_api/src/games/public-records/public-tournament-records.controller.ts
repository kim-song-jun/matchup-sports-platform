import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../auth/current-user.decorator';
import { OptionalV1AuthGuard } from '../../auth/optional-v1-auth.guard';
import type { V1AuthUser } from '../../auth/v1-auth-user';
import { PublicTournamentScheduleQueryDto } from './dto/public-records-query.dto';
import { PublicTournamentRecordsService } from './public-tournament-records.service';

/**
 * Task 24 -- `GET /tournaments/:id/schedule` and
 * `GET /tournaments/:id/matches/:fixtureId` (public, no auth required),
 * plus retro STATS-1's `GET /tournaments/:id/player-records`.
 * Registered as a sibling `@Controller('tournaments')` alongside
 * `TournamentsModule`'s own controllers (different route suffixes, so
 * there is no path collision) rather than folded into that module's file,
 * to keep this lane's public-records surface self-contained in its own
 * ownership directory.
 */
@Controller('tournaments')
@UseGuards(OptionalV1AuthGuard)
export class PublicTournamentRecordsController {
  constructor(private readonly tournamentRecords: PublicTournamentRecordsService) {}

  @Get(':tournamentId/schedule')
  getSchedule(
    @Param('tournamentId') tournamentId: string,
    @Query() query: PublicTournamentScheduleQueryDto,
    @CurrentUser() user: V1AuthUser | undefined,
  ) {
    return this.tournamentRecords.getSchedule(tournamentId, query, user);
  }

  /**
   * 회고 STATS-1 -- 대회 단위 개인 득점·도움 랭킹(공개, 동의 게이팅).
   * 리그의 `GET /league-matches/:leagueId/player-records`와 같은 계약.
   */
  @Get(':tournamentId/player-records')
  getPlayerRecords(@Param('tournamentId') tournamentId: string) {
    return this.tournamentRecords.getPlayerRecords(tournamentId);
  }

  @Get(':tournamentId/matches/:fixtureId')
  getMatch(
    @Param('tournamentId') tournamentId: string,
    @Param('fixtureId') fixtureId: string,
    @CurrentUser() user: V1AuthUser | undefined,
  ) {
    return this.tournamentRecords.getMatch(tournamentId, fixtureId, user);
  }
}
