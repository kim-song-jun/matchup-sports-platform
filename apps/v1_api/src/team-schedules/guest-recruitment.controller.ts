import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Patch,
  Post,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { OptionalV1AuthGuard } from '../auth/optional-v1-auth.guard';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import type { V1AuthUser } from '../auth/v1-auth-user';
import { CreateGuestApplicationDto, CreateGuestRecruitmentDto, UpdateGuestRecruitmentDto } from './dto/guest-recruitment.dto';
import { GuestRecruitmentService } from './guest-recruitment.service';

/**
 * Owns exactly the "guest-recruitment" lane routes of the frozen contract
 * (docs/api/global-contract.md): GET/POST/PATCH .../guest-recruitment and
 * POST .../guest-recruitment/applications. Registered as a standalone controller (not folded
 * into a shared team-schedules.controller.ts) so this lane never collides with the schedule
 * CRUD/attendance/reminders lanes editing the same module concurrently — see
 * team-schedules.module.ts for wiring (mirrors ScheduleAttendanceController's convention).
 */
@Controller('teams/:teamId/schedules/:scheduleId/guest-recruitment')
export class GuestRecruitmentController {
  constructor(private readonly guestRecruitment: GuestRecruitmentService) {}

  @Get()
  @UseGuards(OptionalV1AuthGuard)
  get(
    @CurrentUser() user: V1AuthUser | undefined,
    @Param('teamId') teamId: string,
    @Param('scheduleId') scheduleId: string,
  ) {
    return this.guestRecruitment.getRecruitment(user ?? null, teamId, scheduleId);
  }

  @Post()
  @HttpCode(201)
  @UseGuards(V1AuthGuard)
  create(
    @CurrentUser() user: V1AuthUser,
    @Param('teamId') teamId: string,
    @Param('scheduleId') scheduleId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: CreateGuestRecruitmentDto,
  ) {
    return this.guestRecruitment.createRecruitment(user, teamId, scheduleId, dto, this.requireIdempotencyKey(idempotencyKey));
  }

  @Patch()
  @HttpCode(200)
  @UseGuards(V1AuthGuard)
  update(
    @CurrentUser() user: V1AuthUser,
    @Param('teamId') teamId: string,
    @Param('scheduleId') scheduleId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: UpdateGuestRecruitmentDto,
  ) {
    return this.guestRecruitment.updateRecruitment(user, teamId, scheduleId, dto, this.requireIdempotencyKey(idempotencyKey));
  }

  // "any authenticated user, need not be a team member" — deliberately no membership guard here
  // beyond V1AuthGuard, and the applicant identity is entirely server-derived from @CurrentUser()
  // (see GuestRecruitmentService.createApplication + dto/guest-recruitment.dto.ts).
  @Post('applications')
  @HttpCode(200)
  @UseGuards(V1AuthGuard)
  apply(
    @CurrentUser() user: V1AuthUser,
    @Param('teamId') teamId: string,
    @Param('scheduleId') scheduleId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: CreateGuestApplicationDto,
  ) {
    return this.guestRecruitment.createApplication(user, teamId, scheduleId, dto, this.requireIdempotencyKey(idempotencyKey));
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
