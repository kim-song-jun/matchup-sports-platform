import type { V1GameResultRevisionState, V1TeamMatchLineupBenchEntry, V1TeamMatchLineupStarter } from '@/types/api';

/** One roster row the host can attribute goals/cards to on the result form. */
export type ResultRosterRow = {
  participantId: string;
  displayName: string;
  jerseyNumber: number | null;
  goalkeeper: boolean;
  started: boolean;
};

export function toResultRosterRows(
  starters: V1TeamMatchLineupStarter[],
  bench: V1TeamMatchLineupBenchEntry[],
): ResultRosterRow[] {
  return [
    ...starters.map((starter) => ({
      participantId: starter.id,
      displayName: starter.displayName,
      jerseyNumber: starter.jerseyNumber,
      goalkeeper: starter.goalkeeper,
      started: true,
    })),
    ...bench.map((entry) => ({
      participantId: entry.id,
      displayName: entry.displayName,
      jerseyNumber: entry.jerseyNumber,
      goalkeeper: false,
      started: false,
    })),
  ];
}

/**
 * `eventsHash` is a required, non-empty string on `CreateGameResultRevisionDto` but the
 * server never cross-checks it against anything for a team match (there is no event
 * stream to hash — see docs/api/domains/games.md's Task 17 note). We still compute a
 * real content hash of what the host actually submitted, both so the field is honest
 * (not a magic constant) and so a resubmission of literally identical content is
 * naturally idempotent-detectable later if a future task wires that check up.
 *
 * Deliberately synchronous and dependency-free (FNV-1a, 32-bit) rather than
 * `crypto.subtle.digest` — jsdom's `Crypto` does not implement `SubtleCrypto` the way
 * some legacy WebViews (see `lib/uuid.ts`'s randomUUID fallback note) don't either, and
 * this value is never verified server-side, so a lightweight fingerprint is enough.
 */
export function hashResultPayload(payload: unknown): string {
  const text = JSON.stringify(payload);
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export const RESULT_REVISION_STATE_LABEL: Record<V1GameResultRevisionState, string> = {
  DRAFT: '작성 중',
  SUBMITTED: '상대팀 승인 대기',
  CHANGE_REQUESTED: '정정 요청됨',
  SUPPLEMENT_REQUESTED: '보완 요청됨',
  REJECTED: '반려됨',
  OFFICIAL: '공식 확정',
  VOID: '무효 처리됨',
};
