import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { OptionalV1AuthGuard } from '../auth/optional-v1-auth.guard';
import { TeamMatchSeriesPublicService } from './team-match-series-public.service';

@Controller('team-match-series')
@UseGuards(OptionalV1AuthGuard)
export class TeamMatchSeriesPublicController {
  constructor(private readonly service: TeamMatchSeriesPublicService) {}

  @Get(':seriesId')
  detail(@Param('seriesId', new ParseUUIDPipe()) seriesId: string) {
    return this.service.detail(seriesId);
  }

  @Get(':seriesId/standings')
  standings(@Param('seriesId', new ParseUUIDPipe()) seriesId: string) {
    return this.service.standings(seriesId);
  }

  @Get(':seriesId/player-records')
  playerRecords(@Param('seriesId', new ParseUUIDPipe()) seriesId: string) {
    return this.service.playerRecords(seriesId);
  }
}
