import { Module } from '@nestjs/common';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { PhoneVerificationService } from './phone-verification.service';
import { SmsEventLogService } from './sms-event-log.service';
import { GabiaSmsSender } from './sms/gabia-sms-sender';
import { SMS_SENDER } from './sms/sms-sender';
import { SolapiSmsSender } from './sms/solapi-sms-sender';
import { VerificationController } from './verification.controller';
import { VerificationDispatcherService } from './verification-dispatcher.service';
import { VerificationService } from './verification.service';

@Module({
  controllers: [VerificationController],
  providers: [
    VerificationService,
    VerificationDispatcherService,
    SmsEventLogService,
    SolapiSmsSender,
    GabiaSmsSender,
    {
      provide: SMS_SENDER,
      useFactory: (solapi: SolapiSmsSender, gabia: GabiaSmsSender) =>
        (process.env.SMS_PROVIDER ?? 'solapi').trim().toLowerCase() === 'gabia' ? gabia : solapi,
      inject: [SolapiSmsSender, GabiaSmsSender],
    },
    PhoneVerificationService,
    V1AuthGuard,
  ],
  exports: [PhoneVerificationService],
})
export class VerificationModule {}
