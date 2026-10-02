import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../auth/current-user.decorator';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { V1AuthUser } from '../auth/v1-auth-user';
import { ConfirmVerificationDto, RequestPhoneVerificationDto } from './dto/verification.dto';
import { VerificationService } from './verification.service';

@Controller('verification')
@UseGuards(V1AuthGuard)
export class VerificationController {
  constructor(private readonly verificationService: VerificationService) {}

  // 형제 경로(auth/phone/issue, auth/recovery/*)와 같은 1차 방어. 다만 이건 IP 기준이고
  // V1ThrottlerGuard 가 프로덕션 외에서는 스킵하므로, 실제 상한은 서비스의
  // assertSendQuota(발송 기록 기준)가 담당한다.
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('email/request')
  @HttpCode(200)
  requestEmail(@CurrentUser() user: V1AuthUser) {
    return this.verificationService.requestEmail(user);
  }

  @Post('email/confirm')
  @HttpCode(200)
  confirmEmail(@CurrentUser() user: V1AuthUser, @Body() dto: ConfirmVerificationDto) {
    return this.verificationService.confirm(user, 'email', dto.code);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('phone/request')
  @HttpCode(200)
  requestPhone(@CurrentUser() user: V1AuthUser, @Body() dto: RequestPhoneVerificationDto) {
    return this.verificationService.requestPhone(user, dto.phone);
  }

  @Post('phone/confirm')
  @HttpCode(200)
  confirmPhone(@CurrentUser() user: V1AuthUser, @Body() dto: ConfirmVerificationDto) {
    return this.verificationService.confirm(user, 'phone', dto.code);
  }
}
