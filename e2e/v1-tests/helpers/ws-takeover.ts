import { randomUUID } from 'node:crypto';
import { io, type Socket } from 'socket.io-client';

/**
 * WS takeover acquisition for `TOURNAMENT_FIXTURE` live-game commands
 * (`game.subscribe` + `game.takeover.request` on the `/game-operations`
 * namespace -- `apps/v1_api/src/realtime/realtime.gateway.ts`).
 *
 * ## Why header dev-auth alone used to look broken here
 *
 * `helpers/auth.ts`'s `loginAs()` header dev-auth (`x-v1-user-email`) is
 * enough for every REST spec, but a bare socket handshake carrying only that
 * header was rejected with `SOCKET_AUTH_FAILED` in earlier investigation.
 * The actual cause: `RealtimeGateway.authenticateSocket()` runs TWO checks,
 * not one --
 *   1. `resolveV1RequestIdentity()` (the same header/cookie resolution REST
 *      uses)
 *   2. `parseConnectionMetadata(client.handshake.auth)`, which independently
 *      requires `clientInstanceId` (non-empty string) and
 *      `authorizationSubjectVersion` (a non-negative integer) to be present
 *      in the handshake `auth` payload.
 * Failing check 2 alone throws the generic `SOCKET_METADATA_INVALID`, which
 * the connection middleware then re-wraps as the same opaque
 * `SOCKET_AUTH_FAILED` a real auth failure would produce -- indistinguishable
 * from the outside without reading the gateway source. Supplying both fields
 * (verified live, 2026-08-05) connects immediately; no cookie/dev-session is
 * required for this.
 *
 * `authorizationSubjectVersion` only needs to be *consistent* between the
 * handshake and any later `game.takeover.request` payload -- the gateway
 * compares the two directly (`client.data.authorizationSubjectVersion !==
 * input.authorizationSubjectVersion`). It does not need to match a real
 * per-tournament staff-assignment version for a `platform_ops` actor (whose
 * `TournamentStaffAccessService.assertAccess` principal carries
 * `assignmentVersion: null`, which skips that separate check in
 * `subscribeToGame` entirely) -- so `0` is used uniformly here.
 */
const WEB_BASE = process.env.V1_E2E_WEB_BASE ?? 'http://localhost:3013';
const ACK_TIMEOUT_MS = 10_000;

export type TakeoverGrant = {
  readonly gameId: string;
  readonly takeoverToken: string;
  readonly version: number;
  readonly lastSequence: number;
  readonly expiresAt: string;
};

export type TakeoverHandle = {
  readonly grant: TakeoverGrant;
  /**
   * Closes the socket. The takeover token itself stays valid until a fresh
   * grant supersedes it (`GameTakeoverService.grant` is exclusive-by-write,
   * see its class doc) or its own 90s TTL elapses -- closing the socket does
   * NOT revoke the token, so a REST command issued after `close()` with the
   * still-held token keeps working.
   */
  close(): void;
};

/**
 * Connects, subscribes to `gameId`, and requests an exclusive takeover
 * grant, all as `email`. Throws with the raw denial payload if any step is
 * rejected. Calling this twice for the SAME `gameId` is the documented way
 * to exercise takeover exclusivity: the second call's grant silently
 * invalidates the first call's token (same gameId -> same single grant slot
 * in `GameTakeoverService`), which a subsequent REST command using the
 * stale first token surfaces as `403 TAKEOVER_TOKEN_EXPIRED`.
 */
export async function acquireGameTakeover(email: string, gameId: string): Promise<TakeoverHandle> {
  const socket: Socket = io(`${WEB_BASE}/game-operations`, {
    path: '/socket.io',
    transports: ['websocket'],
    auth: {
      'x-v1-user-email': email,
      clientInstanceId: randomUUID(),
      authorizationSubjectVersion: 0,
    },
    reconnection: false,
    timeout: ACK_TIMEOUT_MS,
  });

  try {
    await waitForConnect(socket);

    const subscribed = await emitWithAck<{ status: string; [key: string]: unknown }>(
      socket,
      'game.subscribe',
      { gameId, afterSequence: 0 },
    );
    if (subscribed.status !== 'subscribed') {
      throw new Error(`game.subscribe was denied: ${JSON.stringify(subscribed)}`);
    }

    const takeover = await emitWithAck<{ status: string } & Partial<TakeoverGrant>>(
      socket,
      'game.takeover.request',
      {
        gameId,
        authorizationSubjectVersion: 0,
        clientInstanceId: randomUUID(),
        lastSequence: 0,
      },
    );
    if (
      takeover.status !== 'granted' ||
      takeover.takeoverToken === undefined ||
      takeover.version === undefined ||
      takeover.lastSequence === undefined ||
      takeover.expiresAt === undefined
    ) {
      throw new Error(`game.takeover.request was denied: ${JSON.stringify(takeover)}`);
    }

    const grant: TakeoverGrant = {
      gameId,
      takeoverToken: takeover.takeoverToken,
      version: takeover.version,
      lastSequence: takeover.lastSequence,
      expiresAt: takeover.expiresAt,
    };
    return { grant, close: () => socket.disconnect() };
  } catch (error) {
    socket.disconnect();
    throw error;
  }
}

function waitForConnect(socket: Socket): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.once('connect', () => resolve());
    socket.once('connect_error', (error: Error) => reject(new Error(`WS connect failed: ${error.message}`)));
  });
}

function emitWithAck<T>(socket: Socket, event: string, payload: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${event} ack timed out`)), ACK_TIMEOUT_MS);
    socket.emit(event, payload, (ack: T) => {
      clearTimeout(timer);
      resolve(ack);
    });
  });
}
