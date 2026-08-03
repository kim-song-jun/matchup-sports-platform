import { Body, Controller, Headers, HttpCode, Param, Put, UnprocessableEntityException, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import type { V1AuthUser } from '../auth/v1-auth-user';
import { ScheduleAttendanceService } from './attendance.service';
import { SetAttendanceDto } from './dto/attendance.dto';

/**
 * Owns exactly the "attendance" lane route (PUT .../attendance/me) of the frozen contract
 * (docs/api/global-contract.md). Registered as a standalone controller (not folded into a
 * shared team-schedules.controller.ts) so this lane never collides with the schedule
 * CRUD/reminders/guest-recruitment lanes editing the same module concurrently — see
 * team-schedules.module.ts for wiring.
 */
@Controller()
@UseGuards(V1AuthGuard)
export class ScheduleAttendanceController {
  constructor(private readonly attendance: ScheduleAttendanceService) {}

  @Put('teams/:teamId/schedules/:scheduleId/attendance/me')
  @HttpCode(200)
  setMyAttendance(
    @CurrentUser() user: V1AuthUser,
    @Param('teamId') teamId: string,
    @Param('scheduleId') scheduleId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: SetAttendanceDto,
  ) {
    return this.attendance.setMyAttendance(user, teamId, scheduleId, dto, this.requireIdempotencyKey(idempotencyKey));
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
