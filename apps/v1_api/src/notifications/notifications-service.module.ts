import { Module } from '@nestjs/common';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { RealtimeModule } from '../realtime/realtime.module';
import { NotificationsService } from './notifications.service';
import { REALTIME_NOTIFIER } from './realtime-notifier.port';
import { WebPushService } from './web-push.service';

/**
 * Sole HTTP-side declaring module for NotificationsService + WebPushService. Binds
 * REALTIME_NOTIFIER (see realtime-notifier.port.ts) to the real Socket.IO-backed RealtimeGateway,
 * so an HTTP-originated notification's realtime broadcast behaves exactly as it did before that
 * port existed.
 *
 * NotificationsModule imports and re-exports this module so its own controllers
 * (NotificationsController, WebPushController) and every other HTTP-side consumer that already
 * imports NotificationsModule keep working unchanged.
 *
 * The standalone v1-game-operations-worker (Task 12's schedule reminders) does NOT import this
 * module — it has its own declaring module,
 * jobs/schedule-reminders/worker-notifications.module.ts, which binds REALTIME_NOTIFIER to a
 * non-realtime no-op instead. That split exists specifically so RealtimeModule/GamesModule (and
 * realtime.gateway.ts's module-load-time FRONTEND_URL check, which crash-loops a
 * NODE_ENV=production process with no FRONTEND_URL set — exactly the worker's alpha container)
 * never enter the worker's module graph. See that module's docblock for the full rationale, and
 * WorkerRealtimeNotifier's docblock for the exact behavioural delta of a worker-originated
 * notification.
 */
@Module({
  imports: [RealtimeModule],
  providers: [
    NotificationsService,
    WebPushService,
    { provide: REALTIME_NOTIFIER, useExisting: RealtimeGateway },
  ],
  exports: [NotificationsService, WebPushService],
})
export class NotificationsServiceModule {}
