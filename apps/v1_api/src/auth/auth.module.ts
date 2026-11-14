import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { AccountLinkService } from './account-link.service';
import { AccountRecoveryController } from './account-recovery.controller';
import { AccountRecoveryService } from './account-recovery.service';
import { AuthController } from './auth.controller';
import { EmailLinkController } from './email-link.controller';
import { EmailLinkService } from './email-link.service';
import { AppleTokenModule } from './apple-token.module';
import { KakaoUnlinkModule } from './kakao-unlink.module';
import { KakaoWebhookController } from './kakao-webhook.controller';
import { KakaoWebhookService } from './kakao-webhook.service';
import { AuthService } from './auth.service';
import { LoginMethodController } from './login-method.controller';
import { LoginMethodService } from './login-method.service';
import { LoginSecurityService } from './login-security/login-security.service';
import { LoginStepUpService } from './login-security/login-step-up.service';
import { OptionalV1AuthGuard } from './optional-v1-auth.guard';
import { PhoneVerificationPublicController } from './phone-verification-public.controller';
import { V1AuthGuard } from './v1-auth.guard';
import { V1SessionCookieInterceptor } from './v1-session.interceptor';
import { WithdrawalRecoveryController } from './withdrawal-recovery.controller';
import { WithdrawalRecoveryService } from './withdrawal-recovery.service';
import { OmitErrorLogBodyMiddleware } from '../common/logging/omit-error-log-body';
import { NotificationsServiceModule } from '../notifications/notifications-service.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { TermsModule } from '../terms/terms.module';
import { VerificationModule } from '../verification/verification.module';

@Module({
  imports: [TermsModule, VerificationModule, AppleTokenModule, KakaoUnlinkModule, RealtimeModule, NotificationsServiceModule],
  controllers: [AuthController, EmailLinkController, LoginMethodController, PhoneVerificationPublicController, AccountRecoveryController, WithdrawalRecoveryController, KakaoWebhookController],
  providers: [
    AuthService,
    AccountLinkService,
    EmailLinkService,
    LoginMethodService,
    AccountRecoveryService,
    WithdrawalRecoveryService,
    LoginSecurityService,
    LoginStepUpService,
    KakaoWebhookService,
    V1AuthGuard,
    OptionalV1AuthGuard,
    V1SessionCookieInterceptor,
  ],
  exports: [V1AuthGuard, OptionalV1AuthGuard],
})
export class AuthModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // The form body carries the Kakao member number, and the error log keeps request bodies without an expiry.
    consumer
      .apply(OmitErrorLogBodyMiddleware)
      .forRoutes({ path: 'webhooks/kakao/unlink', method: RequestMethod.POST });
  }
}
