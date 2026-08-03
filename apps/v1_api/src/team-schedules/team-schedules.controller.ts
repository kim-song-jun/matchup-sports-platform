import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { OptionalV1AuthGuard } from '../auth/optional-v1-auth.guard';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import type { V1AuthUser } from '../auth/v1-auth-user';
import { CancelScheduleDto } from './dto/cancel-schedule.dto';
import { CompleteScheduleDto } from './dto/complete-schedule.dto';
import { CreateScheduleDto, ScheduleListQueryDto, UpdateScheduleDto } from './dto/team-schedule.dto';
import { TeamSchedulesService } from './team-schedules.service';

/**
 * Owns exactly the "schedule CRUD / versioned mutate / cancel / complete" lane routes of the
 * frozen contract (docs/api/global-contract.md). The `complete` route was added to make the
 * contract's `scheduled -> cancelled|completed` transition table honest (see
 * TeamSchedulesService.complete()'s docblock — W10 fix). Sibling lanes are standalone
 * controllers that also delegate to the shared TeamSchedulesService, each registered separately in
 * team-schedules.module.ts to avoid two controllers claiming the same method+path:
 *   - self-only RSVP (PUT .../attendance/me): ScheduleAttendanceController
 *   - guest recruitment + applications: GuestRecruitmentController
 *   - reminder trigger (POST .../reminders): ScheduleRemindersController
 *   - my-schedule (GET me/schedule): MyScheduleController
 */
@Controller()
export class TeamSchedulesController {
  constructor(private readonly schedules: TeamSchedulesService) {}

  @Get('teams/:teamId/schedules')
  @UseGuards(OptionalV1AuthGuard)
  list(
    @CurrentUser() user: V1AuthUser | undefined,
    @Param('teamId') teamId: string,
    @Query() query: ScheduleListQueryDto,
  ) {
    return this.schedules.list(user ?? null, teamId, query);
  }

  @Post('teams/:teamId/schedules')
  @UseGuards(V1AuthGuard)
  create(
    @CurrentUser() user: V1AuthUser,
    @Param('teamId') teamId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: CreateScheduleDto,
  ) {
    return this.schedules.create(user, teamId, dto, this.requireIdempotencyKey(idempotencyKey));
  }

  @Get('teams/:teamId/schedules/:scheduleId')
  @UseGuards(OptionalV1AuthGuard)
  detail(
    @CurrentUser() user: V1AuthUser | undefined,
    @Param('teamId') teamId: string,
    @Param('scheduleId') scheduleId: string,
  ) {
    return this.schedules.detail(user ?? null, teamId, scheduleId);
  }

  @Patch('teams/:teamId/schedules/:scheduleId')
  @UseGuards(V1AuthGuard)
  update(
    @CurrentUser() user: V1AuthUser,
    @Param('teamId') teamId: string,
    @Param('scheduleId') scheduleId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: UpdateScheduleDto,
  ) {
    return this.schedules.update(user, teamId, scheduleId, dto, this.requireIdempotencyKey(idempotencyKey));
  }

  @Post('teams/:teamId/schedules/:scheduleId/cancel')
  @HttpCode(200)
  @UseGuards(V1AuthGuard)
  cancel(
    @CurrentUser() user: V1AuthUser,
    @Param('teamId') teamId: string,
    @Param('scheduleId') scheduleId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: CancelScheduleDto,
  ) {
    return this.schedules.cancel(user, teamId, scheduleId, dto, this.requireIdempotencyKey(idempotencyKey));
  }

  // W10 fix: the frozen contract's transition table (docs/api/global-contract.md:59) requires
  // `scheduled -> cancelled|completed`; this route is the only mechanism that reaches COMPLETED
  // (see TeamSchedulesService.complete()'s docblock for why this shape was chosen).
  @Post('teams/:teamId/schedules/:scheduleId/complete')
  @HttpCode(200)
  @UseGuards(V1AuthGuard)
  complete(
    @CurrentUser() user: V1AuthUser,
    @Param('teamId') teamId: string,
    @Param('scheduleId') scheduleId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: CompleteScheduleDto,
  ) {
    return this.schedules.complete(user, teamId, scheduleId, dto, this.requireIdempotencyKey(idempotencyKey));
  }

  private requireIdempotencyKey(idempotencyKey: string | undefined): string {
    const normalized = idempotencyKey?.trim();
    if (normalized === undefined || normalized.length === 0) {
      throw new UnprocessableEntityException({
        code: 'IDEMPOTENCY_KEY_REQUIRED',
        message: 'Idempotency-Key header is required for this mutation',
      });
    }
    return normalized;
  }
}
