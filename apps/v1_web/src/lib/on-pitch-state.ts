/**
 * Live-substitution addition — mirrors `apps/v1_api/src/games/core/
 * substitution.ts`'s derivation exactly (same fold, same ordering
 * requirement) so the console can decide, client-side, who is currently
 * on the pitch (for the "나갈 선수" step / quick-mode arm list) and who is on
 * the bench (for the "들어올 선수" step / quick-mode tap targets) WITHOUT
 * waiting on a round trip — the server (`assertSubstitution`) still
 * authoritatively re-validates every submit, this is purely a UI-side
 * filter so an operator is never even shown an invalid target.
 *
 * "On the pitch right now" is never a stored field — it is folded from
 * `GameLineupParticipant.started` (who began the match) plus every
 * NON-reversed SUBSTITUTION event so far, applied in `sequence` order.
 * Order matters: rolling substitutions can send the same player back on
 * later, so folding out of array order can produce the exact opposite of
 * the real final state.
 */

import type { QueuedGameEvent } from '@/lib/game-operations-queue';
import type { GameEventRecord, GameLineupParticipant } from '@/types/game-operations';

function outParticipantIdOf(event: GameEventRecord): string | null {
  const value = event.payload.outParticipantId;
  return typeof value === 'string' ? value : null;
}

export function deriveOnPitchParticipantIds(
  participants: readonly GameLineupParticipant[],
  events: readonly GameEventRecord[],
): ReadonlySet<string> {
  const reversedIds = new Set(
    // `undefined` guarded alongside `null`: same hardening as
    // operate-console.tsx's `scoreBySideId` (see its doc comment for the
    // full 2026-08 realtime scoreboard bug this class of filter caused) —
    // this derivation reads the exact same `GameEventRecord[]` a malformed
    // self-broadcast could have populated with `id`/`reversesEventId:
    // undefined` before the backend root-cause fix (`RealtimeGateway.
    // acknowledgeGameEvent`).
    events.map((event) => event.reversesEventId).filter((id): id is string => id !== null && id !== undefined),
  );
  const onPitch = new Set(participants.filter((p) => p.started).map((p) => p.id));
  const ordered = [...events].sort((left, right) => left.sequence - right.sequence);
  for (const event of ordered) {
    if (event.type !== 'SUBSTITUTION' || reversedIds.has(event.id)) continue;
    const outParticipantId = outParticipantIdOf(event);
    if (event.participantId === null || outParticipantId === null) continue;
    onPitch.delete(outParticipantId);
    onPitch.add(event.participantId);
  }
  return onPitch;
}

/** Active (non-reversed) SUBSTITUTION count for one side — what the
 * "남은 횟수" (remaining count) display subtracts from `maxSubstitutions`. */
export function countActiveSubstitutions(sideId: string, events: readonly GameEventRecord[]): number {
  const reversedIds = new Set(
    // See `deriveOnPitchParticipantIds`'s matching comment above — same
    // `undefined`-alongside-`null` hardening, same reason.
    events.map((event) => event.reversesEventId).filter((id): id is string => id !== null && id !== undefined),
  );
  return events.filter(
    (event) => event.type === 'SUBSTITUTION' && event.sideId === sideId && !reversedIds.has(event.id),
  ).length;
}

/** 레드카드를 받은 시각 — 확인 문구가 "후반 8:12에 퇴장"처럼 이유를 보여 주고, 어시스트가 퇴장 전 골인지 가를 때 쓴다. */
export interface SentOffRedCard {
  readonly period: number;
  readonly clockMs: number;
}

/**
 * Participants with an active (non-reversed) red card, mapped to when that card was shown
 * (the earliest one if a player somehow has several). A sent-off player stays in the
 * on-pitch set — the red card is the only record that they can no longer take part.
 * `queuedItems` adds red cards the operator just recorded that the server has not
 * acknowledged yet (queued/sending); failed and acked items are left out.
 */
export function deriveSentOffRedCards(
  events: readonly GameEventRecord[],
  queuedItems: readonly QueuedGameEvent[] = [],
): ReadonlyMap<string, SentOffRedCard> {
  const reversedIds = new Set(
    events.map((event) => event.reversesEventId).filter((id): id is string => id !== null && id !== undefined),
  );
  const earliest = new Map<string, SentOffRedCard>();
  const add = (participantId: string | null | undefined, period: number, clockMs: number) => {
    if (participantId === null || participantId === undefined || participantId === '') return;
    const current = earliest.get(participantId);
    if (current === undefined || period < current.period || (period === current.period && clockMs < current.clockMs)) {
      earliest.set(participantId, { period, clockMs });
    }
  };
  for (const event of events) {
    if (event.type !== 'CARD' || event.payload.card !== 'RED' || reversedIds.has(event.id)) continue;
    add(event.participantId, event.period, event.clockMs);
  }
  for (const { status, event } of queuedItems) {
    if (status !== 'queued' && status !== 'sending') continue;
    if (event.type === 'CARD' && event.payload.card === 'RED') add(event.participantId, event.period, event.clockMs);
  }
  return earliest;
}

/** Participants with an active (non-reversed) red card — see `deriveSentOffRedCards`. */
export function deriveSentOffParticipantIds(
  events: readonly GameEventRecord[],
  queuedItems: readonly QueuedGameEvent[] = [],
): ReadonlySet<string> {
  return new Set(deriveSentOffRedCards(events, queuedItems).keys());
}

/**
 * 그 선수가 `at` 시점에 이미 퇴장한 상태였는가. 같은 시각이면 퇴장한 것으로 본다.
 * 새로 기록하는 이벤트는 늘 "지금"이라 레드카드가 있으면 곧 퇴장 상태지만, 어시스트는 이미 기록된
 * 골에 나중에 붙이므로 골 시각을 기준으로 가려야 한다(어시스트한 뒤에 퇴장한 선수는 정상이다).
 */
export function wasSentOffAt(
  red: SentOffRedCard | undefined,
  at: { readonly period: number; readonly clockMs: number },
): boolean {
  if (red === undefined) return false;
  return red.period < at.period || (red.period === at.period && red.clockMs <= at.clockMs);
}
