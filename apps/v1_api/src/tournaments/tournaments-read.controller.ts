import { Controller, Get, Param, Query } from '@nestjs/common';
import { TournamentListQueryDto } from './dto/tournament-read.dto';
import { TournamentsReadService } from './tournaments-read.service';

@Controller('tournaments')
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
