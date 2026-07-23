import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { PhoneVerificationService } from '../verification/phone-verification.service';
import { PhoneIssueDto, PhoneVerifyDto } from './dto/phone-verification.dto';

@Controller('auth/phone')
export class PhoneVerificationPublicController {
  constructor(private readonly phoneVerification: PhoneVerificationService) {}

  @Post('issue')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async issue(@Body() dto: PhoneIssueDto) {
    const { code, destNumber, qrCode, expiresAt } = await this.phoneVerification.issueChallenge(dto.phone, dto.channel);
    return { code, destNumber, qrCode, expiresAt };
  }

  @Post('verify')
  @HttpCode(200)
  // 프론트 폴링 2초 간격 → 분당 최대 ~30회(+진입 즉시 1회). 여유를 두어 40/60s.
  @Throttle({ default: { limit: 40, ttl: 60_000 } })
  async verify(@Body() dto: PhoneVerifyDto) {
    const arrived = await this.phoneVerification.pollArrived(dto.phone);
    if (!arrived) return { verified: false };
    return { verified: true, proofToken: this.phoneVerification.issueProof(dto.phone) };
  }
}
