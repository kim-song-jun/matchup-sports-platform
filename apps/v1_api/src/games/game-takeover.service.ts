import { Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';

/**
 * In-process exclusive takeover grant registry for live tournament-fixture
 * game operations (Task 20). A takeover token is an opaque value bound to
 * (gameId, authorizationSubject) that is exclusive per game: granting a new
 * token for a game always atomically supersedes any prior token for that
 * game, matching the frozen realtime contract ("Grant/renew atomically
 * expires the prior token").
 *
 * Known limitation (reported, not silently accepted): this store is
 * per-process memory, not durable/shared across horizontally scaled API
 * instances. A multi-instance deployment would need a shared store (e.g.
 * Redis) keyed the same way; this codebase currently has no shared cache
 * dependency for the v1 API, and introducing one is out of this task's
 * scope. Single-instance dev/CI/tests are exact; a future multi-instance
 * rollout must add a shared backing store before relying on this for
 * cross-instance exclusivity.
 */
export interface GameTakeoverGrant {
  readonly gameId: string;
  readonly token: string;
  readonly authorizationSubject: string;
  readonly clientInstanceId: string;
  readonly lastSequence: number;
  readonly expiresAt: number;
}

const REQUEST_ORDINAL = Symbol('game-takeover-request-ordinal');

/** Internal identity minted before authorization awaits; never accepted from a client payload. */
export interface GameTakeoverRequestReservation {
  readonly gameId: string;
  readonly [REQUEST_ORDINAL]: number;
}

type GrantInput = {
  gameId: string;
  authorizationSubject: string;
  clientInstanceId: string;
  lastSequence: number;
};

type PendingRequestOrder = {
  nextOrdinal: number;
  latestGrantedOrdinal: number;
  pending: Set<GameTakeoverRequestReservation>;
};

export const GAME_TAKEOVER_TOKEN_TTL_MS = 90_000;

@Injectable()
export class GameTakeoverService {
  private readonly grants = new Map<string, GameTakeoverGrant>();
  private readonly requestOrders = new Map<string, PendingRequestOrder>();

  reserveRequest(gameId: string): GameTakeoverRequestReservation {
    const order = this.requestOrders.get(gameId) ?? {
      nextOrdinal: 0, latestGrantedOrdinal: 0, pending: new Set<GameTakeoverRequestReservation>(),
    };
    const reservation = Object.freeze({ gameId, [REQUEST_ORDINAL]: ++order.nextOrdinal });
    order.pending.add(reservation);
    this.requestOrders.set(gameId, order);
    return reservation;
  }

  finishRequest(reservation: GameTakeoverRequestReservation): void {
    const order = this.requestOrders.get(reservation.gameId);
    if (order === undefined || !order.pending.delete(reservation)) return;
    // Keep the successful watermark until the pending count reaches zero.
    // Expiry/revocation must not let an older authorization resume and revive a grant.
    if (order.pending.size === 0) this.requestOrders.delete(reservation.gameId);
  }

  grant(input: GrantInput): GameTakeoverGrant;
  grant(input: GrantInput, reservation: GameTakeoverRequestReservation): GameTakeoverGrant | null;
  grant(input: GrantInput, reservation?: GameTakeoverRequestReservation): GameTakeoverGrant | null {
    const pending = reservation ?? this.reserveRequest(input.gameId);
    try {
      const order = this.requestOrders.get(input.gameId);
      if (
        order === undefined || !order.pending.has(pending) ||
        pending[REQUEST_ORDINAL] <= order.latestGrantedOrdinal
      ) return null;
      const record: GameTakeoverGrant = {
        gameId: input.gameId,
        token: randomBytes(32).toString('hex'),
        authorizationSubject: input.authorizationSubject,
        clientInstanceId: input.clientInstanceId,
        lastSequence: input.lastSequence,
        expiresAt: Date.now() + GAME_TAKEOVER_TOKEN_TTL_MS,
      };
      // Check, grant and successful watermark advance are one synchronous operation.
      this.grants.set(input.gameId, record);
      order.latestGrantedOrdinal = pending[REQUEST_ORDINAL];
      return record;
    } finally {
      if (reservation === undefined) this.finishRequest(pending);
    }
  }

  renew(input: {
    gameId: string;
    token: string;
    authorizationSubject: string;
    clientInstanceId: string;
  }): GameTakeoverGrant | null {
    const current = this.grants.get(input.gameId);
    if (
      current === undefined ||
      current.token !== input.token ||
      current.authorizationSubject !== input.authorizationSubject ||
      current.clientInstanceId !== input.clientInstanceId ||
      current.expiresAt <= Date.now()
    ) {
      return null;
    }
    const renewed: GameTakeoverGrant = {
      ...current,
      expiresAt: Date.now() + GAME_TAKEOVER_TOKEN_TTL_MS,
    };
    this.grants.set(input.gameId, renewed);
    return renewed;
  }

  /**
   * Validates a token presented on an exclusive REST/socket mutation. REST
   * commands never carry clientInstanceId (frozen REST contract), so only
   * (gameId, token, authorizationSubject) are checked here -- clientInstanceId
   * binding is enforced at grant/renew time (the socket handshake), not on
   * every subsequent use of an already-granted token.
   */
  validate(input: { gameId: string; token: string; authorizationSubject: string }): boolean {
    const current = this.grants.get(input.gameId);
    return (
      current !== undefined &&
      current.token === input.token &&
      current.authorizationSubject === input.authorizationSubject &&
      current.expiresAt > Date.now()
    );
  }

  /** Evicts any active grant for a game -- used when a holder's permission is revoked. */
  revoke(gameId: string): void {
    this.grants.delete(gameId);
  }

  /**
   * Backlog fix (realtime-takeover-and-eviction-protocol): distinguishes
   * "this presented token was actively SUPERSEDED by a different, still-live
   * grant" from "this token simply expired naturally (nothing else holds the
   * game)". Both cases make `renew()` return `null` -- from that alone a
   * caller cannot tell them apart, which is exactly what caused two
   * consoles for the same game (two operators, or one operator with two
   * tabs -- `clientInstanceId` is per-tab) to fight over the token forever:
   * whichever side's renew failed treated ANY failure as "my token just
   * expired, grab a fresh one" and grant() unconditionally overwrites
   * whatever the other side is holding, so the other side's next renew then
   * fails the same way and re-grabs back, at the ~20s renew-interval cadence,
   * indefinitely.
   *
   * A caller (the realtime gateway) uses this to pick the client-facing
   * denial code: `TAKEOVER_SUPERSEDED` when true (a legitimate holder has
   * the game right now -- the client must NOT auto-reacquire, or it just
   * re-triggers the fight) vs. the existing `TAKEOVER_TOKEN_EXPIRED` when
   * false (nothing currently holds the game -- the client's own token
   * merely lapsed, e.g. a backgrounded tab missing its 20s renew cadence
   * for 90s+; auto-reacquiring here is exactly the intended alpha-incident
   * regression fix from 2026-08-10 and must keep working).
   */
  isSuperseded(gameId: string, presentedToken: string): boolean {
    const current = this.grants.get(gameId);
    return current !== undefined && current.expiresAt > Date.now() && current.token !== presentedToken;
  }
}
