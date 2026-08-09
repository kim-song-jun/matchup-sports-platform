/**
 * Injection token + narrow port interface that decouples NotificationsService from the concrete
 * Socket.IO-backed RealtimeGateway.
 *
 * Why this exists (Task 12 fix): NotificationsService used to inject RealtimeGateway directly,
 * which pulled RealtimeModule — and transitively GamesModule — into every module graph that
 * needs to send a notification. realtime.gateway.ts also runs
 * `requireProductionFrontendOrigin(process.env.FRONTEND_URL)` at module-load time (top-level
 * code, evaluated the instant the file is `import`ed — independent of whether Nest ever
 * instantiates RealtimeGateway as a provider), which throws when FRONTEND_URL is unset. The
 * standalone v1-game-operations-worker runs with NODE_ENV=production but no FRONTEND_URL (see
 * deploy/docker-compose.alpha.yml — it has no REST/WS CORS boundary to protect) and must never
 * serve GamesModule's HTTP routes or RealtimeGateway's WS gateway on its internal port.
 *
 * Two composition roots bind this token differently:
 *   - notifications-service.module.ts (HTTP app) binds it to the real RealtimeGateway.
 *   - jobs/schedule-reminders/worker-notifications.module.ts (standalone worker) binds it to
 *     WorkerRealtimeNotifier, a no-op that never imports realtime/ or games/.
 *
 * This file must keep zero imports from realtime/ or games/ — anything that imports it
 * transitively must stay free of realtime.gateway.ts for the same reason.
 */
export const REALTIME_NOTIFIER = Symbol('REALTIME_NOTIFIER');

export interface RealtimeNotifierPort {
  /**
   * Best-effort in-process realtime push to a connected user. Implementations must not let
   * failures propagate beyond this call — NotificationsService already isolates it in its own
   * try/catch, but a caller-side throw would still break that isolation's assumption of a
   * synchronous, non-async-rejecting call.
   */
  emitToUser(userId: string, event: string, payload: unknown): void;
}
