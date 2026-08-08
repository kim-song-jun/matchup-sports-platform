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
  const formations = rawFormations.filter(
    (formation): formation is CompetitionConfig['lineup']['formations'][number] =>
      isRecord(formation) &&
      typeof formation.code === 'string' &&
      typeof formation.label === 'string' &&
      Number.isInteger(formation.outfield) &&
      Array.isArray(formation.slots),
  );

  return { positions, formations };
}
