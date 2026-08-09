import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import type { V1AuthUser } from '../auth/v1-auth-user';
import { MyScheduleQueryDto } from './dto/my-schedule-query.dto';
import { TeamSchedulesService } from './team-schedules.service';

/**
 * Owns exactly the GET /api/v1/me/schedule route of the frozen contract
 * (docs/api/global-contract.md). Standalone controller under the 'me' prefix — mirrors the
 * existing MyMatchesController precedent (apps/v1_api/src/matches/my-matches.controller.ts):
 * multiple controllers may share the 'me' prefix as long as their sub-routes don't collide.
 * Delegates to the shared TeamSchedulesService.mySchedule(), which already aggregates schedules
 * across every team the caller has an active membership in.
 */
@Controller('me')
@UseGuards(V1AuthGuard)
export class MyScheduleController {
  constructor(private readonly schedules: TeamSchedulesService) {}

  @Get('schedule')
  mySchedule(@CurrentUser() user: V1AuthUser, @Query() query: MyScheduleQueryDto) {
    return this.schedules.mySchedule(user, query);
  }
}
