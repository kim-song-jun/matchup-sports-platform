import { Module } from '@nestjs/common';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { OctomoClient } from './octomo.client';
import { PhoneVerificationService } from './phone-verification.service';
import { VerificationController } from './verification.controller';
import { VerificationDispatcherService } from './verification-dispatcher.service';
import { VerificationService } from './verification.service';

@Module({
  controllers: [VerificationController],
  providers: [VerificationService, VerificationDispatcherService, OctomoClient, PhoneVerificationService, V1AuthGuard],
  exports: [PhoneVerificationService, OctomoClient],
})
export class VerificationModule {}
