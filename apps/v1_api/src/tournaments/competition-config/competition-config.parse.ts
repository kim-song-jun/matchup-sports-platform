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
