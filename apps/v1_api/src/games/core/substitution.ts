import { GameContractError } from './game-contract';

/**
 * Live-operations substitution — pure derivation + validation, no Prisma.
 *
 * Contract this module enforces (see the live-substitution task's design
 * note): a SUBSTITUTION event carries the INCOMING participant as
 * `participantId` (the established "this event's subject" column every
 * other event type already uses) and the OUTGOING participant as
 * `payload.outParticipantId` — a plain string, not `assistParticipantId`,
 * because that column is contractually GOAL-only elsewhere
 * (`game-invariants.ts#validateEventShape`, `games.service.ts
 * #assertEventReferences`'s ASSIST_INVALID checks). Reusing it here would
 * either have to loosen that GOAL-only guarantee or silently overload its
 * meaning — a dedicated payload field keeps both events' contracts single-
 * purpose.
 *
 * "On the pitch right now" is never stored as a column — it is folded from
 * `V1GameParticipant.started` (who began the match) plus every NON-reversed
 * SUBSTITUTION event so far, applied in `sequence` order (chronological).
 * Order matters: rolling substitutions can send the same player back on
 * later, so folding out of order can produce the exact opposite of the real
 * final state (see this file's spec for a concrete example).
 */

export interface SubstitutionParticipant {
  readonly id: string;
  readonly sideId: string;
  readonly started: boolean;
  /** Last-known pitch placement — carried forward onto the incoming
   * participant's row by the caller when a substitution is accepted (see
   * `validateSubstitution`'s return value). Not itself derived; a plain
   * snapshot column exactly like `saveLineup` already writes for every
   * participant regardless of on/off-pitch status. */
  readonly position: string | null;
  readonly positionX: number | null;
  readonly positionY: number | null;
}

/** The subset of a stored `V1GameEvent` row this module needs. `sequence` is
 * required so the fold can be ordered correctly regardless of what order the
 * caller's query happened to return rows in. */
export interface SubstitutionPriorEvent {
  readonly id: string;
  readonly sequence: number;
  readonly type: string;
  readonly sideId: string | null;
  readonly participantId: string | null;
  readonly reversesEventId: string | null;
  readonly payload: Record<string, unknown>;
}

function outParticipantIdOf(event: SubstitutionPriorEvent): string | null {
  const value = event.payload.outParticipantId;
  return typeof value === 'string' ? value : null;
}

/** Every participant who started the match, minus everyone folded off by an
 * active (non-reversed) SUBSTITUTION, plus everyone folded on. Reversing a
 * SUBSTITUTION (via `GamesService.reverseEvent`, which never touches
 * `started`) is enough on its own to put both players back where they were —
 * this function needs no special-case for that, since a reversed event is
 * simply skipped in the fold. */
export function deriveOnPitchParticipantIds(
  participants: readonly SubstitutionParticipant[],
  priorEvents: readonly SubstitutionPriorEvent[],
): ReadonlySet<string> {
  const reversedIds = new Set(
    priorEvents
      .map((event) => event.reversesEventId)
      .filter((id): id is string => id !== null),
  );
  const onPitch = new Set(participants.filter((p) => p.started).map((p) => p.id));
  const ordered = [...priorEvents].sort((left, right) => left.sequence - right.sequence);
  for (const event of ordered) {
    if (event.type !== 'SUBSTITUTION' || reversedIds.has(event.id)) continue;
    const outParticipantId = outParticipantIdOf(event);
    if (event.participantId === null || outParticipantId === null) continue; // malformed row defensively ignored — cannot happen for events that passed validateSubstitution at append time
    onPitch.delete(outParticipantId);
    onPitch.add(event.participantId);
  }
  return onPitch;
}

/**
 * Everyone who was on the pitch at *any* point — the starters plus every
 * player an active SUBSTITUTION ever brought on. This is deliberately NOT
 * `deriveOnPitchParticipantIds`: that one answers "who is out there right
 * now" and therefore *removes* a substituted-off player, while an appearance
 * is permanent — a starter who came off in the 30th minute still played the
 * match.
 *
 * The distinction is the whole point of the appearance gate: being named on
 * a lineup (`V1GameParticipant`) is an entry, not an appearance. A bench
 * player who never came on has no `started` flag and is never the INCOMING
 * side of a SUBSTITUTION, so they are correctly absent from this set and
 * must not be counted as having played the match.
 *
 * A reversed SUBSTITUTION is skipped for the same reason it is skipped in
 * the on-pitch fold — `reverseEvent` is how a mis-entered substitution is
 * undone, so the player it named never actually came on.
 */
export function deriveAppearedParticipantIds(
  participants: readonly Pick<SubstitutionParticipant, 'id' | 'started'>[],
  // Narrower than the on-pitch fold's input on purpose: no `sequence` (set
  // union needs no ordering) and no `payload` (the OUTGOING player is
  // irrelevant — going off does not un-play a match). Keeping the parameter
  // to exactly what is read lets callers pass raw `V1GameEvent` rows, whose
  // `payload` is a `Prisma.JsonValue` and so is not assignable to
  // `SubstitutionPriorEvent['payload']`.
  priorEvents: readonly Pick<
    SubstitutionPriorEvent,
    'id' | 'type' | 'participantId' | 'reversesEventId'
  >[],
): ReadonlySet<string> {
  const reversedIds = new Set(
    priorEvents
      .map((event) => event.reversesEventId)
      .filter((id): id is string => id !== null),
  );
  const appeared = new Set(participants.filter((p) => p.started).map((p) => p.id));
  for (const event of priorEvents) {
    if (event.type !== 'SUBSTITUTION' || reversedIds.has(event.id)) continue;
    // Unlike the on-pitch fold this needs no `sequence` ordering: set union is
    // commutative, and nothing is ever removed.
    if (event.participantId === null) continue; // malformed row defensively ignored — cannot happen for events that passed validateSubstitution at append time
    appeared.add(event.participantId);
  }
  return appeared;
}

/** Active (non-reversed) SUBSTITUTION count for one side — what
 * `substitutions: 'limited'` caps against. */
export function countActiveSubstitutions(
  sideId: string,
  priorEvents: readonly SubstitutionPriorEvent[],
): number {
  const reversedIds = new Set(
    priorEvents
      .map((event) => event.reversesEventId)
      .filter((id): id is string => id !== null),
  );
  return priorEvents.filter(
    (event) => event.type === 'SUBSTITUTION' && event.sideId === sideId && !reversedIds.has(event.id),
  ).length;
}

export interface ValidateSubstitutionInput {
  readonly sideId: string;
  readonly inParticipantId: string;
  readonly outParticipantId: string;
  readonly participants: readonly SubstitutionParticipant[];
  readonly priorEvents: readonly SubstitutionPriorEvent[];
  readonly substitutionMode: 'limited' | 'rolling';
  /** `null` = no configured cap. Ignored entirely when `substitutionMode` is
   * `'rolling'` — rolling is unlimited by definition regardless of what a
   * stray config value says. */
  readonly maxSubstitutions: number | null;
}

/** Throws `GameContractError` on the first violated invariant; returns the
 * OUTGOING participant's last-known pitch placement so the caller can carry
 * it onto the incoming participant's row (`V1GameParticipant.position*`
 * columns are a placement snapshot, not a derived value — unlike on-pitch
 * membership itself, copying them forward is a plain write). */
export function validateSubstitution(input: ValidateSubstitutionInput): {
  readonly position: string | null;
  readonly positionX: number | null;
  readonly positionY: number | null;
} {
  if (input.inParticipantId === input.outParticipantId) {
    throw new GameContractError(
      'SUBSTITUTION_INVALID',
      '나가는 선수와 들어오는 선수가 같을 수 없어요',
    );
  }
  const inParticipant = input.participants.find((p) => p.id === input.inParticipantId);
  const outParticipant = input.participants.find((p) => p.id === input.outParticipantId);
  if (inParticipant === undefined || outParticipant === undefined) {
    throw new GameContractError(
      'PARTICIPANT_SIDE_MISMATCH',
      '교체할 선수 정보를 찾을 수 없어요',
    );
  }
  if (inParticipant.sideId !== input.sideId || outParticipant.sideId !== input.sideId) {
    throw new GameContractError(
      'PARTICIPANT_SIDE_MISMATCH',
      '교체할 두 선수는 같은 팀 소속이어야 해요',
    );
  }
  const onPitch = deriveOnPitchParticipantIds(input.participants, input.priorEvents);
  if (!onPitch.has(input.outParticipantId)) {
    throw new GameContractError(
      'SUBSTITUTION_OUT_NOT_ON_PITCH',
      '나가는 선수가 지금 피치 위에 없어요',
    );
  }
  if (onPitch.has(input.inParticipantId)) {
    throw new GameContractError(
      'SUBSTITUTION_IN_ALREADY_ON_PITCH',
      '들어오는 선수가 이미 피치 위에 있어요',
    );
  }
  if (input.substitutionMode === 'limited' && input.maxSubstitutions !== null) {
    const used = countActiveSubstitutions(input.sideId, input.priorEvents);
    if (used >= input.maxSubstitutions) {
      throw new GameContractError(
        'SUBSTITUTION_LIMIT_REACHED',
        `이 대회는 팀당 교체를 ${input.maxSubstitutions}회까지만 허용해요`,
        { maxSubstitutions: input.maxSubstitutions, used },
      );
    }
  }
  return {
    position: outParticipant.position,
    positionX: outParticipant.positionX,
    positionY: outParticipant.positionY,
  };
}
