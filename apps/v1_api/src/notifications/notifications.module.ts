import { Module } from '@nestjs/common';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { RealtimeModule } from '../realtime/realtime.module';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { WebPushController } from './web-push.controller';
import { WebPushService } from './web-push.service';

@Module({
  imports: [RealtimeModule],
  controllers: [NotificationsController, WebPushController],
  providers: [NotificationsService, WebPushService, V1AuthGuard],
  exports: [NotificationsService, WebPushService],
})
export class NotificationsModule {}
