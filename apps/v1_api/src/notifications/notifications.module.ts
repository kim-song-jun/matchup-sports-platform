import { Module } from '@nestjs/common';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { ResultEscalationController } from '../game-operations/result-escalation.controller';
import { ResultEscalationAccessService } from '../game-operations/result-escalation-access.service';
import { ResultEscalationMutationService } from '../game-operations/result-escalation-mutation.service';
import { ResultEscalationService } from '../game-operations/result-escalation.service';
import { ResultEscalationValidationInterceptor } from '../game-operations/result-escalation-validation.interceptor';
import { RealtimeModule } from '../realtime/realtime.module';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { WebPushController } from './web-push.controller';
import { WebPushService } from './web-push.service';

@Module({
  imports: [RealtimeModule],
  controllers: [NotificationsController, WebPushController, ResultEscalationController],
  providers: [
    NotificationsService,
    WebPushService,
    ResultEscalationAccessService,
    ResultEscalationMutationService,
    ResultEscalationService,
    ResultEscalationValidationInterceptor,
    V1AuthGuard,
  ],
  exports: [NotificationsService, WebPushService],
})
export class NotificationsModule {}
