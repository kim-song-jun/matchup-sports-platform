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

  /**
   * 팀장·매니저가 팀원의 참석을 대신 표시한다.
   *
   * 출석은 원래 본인만 설정할 수 있는데(`.../attendance/me`), 리그 대진은 운영자가 일방
   * 배정하는 의무 경기라 선수 한 명이 앱을 안 열면 팀장이 라인업을 못 짠다
   * (team-match-lineup.service.ts 의 출석 게이트). 정원 규칙은 본인 응답과 **동일하다**.
   *
   * 권한 확인은 서비스가 트랜잭션 안에서 잠근 채 한다 — 여기서 가드로 막지 않는 이유는
   * 그 사이 커밋된 권한 회수를 놓치지 않기 위해서다(guest-recruitment 의 P1-7/P1-8).
   */
  @Put('teams/:teamId/schedules/:scheduleId/attendance/:userId')
  @HttpCode(200)
  setAttendanceOnBehalf(
    @CurrentUser() user: V1AuthUser,
    @Param('teamId') teamId: string,
    @Param('scheduleId') scheduleId: string,
    @Param('userId') targetUserId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: SetAttendanceDto,
  ) {
    return this.attendance.setAttendanceOnBehalf(
      user,
      targetUserId,
      teamId,
      scheduleId,
      dto,
      this.requireIdempotencyKey(idempotencyKey),
    );
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
