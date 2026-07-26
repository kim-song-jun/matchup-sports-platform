import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { V1AuthUser } from '../auth/v1-auth-user';
import {
  AdminCancelRegistrationDto,
  AdminConfirmPaymentDto,
  AdminConfirmRegistrationDto,
  AdminRegistrationListQueryDto,
  AdminRosterLockDto,
} from './dto/admin-registration.dto';
import { AdminRegistrationsService } from './admin-registrations.service';

/**
 * 어드민 전용 — 대회 신청 관리 엔드포인트.
 *
 * GET  /admin/tournaments/:tournamentId/registrations   신청 목록
 * PATCH /admin/registrations/:registrationId/confirm-payment  입금 확인 시작
 * PATCH /admin/registrations/:registrationId/confirm          참가 확정/대기
 * PATCH /admin/registrations/:registrationId/cancel           취소 처리
 * PATCH /admin/registrations/:registrationId/reject-cancel    취소 요청 거부(잔류)
 * POST  /admin/registrations/:registrationId/roster-lock      명단 잠금
 * DELETE /admin/registrations/:registrationId/roster-lock     명단 잠금 해제
 * POST  /admin/registrations/:registrationId/roster-deadline-override    명단 제출 마감 예외 부여
 * DELETE /admin/registrations/:registrationId/roster-deadline-override   명단 제출 마감 예외 취소
 */
@Controller()
@UseGuards(V1AuthGuard)
export class AdminRegistrationsController {
  constructor(private readonly adminRegistrationsService: AdminRegistrationsService) {}

  /**
   * GET /admin/tournaments/:tournamentId/registrations
   * 대회별 신청 목록. status 필터 + cursor 페이지네이션.
   * 각 행에 teamId, status, depositorName, payment{method,status,amount}, playerCount 포함.
   */
  @Get('admin/tournaments/:tournamentId/registrations')
  list(
    @CurrentUser() user: V1AuthUser,
    @Param('tournamentId') tournamentId: string,
    @Query() query: AdminRegistrationListQueryDto,
  ) {
    return this.adminRegistrationsService.list(user, tournamentId, query);
  }

  /**
   * PATCH /admin/registrations/:registrationId/confirm-payment
   * 입금 확인 시작.
   * 가드: registration.status = 'awaiting_payment' AND payment.status = 'ready'.
   * 동작: payment ready→paid(+paidAt, confirmedByAdminUserId), registration awaiting_payment→payment_checking.
   */
  @Patch('admin/registrations/:registrationId/confirm-payment')
  confirmPayment(
    @CurrentUser() user: V1AuthUser,
    @Param('registrationId') registrationId: string,
    @Body() dto: AdminConfirmPaymentDto,
  ) {
    return this.adminRegistrationsService.confirmPayment(user, registrationId, dto);
  }

  /**
   * PATCH /admin/registrations/:registrationId/confirm
   * 참가 확정 또는 대기 처리. body { decision: 'confirm' | 'waitlist' }.
   * 가드: registration.status in [payment_checking, paid].
   * 멱등: 이미 confirmed/waitlisted면 alreadyProcessed: true.
   */
  @Patch('admin/registrations/:registrationId/confirm')
  confirm(
    @CurrentUser() user: V1AuthUser,
    @Param('registrationId') registrationId: string,
    @Body() dto: AdminConfirmRegistrationDto,
  ) {
    return this.adminRegistrationsService.confirm(user, registrationId, dto);
  }

  /**
   * PATCH /admin/registrations/:registrationId/cancel
   * 취소 처리. body { reason? }.
   * 가드: status in [cancel_requested, awaiting_payment, payment_checking, paid, confirmed, waitlisted].
   * 동작: →cancelled, 결제 있으면 status→cancelled(refund는 운영 수동).
   */
  @Patch('admin/registrations/:registrationId/cancel')
  cancel(
    @CurrentUser() user: V1AuthUser,
    @Param('registrationId') registrationId: string,
    @Body() dto: AdminCancelRegistrationDto,
  ) {
    return this.adminRegistrationsService.cancel(user, registrationId, dto);
  }

  /**
   * PATCH /admin/registrations/:registrationId/reject-cancel
   * 취소 요청 거부(잔류). 팀이 취소 요청 상태(cancel_requested)로 남긴 신청을
   * cancelPreviousStatus(없으면 confirmed)로 되돌린다. cancelReason은 감사 추적을 위해 유지.
   * 가드: registration.status === 'cancel_requested'.
   */
  @Patch('admin/registrations/:registrationId/reject-cancel')
  rejectCancelRequest(
    @CurrentUser() user: V1AuthUser,
    @Param('registrationId') registrationId: string,
  ) {
    return this.adminRegistrationsService.rejectCancelRequest(user, registrationId);
  }

  /**
   * POST /admin/registrations/:registrationId/roster-lock
   * 명단 잠금(rosterLockedAt = now). confirmed 상태에서만 허용.
   */
  @Post('admin/registrations/:registrationId/roster-lock')
  rosterLock(
    @CurrentUser() user: V1AuthUser,
    @Param('registrationId') registrationId: string,
    @Body() dto: AdminRosterLockDto,
  ) {
    return this.adminRegistrationsService.rosterLock(user, registrationId, dto);
  }

  /**
   * DELETE /admin/registrations/:registrationId/roster-lock
   * 명단 잠금 해제(rosterLockedAt = null).
   */
  @Delete('admin/registrations/:registrationId/roster-lock')
  rosterUnlock(
    @CurrentUser() user: V1AuthUser,
    @Param('registrationId') registrationId: string,
  ) {
    return this.adminRegistrationsService.rosterUnlock(user, registrationId);
  }

  /**
   * POST /admin/registrations/:registrationId/roster-deadline-override
   * 명단 제출 마감 예외 부여(rosterDeadlineOverrideAt = now). 대회의 rosterDeadlineAt이 지나도
   * 해당 팀(신청건)만 명단을 계속 수정할 수 있게 한다. body 없음.
   */
  @Post('admin/registrations/:registrationId/roster-deadline-override')
  grantRosterDeadlineOverride(
    @CurrentUser() user: V1AuthUser,
    @Param('registrationId') registrationId: string,
  ) {
    return this.adminRegistrationsService.grantRosterDeadlineOverride(user, registrationId);
  }

  /**
   * DELETE /admin/registrations/:registrationId/roster-deadline-override
   * 명단 제출 마감 예외 취소(rosterDeadlineOverrideAt = null).
   */
  @Delete('admin/registrations/:registrationId/roster-deadline-override')
  revokeRosterDeadlineOverride(
    @CurrentUser() user: V1AuthUser,
    @Param('registrationId') registrationId: string,
  ) {
    return this.adminRegistrationsService.revokeRosterDeadlineOverride(user, registrationId);
  }
}
