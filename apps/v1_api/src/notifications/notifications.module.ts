import { Module } from '@nestjs/common';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { ResultEscalationController } from '../game-operations/result-escalation.controller';
import { PlatformResultEscalationController } from '../game-operations/platform-result-escalation.controller';
import { ResultEscalationAccessService } from '../game-operations/result-escalation-access.service';
import { ResultEscalationMutationService } from '../game-operations/result-escalation-mutation.service';
import { ResultEscalationService } from '../game-operations/result-escalation.service';
import { ResultEscalationValidationInterceptor } from '../game-operations/result-escalation-validation.interceptor';
import { NotificationsController } from './notifications.controller';
import { NotificationsServiceModule } from './notifications-service.module';
import { WebPushController } from './web-push.controller';
import { PushDeviceController } from './push-device.controller';

// NotificationsService/WebPushService are declared here (imported + re-exported from
// NotificationsServiceModule) rather than directly in this module's own providers, so that this
// module's HTTP-only surface (ResultEscalation* controllers/providers, NotificationsController,
// WebPushController) stays separable from the notification-service pair itself. The standalone
// v1-game-operations-worker (Task 12's schedule reminders) does NOT import this module or
// NotificationsServiceModule — it has its own worker-only declaring module
// (jobs/schedule-reminders/worker-notifications.module.ts) that provides the same
// NotificationsService/WebPushService pair without this module's RealtimeModule/GamesModule
// dependency. See notifications-service.module.ts's docblock for why that split is required.
@Module({
  imports: [NotificationsServiceModule],
  controllers: [
    NotificationsController,
    WebPushController,
    PushDeviceController,
    ResultEscalationController,
    PlatformResultEscalationController,
  ],
  providers: [
    ResultEscalationAccessService,
    ResultEscalationMutationService,
    ResultEscalationService,
    ResultEscalationValidationInterceptor,
    V1AuthGuard,
  ],
  exports: [NotificationsServiceModule],
})
export class NotificationsModule {}
