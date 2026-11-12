import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../auth/current-user.decorator';
import { V1AuthGuard } from '../../auth/v1-auth.guard';
import { V1AuthUser } from '../../auth/v1-auth-user';
import { CreateScheduleTimeDto } from './schedule-times.dto';
import { ScheduleTimesService } from './schedule-times.service';

@Controller('admin/tournaments/:tournamentId/schedule-times')
@UseGuards(V1AuthGuard)
export class ScheduleTimesController {
  constructor(private readonly times: ScheduleTimesService) {}

  @Get()
  list(@CurrentUser() user: V1AuthUser, @Param('tournamentId', ParseUUIDPipe) id: string) {
    return this.times.list(user, id);
  }

  @Post()
  create(@CurrentUser() user: V1AuthUser, @Param('tournamentId', ParseUUIDPipe) id: string, @Body() dto: CreateScheduleTimeDto) {
    return this.times.create(user, id, dto);
  }
}

@Controller('admin/league-matches/:leagueId/schedule-times')
@UseGuards(V1AuthGuard)
export class LeagueScheduleTimesController {
  constructor(private readonly times: ScheduleTimesService) {}
  @Get()
  list(@CurrentUser() user: V1AuthUser, @Param('leagueId', ParseUUIDPipe) id: string) {
    return this.times.list(user, id, 'league-matches');
  }
  @Post()
  create(@CurrentUser() user: V1AuthUser, @Param('leagueId', ParseUUIDPipe) id: string, @Body() dto: CreateScheduleTimeDto) {
    return this.times.create(user, id, dto, 'league-matches');
  }
}
