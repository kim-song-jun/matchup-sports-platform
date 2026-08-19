import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { OptionalV1AuthGuard } from '../auth/optional-v1-auth.guard';
import { LeagueMatchPublicService } from './league-match-public.service';

@Controller('league-matches')
@UseGuards(OptionalV1AuthGuard)
export class LeagueMatchPublicController {
  constructor(private readonly service: LeagueMatchPublicService) {}

  @Get(':leagueId')
  detail(@Param('leagueId', new ParseUUIDPipe()) leagueId: string) {
    return this.service.detail(leagueId);
  }

  @Get(':leagueId/standings')
  standings(@Param('leagueId', new ParseUUIDPipe()) leagueId: string) {
    return this.service.standings(leagueId);
  }

  @Get(':leagueId/player-records')
  playerRecords(@Param('leagueId', new ParseUUIDPipe()) leagueId: string) {
    return this.service.playerRecords(leagueId);
  }
}
