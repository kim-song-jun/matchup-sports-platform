import { Body, Controller, HttpCode, Post, UseInterceptors } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { WithdrawalCancelDto } from './dto/withdrawal-cancel.dto';
import { V1SessionCookieInterceptor } from './v1-session.interceptor';
import { WithdrawalRecoveryService } from './withdrawal-recovery.service';

@Controller('auth/withdrawal')
@UseInterceptors(V1SessionCookieInterceptor)
export class WithdrawalRecoveryController {
  constructor(private readonly withdrawalRecovery: WithdrawalRecoveryService) {}

  /** Unauthenticated by design: the signed token from the refused sign-in is the credential. */
  @Post('cancel')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  cancel(@Body() dto: WithdrawalCancelDto) {
    return this.withdrawalRecovery.cancel(dto.token);
  }
}
