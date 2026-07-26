import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { PhoneVerificationService } from '../verification/phone-verification.service';
import { PhoneIssueDto, PhoneVerifyDto } from './dto/phone-verification.dto';

@Controller('auth/phone')
export class PhoneVerificationPublicController {
  constructor(private readonly phoneVerification: PhoneVerificationService) {}

  @Post('issue')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async issue(@Body() dto: PhoneIssueDto) {
    return this.phoneVerification.issueChallenge(dto.phone);
  }

  @Post('verify')
  @HttpCode(200)
  // 6자리 무차별 대입 방지: challenge 당 attemptCount 5회 상한 + 분당 요청 상한.
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async verify(@Body() dto: PhoneVerifyDto) {
    await this.phoneVerification.verifyCode(dto.phone, dto.code);
    return { verified: true, proofToken: this.phoneVerification.issueProof(dto.phone, dto.purpose) };
  }
}
