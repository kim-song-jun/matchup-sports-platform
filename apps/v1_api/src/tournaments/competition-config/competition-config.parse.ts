import type { Prisma } from '@prisma/client';
import type { CompetitionConfig } from './competition-config.types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Reads `lineup.positions`/`lineup.formations` back out of a stored
 * CompetitionConfig JSON blob for GET responses (T1-5). New rows are already
 * shape-validated at write time by `validateCompetitionConfig`, but this
 * reader stays tolerant of legacy config rows written before T1-5 added
 * positions/formations to the schema — such rows resolve to empty arrays
 * instead of throwing, which the frontend already treats as "no preset
 * catalog, 자유 배치 only" (formation-slots.ts, D-17) rather than a hard error.
 */
export function parseLineupCatalog(
  value: Prisma.JsonValue | null | undefined,
): Pick<CompetitionConfig['lineup'], 'positions' | 'formations'> {
  const lineup = isRecord(value) ? value : {};

  const rawPositions = Array.isArray(lineup.positions) ? lineup.positions : [];
  const positions = rawPositions.filter(
    (position): position is CompetitionConfig['lineup']['positions'][number] =>
      isRecord(position) &&
      typeof position.code === 'string' &&
      typeof position.label === 'string' &&
      typeof position.short === 'string',
  );

  const rawFormations = Array.isArray(lineup.formations) ? lineup.formations : [];
  const formations = rawFormations
    .filter(
      (formation): formation is CompetitionConfig['lineup']['formations'][number] =>
        isRecord(formation) &&
        typeof formation.code === 'string' &&
        typeof formation.label === 'string' &&
        Number.isInteger(formation.outfield) &&
        Array.isArray(formation.slots),
    )
    // Copilot review finding (PR #277): a legacy row could have `slots` be an
    // array without each element actually being `{ position, x, y }` — the
    // frontend's buildFormationPresets() reads slot.position/x/y unguarded,
    // so a malformed element would throw at render time instead of just
    // being dropped here. Validate every slot's shape, not only that the
    // container is an array.
    .filter((formation) =>
      formation.slots.every(
        (slot) =>
          isRecord(slot) &&
          typeof slot.position === 'string' &&
          typeof slot.x === 'number' &&
          typeof slot.y === 'number',
      ),
    );

  return { positions, formations };
}

/**
 * Reads `lineup.{minPlayers,maxPlayers,substitutions,maxSubstitutions}` back out of a
 * stored CompetitionConfig JSON blob for lineup-size validation. Shared by every write
 * path that must enforce the roster cap so the cap has exactly one parser — before this
 * was extracted, `team-match-lineup.service.ts` carried a private copy and
 * `games.service.ts#saveLineup` had no equivalent check at all (never validated the
 * generic tournament-fixture lineup save path against the pinned config's roster size).
 * Same tolerant-defaults contract as `parseLineupCatalog` above: a malformed/legacy value
 * degrades to safe fallbacks (minPlayers 1, maxPlayers 11, substitutions 'limited',
 * maxSubstitutions null) instead of throwing — this is a read-path helper, not the
 * write-time validator (`validateCompetitionConfig` owns rejecting bad writes).
 */
export function parseLineupLimits(
  value: Prisma.JsonValue | null | undefined,
): Pick<CompetitionConfig['lineup'], 'minPlayers' | 'maxPlayers' | 'substitutions' | 'maxSubstitutions'> {
  const lineup = isRecord(value) ? value : {};
  const minPlayers = typeof lineup.minPlayers === 'number' ? lineup.minPlayers : 1;
  const maxPlayers = typeof lineup.maxPlayers === 'number' ? lineup.maxPlayers : 11;
  const substitutions = lineup.substitutions === 'rolling' ? 'rolling' : 'limited';
  const maxSubstitutions = typeof lineup.maxSubstitutions === 'number' ? lineup.maxSubstitutions : null;
  return { minPlayers, maxPlayers, substitutions, maxSubstitutions };
}

/**
 * The `lineupConfig` payload that lineup GET responses carry: the sport's position/formation
 * catalog **plus this tournament's configured squad size** (`lineup.{minPlayers,maxPlayers}`,
 * the "출전 인원" the admin picked — not `V1Tournament.minPlayers/maxPlayers`, which is the
 * registration roster size; `lineup-size.ts` documents that distinction).
 *
 * The frontend previously received only the catalog, so it had to infer which formations fit
 * by counting `starters − 골키퍼로 지정된 선수`. That count moves the moment a manager taps GK,
 * which swapped the whole preset list mid-edit (a 5-a-side squad with no GK assigned yet was
 * offered 6-a-side presets). Sending the configured size lets the screen tell the manager how
 * many players the competition actually expects instead of guessing from the current draft.
 *
 * Both lineup read paths (`games.service.ts`, `team-match-lineup.service.ts`) must use this
 * single helper — before it existed each one composed its own `lineupConfig` object and only
 * one of them would have gained the new field.
 */
export function parseLineupConfigForResponse(
  value: Prisma.JsonValue | null | undefined,
): Pick<CompetitionConfig['lineup'], 'positions' | 'formations' | 'minPlayers' | 'maxPlayers'> {
  const { minPlayers, maxPlayers } = parseLineupLimits(value);
  return { ...parseLineupCatalog(value), minPlayers, maxPlayers };
}

/**
 * Reads each period's `{durationMinutes, extraTime}` back out of a stored
 * CompetitionConfig JSON blob's `periods` column. Added for the alpha
 * "452′" clock-overrun incident (2026-08): `clockMs` has no upper-bound
 * validation anywhere on the write path (see `game-invariants.ts`'s comment
 * on `validateEventShape` and this repo's decision NOT to hard-reject a
 * suspiciously large clock -- an operator who is offline/behind must still
 * be able to record what happened). Instead, the operator console uses this
 * parsed duration to ask the operator to *confirm* a clock that runs far
 * past its period's configured length before it submits the event.
 *
 * Index `i` in the returned array corresponds to runtime period number
 * `i + 1` (`V1GamePeriod.number`) -- `advancePeriod()` (games.service.ts)
 * always walks `V1GamePeriod` rows in the same order this config's
 * `periods` array was written in at game creation, so array-index
 * alignment is safe (the same assumption this repo's operator console
 * `period-label.ts` already relies on: period 1 = the config's first
 * entry).
 *
 * Tolerant like `parseLineupCatalog`/`parseLineupLimits` above, but the
 * failure mode is `null` (rather than a numeric fallback) because a made-up
 * duration would drive a real UX decision (whether to interrupt an operator
 * with a confirmation) -- guessing wrong is worse than not warning at all.
 * A legacy config row can store `periods` as `{ count: N }` instead of an
 * array (`computePeriodCount` in `games.service.ts` handles that same
 * legacy shape); that shape carries no per-period duration, so this returns
 * `null` wholesale rather than guessing. A malformed individual entry
 * (missing/non-positive `durationMinutes`) degrades to `null` for just that
 * entry instead of invalidating the whole array, since one bad period
 * shouldn't silently disable the warning for every other period.
 */
export function parsePeriodDurations(
  value: Prisma.JsonValue | null | undefined,
): ReadonlyArray<{ durationMinutes: number; extraTime: boolean } | null> | null {
  if (!Array.isArray(value)) return null;
  return value.map((raw) => {
    if (!isRecord(raw)) return null;
    const durationMinutes = raw.durationMinutes;
    if (typeof durationMinutes !== 'number' || !Number.isFinite(durationMinutes) || durationMinutes <= 0) {
      return null;
    }
    return { durationMinutes, extraTime: raw.extraTime === true };
  });
}
