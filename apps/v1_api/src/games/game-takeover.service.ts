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

export const GAME_TAKEOVER_TOKEN_TTL_MS = 90_000;

@Injectable()
export class GameTakeoverService {
  private readonly grants = new Map<string, GameTakeoverGrant>();

  grant(input: {
    gameId: string;
    authorizationSubject: string;
    clientInstanceId: string;
    lastSequence: number;
  }): GameTakeoverGrant {
    const record: GameTakeoverGrant = {
      gameId: input.gameId,
      token: randomBytes(32).toString('hex'),
      authorizationSubject: input.authorizationSubject,
      clientInstanceId: input.clientInstanceId,
      lastSequence: input.lastSequence,
      expiresAt: Date.now() + GAME_TAKEOVER_TOKEN_TTL_MS,
    };
    // A fresh grant always replaces whatever token currently holds the
    // game -- exclusive by construction, regardless of who held it before.
    this.grants.set(input.gameId, record);
    return record;
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
}
