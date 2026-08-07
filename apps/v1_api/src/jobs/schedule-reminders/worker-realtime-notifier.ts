import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import type { RealtimeNotifierPort } from '../../notifications/realtime-notifier.port';

/**
 * Standalone-worker implementation of RealtimeNotifierPort.
 *
 * The v1-game-operations-worker process (V1GameOperationsWorkerModule) must never import
 * RealtimeModule/GamesModule — it has no Socket.IO server, no connected clients, and running
 * realtime.gateway.ts's module-load-time production-origin check crash-loops the container (its
 * env deliberately has no FRONTEND_URL — see deploy/docker-compose.alpha.yml and
 * realtime-notifier.port.ts for the full rationale). This class is the worker's binding for
 * REALTIME_NOTIFIER instead of the real gateway.
 *
 * Behavioural delta this introduces (explicit, not hidden): a notification created from the
 * worker (schedule_rsvp_deadline_reminder / schedule_guest_recruitment_close_reminder) is still
 * persisted to V1Notification and still attempts web push via WebPushService — both unaffected by
 * this class. The ONLY thing that differs from an HTTP-originated notification is that a
 * recipient who already has the app open in a live tab will NOT get the instant in-app
 * Socket.IO `notification:new` push for a worker-originated event; they see it on their next
 * GET /notifications poll or page refresh instead. There is no realtime outbox hand-off to the
 * HTTP process for this event — reminders are inherently "next time you check" notifications
 * (RSVP deadline / recruitment closing soon), not the kind of instant two-way interaction (chat,
 * live game score) where a missed in-tab push meaningfully degrades the experience.
 */
@Injectable()
export class WorkerRealtimeNotifier implements RealtimeNotifierPort {
  constructor(@InjectPinoLogger(WorkerRealtimeNotifier.name) private readonly logger: PinoLogger) {}

  emitToUser(userId: string, event: string): void {
    this.logger.debug(
      { userId, event },
      '워커 프로세스에서 발생한 알림 — 실시간(Socket.IO) 브로드캐스트는 생략(다음 폴링/새로고침에서 확인)',
    );
  }
}
