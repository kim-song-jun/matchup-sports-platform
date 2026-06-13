import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { IsInt, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { CurrentUser } from '../auth/current-user.decorator';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { V1AuthUser } from '../auth/v1-auth-user';
import { TournamentPaymentsService } from './tournament-payments.service';

/**
 * PG 결제 확인 body DTO.
 * 토스페이먼츠 SDK가 콜백으로 전달하는 세 필드(paymentKey·orderId·amount)를 수신한다.
 * TODO: 실제 토스 연동 시 추가 필드(customerName 등) 보완.
 */
class ConfirmPgPaymentDto {
  @IsString()
  paymentKey!: string;

  @IsString()
  orderId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  amount!: number;
}

/**
 * 소비자/팀 결제 엔드포인트 (PG 전용).
 *
 * POST /tournaments/:tournamentId/registrations/:registrationId/payment/prepare
 *   — PG 결제 준비(STUB). checkoutUrl 반환.
 *
 * POST /tournaments/:tournamentId/registrations/:registrationId/payment/confirm
 *   — PG 결제 확인(STUB). payment ready→paid, registration awaiting_payment→paid.
 *
 * 계좌이체는 어드민 confirm-payment 경로(PATCH /admin/registrations/:id/confirm-payment) 사용.
 */
@Controller('tournaments/:tournamentId/registrations/:registrationId/payment')
@UseGuards(V1AuthGuard)
export class TournamentPaymentsController {
  constructor(private readonly tournamentPaymentsService: TournamentPaymentsService) {}

  /**
   * POST .../payment/prepare
   * PG 결제 준비.
   * 가드: registration.status = 'awaiting_payment' AND payment.method = 'pg'.
   * 반환: { paymentKey, orderId, amount, checkoutUrl }.
   * payment.status는 ready 유지(confirm 전까지).
   */
  @Post('prepare')
  preparePg(
    @CurrentUser() user: V1AuthUser,
    @Param('tournamentId') tournamentId: string,
    @Param('registrationId') registrationId: string,
  ) {
    return this.tournamentPaymentsService.preparePg(user, tournamentId, registrationId);
  }

  /**
   * POST .../payment/confirm
   * PG 결제 확인.
   * 가드: payment.method = 'pg' AND payment.status = 'ready'.
   * 동작: payment ready→paid(+paidAt, providerTxId), registration awaiting_payment→paid.
   */
  @Post('confirm')
  confirmPg(
    @CurrentUser() user: V1AuthUser,
    @Param('tournamentId') tournamentId: string,
    @Param('registrationId') registrationId: string,
    @Body() dto: ConfirmPgPaymentDto,
  ) {
    return this.tournamentPaymentsService.confirmPg(user, tournamentId, registrationId, dto);
  }
}
