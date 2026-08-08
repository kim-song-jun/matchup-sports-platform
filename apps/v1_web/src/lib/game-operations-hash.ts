/**
 * Task 21 — mirrors `canonicalGameCommandPayloadHash()` /
 * `immutableGameEventPayload()` in `apps/v1_api/src/games/games.service.ts`
 * byte-for-byte: `sha256(JSON.stringify(canonicalize(event)))`, where
 * `canonicalize()` recursively sorts object keys (`localeCompare`) so key
 * order never changes the hash.
 *
 * This MUST match the backend exactly — `game.event.retry` (offline/gap
 * recovery replay) sends this hash and the gateway rejects a mismatch with
 * `409 OFFLINE_EVENT_REBASE_CONFLICT` (see `RealtimeGateway`/`GamesService.
 * retryEvent()`). Runs in the browser, so it uses Web Crypto
 * (`crypto.subtle.digest`) instead of Node's `crypto` module.
 */

import type { GameEventType } from '@/types/game-operations';

/** The exact fields `immutableGameEventPayload()` hashes — NOT
 * `expectedVersion`/`clientEventId`/`takeoverToken`, which travel as sibling
 * fields outside the hashed event body on both REST and the socket. */
export interface HashableGameEvent {
  readonly type: GameEventType;
  readonly sideId?: string;
  readonly participantId?: string;
  readonly assistParticipantId?: string | null;
  readonly period: number;
  readonly clockMs: number;
  readonly occurredAt: string;
  readonly payload: Record<string, unknown>;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, canonicalize(nested)]),
    );
  }
  return value;
}

/** Exported so a test can assert canonicalization independent of the async
 * hashing step (Web Crypto is not itself deterministic-to-inspect, but the
 * canonical JSON string IS). */
export function canonicalGameEventJson(event: HashableGameEvent): string {
  return JSON.stringify(canonicalize(event));
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export async function canonicalGameEventPayloadHash(event: HashableGameEvent): Promise<string> {
  const json = canonicalGameEventJson(event);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(json));
  return toHex(digest);
}
