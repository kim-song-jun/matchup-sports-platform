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
import {
  CreateGuestApplicationDto,
  CreateGuestRecruitmentDto,
  ReviewGuestApplicationDto,
  UpdateGuestRecruitmentDto,
} from './dto/guest-recruitment.dto';
import { GuestRecruitmentService } from './guest-recruitment.service';

/**
 * Owns the "guest-recruitment" lane routes. The frozen contract table
 * (docs/api/global-contract.md) lists only GET/POST/PATCH .../guest-recruitment and
 * POST .../guest-recruitment/applications — this controller also adds
 * GET/PATCH .../guest-recruitment/applications[/:applicationId] (manager+ list + approve/reject),
 * which closes a real gap the frozen table left open: there was no route anywhere to move an
 * application off PENDING, so approvedCount was always 0 and the recruitment could never reach
 * FILLED. See guest-recruitment.service.ts's listApplications/reviewApplication docblocks.
 * Registered as a standalone controller (not folded into a shared team-schedules.controller.ts)
 * so this lane never collides with the schedule CRUD/attendance/reminders lanes editing the same
 * module concurrently — see team-schedules.module.ts for wiring (mirrors
 * ScheduleAttendanceController's convention).
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

  // manager+ only (checked inside the service, alongside its own row locks) — lists every
  // application regardless of state so a manager can see the full history, not just PENDING.
  @Get('applications')
  @UseGuards(V1AuthGuard)
  listApplications(
    @CurrentUser() user: V1AuthUser,
    @Param('teamId') teamId: string,
    @Param('scheduleId') scheduleId: string,
  ) {
    return this.guestRecruitment.listApplications(user, teamId, scheduleId);
  }

  // manager+ only — approve/reject a single PENDING application. See
  // guest-recruitment.service.ts's reviewApplication docblock for the lock order and the
  // FILLED-transition derivation this shares with updateRecruitment.
  @Patch('applications/:applicationId')
  @HttpCode(200)
  @UseGuards(V1AuthGuard)
  reviewApplication(
    @CurrentUser() user: V1AuthUser,
    @Param('teamId') teamId: string,
    @Param('scheduleId') scheduleId: string,
    @Param('applicationId') applicationId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: ReviewGuestApplicationDto,
  ) {
    return this.guestRecruitment.reviewApplication(
      user,
      teamId,
      scheduleId,
      applicationId,
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
