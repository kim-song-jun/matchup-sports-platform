import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AccountRecoveryService } from './account-recovery.service';
import {
  EmailRecoveryConfirmDto,
  EmailRecoveryRequestDto,
  FindAccountDto,
  ResetPasswordByEmailDto,
  ResetPasswordDto,
} from './dto/account-recovery.dto';

/**
 * 비로그인 계정 찾기 — 본인 확인(OTP)을 마친 뒤에만 응답한다.
 *
 * 휴대폰 경로: OTP 발급/대조는 기존 공개 엔드포인트(/auth/phone/issue, /auth/phone/verify)를
 * 그대로 쓰고, verify 에 purpose='password_reset' 을 넘겨 받은 증명 토큰만 여기서 통과시킨다.
 *
 * 이메일 경로: 로그인 후 이메일 인증(/verification/email/*)은 V1AuthGuard 뒤라 비로그인
 * 재설정에 쓸 수 없어, 여기 아래에 공개 OTP 를 따로 둔다. 이쪽 증명 토큰은 비밀번호 재설정
 * 용도로만 발급되며 휴대폰 증명과 서로 통하지 않는다(email-proof-token).
 *
 * 아이디(이메일) 찾기는 휴대폰 경로에만 있다 — 이메일로 이메일을 찾을 이유가 없다.
 */
@Controller('auth/recovery')
export class AccountRecoveryController {
  constructor(private readonly accountRecovery: AccountRecoveryService) {}

  @Post('find-account')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async findAccount(@Body() dto: FindAccountDto) {
    return this.accountRecovery.findAccountByPhone(dto);
  }

  // 비밀번호를 실제로 바꾸는 경로라 조회보다 좁게 잠근다.
  @Post('reset-password')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.accountRecovery.resetPasswordByPhone(dto);
  }

  // 메일을 실제로 내보내는 경로 — 발신 평판·비용이 걸려 있어 발급(휴대폰 issue)과 같은 폭으로 잠근다.
  // 주소별 30초 재발송 쿨다운은 EmailVerificationService 가 따로 건다.
  @Post('email/request')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async requestEmailCode(@Body() dto: EmailRecoveryRequestDto) {
    return this.accountRecovery.requestPasswordResetEmail(dto);
  }

  // 6자리 무차별 대입 방지: 챌린지당 attemptCount 5회 상한 + 분당 요청 상한.
  @Post('email/confirm')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async confirmEmailCode(@Body() dto: EmailRecoveryConfirmDto) {
    return this.accountRecovery.confirmPasswordResetEmail(dto);
  }

  // 휴대폰 경로와 같은 이유로 대조(confirm)보다 좁게 잠근다.
  @Post('email/reset-password')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async resetPasswordByEmail(@Body() dto: ResetPasswordByEmailDto) {
    return this.accountRecovery.resetPasswordByEmail(dto);
  }
}
