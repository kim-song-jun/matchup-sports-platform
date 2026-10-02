import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

/**
 * Room-scoped realtime fan-out for a single game, decoupled from the concrete
 * Socket.IO gateway.
 *
 * Why a registry instead of a Nest injection token (the shape
 * `notifications/realtime-notifier.port.ts` uses): `RealtimeModule` already
 * imports `GamesModule` (the gateway injects `GamesService`), so `GamesModule`
 * cannot import `RealtimeModule` back without a circular module graph. Binding
 * the delegate at runtime — the gateway registers itself in `afterInit()` —
 * keeps the dependency arrow pointing one way and keeps this file free of any
 * `realtime/` import, which the standalone v1-game-operations-worker requires
 * (see realtime-notifier.port.ts's docblock: importing realtime.gateway.ts at
 * all runs its module-load-time `FRONTEND_URL` check and crash-loops that
 * container).
 *
 * Unregistered is the correct steady state for the worker and for unit tests:
 * `emitToGame` is then a no-op, exactly as a notification is in
 * `WorkerRealtimeNotifier`.
 *
 * Why this exists at all (2026-08-15): `game.event.committed` used to be
 * emitted ONLY from the gateway's own `game.event.append`/`game.event.retry`
 * handlers. Every REST-originated mutation of the same event log
 * (`POST /games/:id/events`, `.../events/:eventId/reverse`,
 * `.../events/:eventId/assist`) therefore committed to the database while
 * every subscriber on that game's room — other operator consoles, spectators
 * — was told nothing, and only saw the change on the next manual refetch.
 */
export interface GameRoomBroadcaster {
  emitToGame(gameId: string, event: string, payload: unknown): void;
}

@Injectable()
export class GameBroadcastRegistry implements GameRoomBroadcaster {
  private delegate: GameRoomBroadcaster | null = null;

  constructor(
    @InjectPinoLogger(GameBroadcastRegistry.name) private readonly logger: PinoLogger,
  ) {}

  register(delegate: GameRoomBroadcaster): void {
    this.delegate = delegate;
  }

  /**
   * Best-effort. A realtime fan-out failure must never fail the HTTP write that
   * already committed — the durable sequence in the database stays authoritative
   * and subscribers recover through HTTP backfill
   * (`GET /games/:gameId/events?afterSequence=N`) or a fresh subscribe snapshot,
   * exactly as the frozen realtime contract specifies for a dropped delivery.
   * The failure is logged rather than swallowed so a broken fan-out is visible.
   */
  emitToGame(gameId: string, event: string, payload: unknown): void {
    if (this.delegate === null) return;
    try {
      this.delegate.emitToGame(gameId, event, payload);
    } catch (error: unknown) {
      this.logger.warn({ gameId, event, err: error }, 'Game room broadcast failed');
    }
  }
}
