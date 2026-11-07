import { Module } from '@nestjs/common';
import { AppleTokenModule } from '../auth/apple-token.module';
import { OptionalV1AuthGuard } from '../auth/optional-v1-auth.guard';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { V1SessionLogoutInterceptor } from '../auth/v1-session.interceptor';
import { NotificationsServiceModule } from '../notifications/notifications-service.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { VerificationModule } from '../verification/verification.module';
import { EmailChangeController } from './email-change.controller';
import { EmailChangeService } from './email-change.service';
import { ProfileController } from './profile.controller';
import { ProfileService } from './profile.service';

@Module({
  imports: [AppleTokenModule, RealtimeModule, NotificationsServiceModule, VerificationModule],
  controllers: [ProfileController, EmailChangeController],
  providers: [
    ProfileService,
    EmailChangeService,
    V1AuthGuard,
    OptionalV1AuthGuard,
    V1SessionLogoutInterceptor,
  ],
})
export class ProfileModule {}
