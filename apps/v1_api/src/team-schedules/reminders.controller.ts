import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Param,
  Post,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import type { V1AuthUser } from '../auth/v1-auth-user';
import { TriggerReminderDto } from './dto/reminder.dto';
import { TeamSchedulesService } from './team-schedules.service';

/**
 * Owns exactly the "reminders" lane route (POST .../reminders) of the frozen contract
 * (docs/api/global-contract.md). Registered as a standalone controller — mirrors
 * ScheduleAttendanceController's and GuestRecruitmentController's isolation pattern so this
 * lane never collides with the schedule CRUD lane's own controller on the same module. Delegates
 * to the shared TeamSchedulesService.triggerReminder(), which already implements the
 * outbox-insert + idempotency-replay logic (see team-schedules.service.ts).
 */
@Controller()
@UseGuards(V1AuthGuard)
export class ScheduleRemindersController {
  constructor(private readonly schedules: TeamSchedulesService) {}

  @Post('teams/:teamId/schedules/:scheduleId/reminders')
  @HttpCode(200)
  triggerReminder(
    @CurrentUser() user: V1AuthUser,
    @Param('teamId') teamId: string,
    @Param('scheduleId') scheduleId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: TriggerReminderDto,
  ) {
    return this.schedules.triggerReminder(user, teamId, scheduleId, dto, this.requireIdempotencyKey(idempotencyKey));
  }

  private requireIdempotencyKey(idempotencyKey: string | undefined): string {
    const normalized = idempotencyKey?.trim();
    if (normalized === undefined || normalized.length === 0) {
      throw new UnprocessableEntityException({
        code: 'IDEMPOTENCY_KEY_REQUIRED',
        message: 'Idempotency-Key header is required',
      });
    }
    return normalized;
  }
}
