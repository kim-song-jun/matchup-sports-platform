import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { OptionalV1AuthGuard } from '../auth/optional-v1-auth.guard';
import type { V1AuthUser } from '../auth/v1-auth-user';
import { TournamentListQueryDto } from './dto/tournament-read.dto';
import { TournamentsReadService } from './tournaments-read.service';

@Controller('tournaments')
@UseGuards(OptionalV1AuthGuard)
export class TournamentsReadController {
  constructor(private readonly tournamentsReadService: TournamentsReadService) {}

  @Get()
  list(@Query() query: TournamentListQueryDto) {
    return this.tournamentsReadService.list(query);
  }

  @Get(':tournamentId')
  get(@Param('tournamentId') tournamentId: string, @CurrentUser() user: V1AuthUser | undefined) {
    return this.tournamentsReadService.get(tournamentId, user);
  }

  @Get(':tournamentId/standings/overall')
  getOverallStandings(@Param('tournamentId') tournamentId: string) {
    return this.tournamentsReadService.getOverallStandings(tournamentId);
  }
}
