import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AccountRecoveryService } from './account-recovery.service';
import { FindAccountDto, ResetPasswordDto } from './dto/account-recovery.dto';

/**
 * 비로그인 계정 찾기 — 휴대폰 본인인증(OTP)으로 번호 주인임을 증명한 뒤에만 응답한다.
 * OTP 발급/대조는 기존 공개 엔드포인트(/auth/phone/issue, /auth/phone/verify)를 그대로 쓰고,
 * verify 에 purpose='password_reset' 을 넘겨 받은 증명 토큰만 여기서 통과시킨다.
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
}
