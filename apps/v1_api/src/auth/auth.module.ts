import { Module } from '@nestjs/common';
import { AccountLinkService } from './account-link.service';
import { AccountRecoveryController } from './account-recovery.controller';
import { AccountRecoveryService } from './account-recovery.service';
import { AuthController } from './auth.controller';
import { EmailLinkController } from './email-link.controller';
import { EmailLinkService } from './email-link.service';
import { AppleTokenModule } from './apple-token.module';
import { AuthService } from './auth.service';
import { LoginSecurityService } from './login-security/login-security.service';
import { LoginStepUpService } from './login-security/login-step-up.service';
import { OptionalV1AuthGuard } from './optional-v1-auth.guard';
import { PhoneVerificationPublicController } from './phone-verification-public.controller';
import { V1AuthGuard } from './v1-auth.guard';
import { V1SessionCookieInterceptor } from './v1-session.interceptor';
import { WithdrawalRecoveryController } from './withdrawal-recovery.controller';
import { WithdrawalRecoveryService } from './withdrawal-recovery.service';
import { NotificationsServiceModule } from '../notifications/notifications-service.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { TermsModule } from '../terms/terms.module';
import { VerificationModule } from '../verification/verification.module';

@Module({
  imports: [TermsModule, VerificationModule, AppleTokenModule, RealtimeModule, NotificationsServiceModule],
  controllers: [AuthController, EmailLinkController, PhoneVerificationPublicController, AccountRecoveryController, WithdrawalRecoveryController],
  providers: [
    AuthService,
    AccountLinkService,
    EmailLinkService,
    AccountRecoveryService,
    WithdrawalRecoveryService,
    LoginSecurityService,
    LoginStepUpService,
    V1AuthGuard,
    OptionalV1AuthGuard,
    V1SessionCookieInterceptor,
  ],
  exports: [V1AuthGuard, OptionalV1AuthGuard],
})
export class AuthModule {}
