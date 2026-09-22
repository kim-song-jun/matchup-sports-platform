import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { OptionalV1AuthGuard } from '../auth/optional-v1-auth.guard';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import type { V1AuthUser } from '../auth/v1-auth-user';
import { MutateTeamMatchRecordDto } from './dto/team-match-record.dto';
import { TeamMatchRecordService } from './team-match-record.service';

@Controller('team-matches/:teamMatchId/record')
export class TeamMatchRecordController {
  constructor(private readonly records: TeamMatchRecordService) {}
  @Get() @UseGuards(OptionalV1AuthGuard)
  read(@CurrentUser() user: V1AuthUser | undefined, @Param('teamMatchId') id: string) {
    return this.records.read(user ?? null, id);
  }
  @Post() @UseGuards(V1AuthGuard)
  mutate(@CurrentUser() user: V1AuthUser, @Param('teamMatchId') id: string, @Body() dto: MutateTeamMatchRecordDto) {
    return this.records.mutate(user, id, dto);
  }
}
