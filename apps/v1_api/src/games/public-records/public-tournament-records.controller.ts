import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { OptionalV1AuthGuard } from '../../auth/optional-v1-auth.guard';
import { PublicTournamentScheduleQueryDto } from './dto/public-records-query.dto';
import { PublicTournamentRecordsService } from './public-tournament-records.service';

/**
 * Task 24 -- `GET /tournaments/:id/schedule` and
 * `GET /tournaments/:id/matches/:fixtureId` (public, no auth required).
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
  ) {
    return this.tournamentRecords.getSchedule(tournamentId, query);
  }

  @Get(':tournamentId/matches/:fixtureId')
  getMatch(@Param('tournamentId') tournamentId: string, @Param('fixtureId') fixtureId: string) {
    return this.tournamentRecords.getMatch(tournamentId, fixtureId);
  }
}
