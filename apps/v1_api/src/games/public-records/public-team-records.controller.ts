import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { OptionalV1AuthGuard } from '../../auth/optional-v1-auth.guard';
import { PublicRecordsQueryDto } from './dto/public-records-query.dto';
import { PublicTeamRecordsService } from './public-team-records.service';

/** Task 24 -- `GET /teams/:id/records` (public, no consent gate needed at team level). */
@Controller('teams')
@UseGuards(OptionalV1AuthGuard)
export class PublicTeamRecordsController {
  constructor(private readonly teamRecords: PublicTeamRecordsService) {}

  @Get(':teamId/records')
  getRecords(@Param('teamId') teamId: string, @Query() query: PublicRecordsQueryDto) {
    return this.teamRecords.getRecords(teamId, query);
  }
}
