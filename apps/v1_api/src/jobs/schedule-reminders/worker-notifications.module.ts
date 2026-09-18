import { Module } from '@nestjs/common';
import { NotificationsService } from '../../notifications/notifications.service';
import { REALTIME_NOTIFIER } from '../../notifications/realtime-notifier.port';
import { WebPushModule } from '../../notifications/web-push.module';
import { WorkerRealtimeNotifier } from './worker-realtime-notifier';

/**
 * Standalone-worker module for NotificationsService and the shared WebPushModule dispatcher.
 *
 * Task 12 fix (B1/B2 — see git history for the original defect report): V1GameOperationsWorkerModule
 * previously imported the HTTP-side notifications-service.module.ts, which (via RealtimeModule)
 * pulled in RealtimeGateway and transitively GamesModule. Two problems resulted:
 *
 *   B1 — deploy-breaking crash: realtime.gateway.ts runs
 *   `requireProductionFrontendOrigin(process.env.FRONTEND_URL)` at module-load time when
 *   NODE_ENV=production — top-level code that executes on `import`, regardless of whether Nest
 *   ever instantiates RealtimeGateway. The worker's alpha container
 *   (deploy/docker-compose.alpha.yml) sets NODE_ENV=production but never sets FRONTEND_URL (it
 *   has no REST/WS CORS boundary to protect), so importing that file crash-loops the container.
 *   A push to dev auto-deploys to alpha with no approval gate, so this was a live-outage bug.
 *
 *   B2 — scope creep / attack surface: RealtimeModule imports GamesModule, so Nest registers
 *   every controller and gateway reachable from those modules — a stateful Games Socket.IO
 *   gateway and HTTP routes the worker has no business serving, duplicated across two
 *   independently-scaled processes.
 *
 * This module supplies what the worker's ScheduleReminderService needs while binding
 * REALTIME_NOTIFIER (see notifications/realtime-notifier.port.ts) to WorkerRealtimeNotifier, a
 * no-op that never imports realtime/ or games/.
 *
 * W1 fix note (see schedule-reminder.service.ts's class docblock for the full defect): the worker
 * no longer persists reminder notifications through `NotificationsService.emitNotificationToMany`
 * — that method is fire-and-forget against a separate Prisma connection and swallows failures,
 * which is correct for the HTTP path but let the outbox mark a reminder COMPLETED before (or even
 * if never) a V1Notification row existed. `ScheduleReminderService` now writes the row directly
 * through the worker's own transaction (`tx`) instead, so `NotificationsService` is still declared
 * here only for the un-owned v1-game-operations-worker.main.ts call site's existing constructor
 * arity. `WebPushService` remains genuinely used — `ScheduleReminderService` calls
 * `sendToUser` best-effort, but ONLY after the durable row has been created. The in-process
 * Socket.IO `notification:new` emit still never fires for worker-originated notifications — see
 * WorkerRealtimeNotifier's docblock for that explicit, unrelated behavioural delta.
 *
 * This module and the HTTP app's notifications-service.module.ts both declare
 * NotificationsService, but that is safe: the worker
 * (v1-game-operations-worker.main.ts) and the HTTP app (main.ts) are two entirely separate
 * NestFactory.create() applications/processes, not two modules imported into one shared graph —
 * duplicate declarations across separate applications create separate instances in separate
 * processes, which is exactly what's wanted here, not the "same class registered twice inside
 * one app's module graph" hazard that motivated keeping V1GameOperationsWorkerModule's own
 * Task 9 declarations (ResultEscalationController etc.) out of the HTTP-side module.
 */
@Module({
  imports: [WebPushModule],
  providers: [
    NotificationsService,
    { provide: REALTIME_NOTIFIER, useClass: WorkerRealtimeNotifier },
  ],
  exports: [NotificationsService, WebPushModule],
})
export class WorkerNotificationsModule {}
