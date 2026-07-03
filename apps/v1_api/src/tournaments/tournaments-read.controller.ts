import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { OptionalV1AuthGuard } from '../auth/optional-v1-auth.guard';
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
  get(@Param('tournamentId') tournamentId: string) {
    return this.tournamentsReadService.get(tournamentId);
  }
}
