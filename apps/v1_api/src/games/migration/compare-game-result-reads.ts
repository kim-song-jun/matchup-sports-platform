export type GameResultEntityType = 'TEAM_MATCH' | 'TOURNAMENT_FIXTURE';

export type GameResultMismatch = {
  entityType: GameResultEntityType;
  entityId: string;
  revisionId: string;
  field: string;
  legacy: unknown;
  projected: unknown;
};

export type GameResultComparison = {
  counts: {
    sourceRows: number;
    compared: number;
    matched: number;
    mismatched: number;
    partial: number;
    quarantined: number;
  };
  populationHash: string;
  mismatches: GameResultMismatch[];
};

type SnapshotPair = {
  identity: {
    entityType: GameResultEntityType;
    entityId: string;
    revisionId: string;
  };
  legacy: unknown;
  projected: unknown;
};

export function compareGameResultSnapshots(input: {
  populationHash: string;
  sourceRows: number;
  partial: number;
  quarantined: number;
  pairs: SnapshotPair[];
}): GameResultComparison {
  const mismatches = input.pairs.flatMap((pair) =>
    collectMismatches(pair.legacy, pair.projected).map((difference) => ({
      ...pair.identity,
      field: difference.field,
      legacy: difference.legacy,
      projected: difference.projected,
    })),
  );
  const mismatchedEntities = new Set(
    mismatches.map((mismatch) => `${mismatch.entityType}:${mismatch.entityId}`),
  ).size;

  return {
    counts: {
      sourceRows: input.sourceRows,
      compared: input.pairs.length,
      matched: input.pairs.length - mismatchedEntities,
      mismatched: mismatchedEntities,
      partial: input.partial,
      quarantined: input.quarantined,
    },
    populationHash: input.populationHash,
    mismatches,
  };
}

export function selectGameReadAuthority<Legacy, Projected>(
  mode: 'legacy' | 'compare' | 'new',
  legacy: Legacy,
  projected: Projected,
  comparison: GameResultComparison,
):
  | { authority: 'legacy'; response: Legacy; comparison: GameResultComparison | null }
  | { authority: 'new'; response: Projected; comparison: null } {
  if (mode === 'new') {
    return { authority: 'new', response: projected, comparison: null };
  }
  return {
    authority: 'legacy',
    response: legacy,
    comparison: mode === 'compare' ? comparison : null,
  };
}

type ZeroRun = {
  populationHash: string;
  sourceRows: number;
  compared: number;
  quarantined: number;
  mismatched: number;
};

export function evaluateConsecutiveZeroGate(
  runs: ZeroRun[],
  requiredConsecutiveRuns: number,
): {
  passed: boolean;
  requiredConsecutiveRuns: number;
  consecutiveZeroRuns: number;
  latestPopulationHash: string | null;
  blocker: 'CONSECUTIVE_ZERO_RUNS_REQUIRED' | null;
} {
  if (!Number.isSafeInteger(requiredConsecutiveRuns) || requiredConsecutiveRuns <= 0) {
    throw new Error('requiredConsecutiveRuns must be a positive integer');
  }

  let consecutiveZeroRuns = 0;
  const latestPopulationHash = runs.at(-1)?.populationHash ?? null;
  for (let index = runs.length - 1; index >= 0; index -= 1) {
    const run = runs[index];
    const fullyPopulated =
      run.compared + run.quarantined === run.sourceRows &&
      run.mismatched === 0 &&
      run.populationHash === latestPopulationHash;
    if (!fullyPopulated) break;
    consecutiveZeroRuns += 1;
  }
  const passed = consecutiveZeroRuns >= requiredConsecutiveRuns;
  return {
    passed,
    requiredConsecutiveRuns,
    consecutiveZeroRuns,
    latestPopulationHash,
    blocker: passed ? null : 'CONSECUTIVE_ZERO_RUNS_REQUIRED',
  };
}

function collectMismatches(
  legacy: unknown,
  projected: unknown,
  path = '',
): Array<{ field: string; legacy: unknown; projected: unknown }> {
  if (Object.is(legacy, projected)) return [];

  if (isRecord(legacy) && isRecord(projected)) {
    const keys = [...new Set([...Object.keys(legacy), ...Object.keys(projected)])].sort();
    return keys.flatMap((key) =>
      collectMismatches(
        legacy[key],
        projected[key],
        path ? `${path}.${key}` : key,
      ),
    );
  }

  if (Array.isArray(legacy) && Array.isArray(projected)) {
    const length = Math.max(legacy.length, projected.length);
    return Array.from({ length }, (_, index) =>
      collectMismatches(
        legacy[index],
        projected[index],
        `${path}[${index}]`,
      ),
    ).flat();
  }

  return [{ field: path || '$', legacy: toComparableValue(legacy), projected: toComparableValue(projected) }];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// A leaf mismatch can legitimately have `undefined` on one side — e.g. two
// arrays of different length recurse index-by-index, and reading past the
// shorter array's end yields `undefined` with no key ever having existed.
// `JSON.stringify` silently drops object properties whose value is
// `undefined` (unlike `null`, which survives), so a mismatch report shipped
// as-is over the CLI/logs boundary would silently lose "which side was
// missing" — the only evidence a human gets that something diverged. Replace
// `undefined` with an explicit, JSON-safe absent-marker object so it survives
// serialization. Never applied to a genuinely-`null` value (`Object.is(null,
// undefined)` is false, so `null` always takes the branch below unchanged),
// keeping "absent" and "genuinely null" distinguishable on the wire.
const ABSENT_VALUE_MARKER = { __gameResultCompareAbsent: true } as const;

function toComparableValue(value: unknown): unknown {
  return value === undefined ? ABSENT_VALUE_MARKER : value;
}
