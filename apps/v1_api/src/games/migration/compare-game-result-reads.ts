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
  // Set this when the source has genuinely no persisted projected-side
  // revision to read back (never imported, or the import row could not be
  // located) — NOT when a projection exists but happens to look
  // uninteresting. Callers MUST NOT paper over a missing projection by
  // substituting the source's own value as `projected` (that previously made
  // every not-yet-imported source compare against itself and count as a
  // silent, construction-level match). When `missingProjection` is true this
  // pair is unconditionally reported as a mismatch — `legacy`/`projected`
  // are not diffed at all, so no combination of caller-supplied values can
  // make it pass. `identity.revisionId` must still be a real, non-empty,
  // non-fabricated placeholder (not the entityId) so the mismatch record
  // stays a genuine, addressable identity.
  missingProjection?: boolean;
};

// Sentinel `field` for a forced missing-projection mismatch. `$`-prefixed to
// stay disjoint from real dotted/indexed field paths produced by
// `collectMismatches` (e.g. `score.regulation.home`), mirroring the existing
// root-value convention (`path || '$'`) below.
const MISSING_PROJECTION_FIELD = '$missingProjection';

export function compareGameResultSnapshots(input: {
  populationHash: string;
  sourceRows: number;
  partial: number;
  quarantined: number;
  pairs: SnapshotPair[];
}): GameResultComparison {
  const mismatches = input.pairs.flatMap((pair) => {
    if (pair.missingProjection) {
      return [
        {
          ...pair.identity,
          field: MISSING_PROJECTION_FIELD,
          legacy: pair.legacy,
          projected: ABSENT_VALUE_MARKER,
        },
      ];
    }
    return collectMismatches(pair.legacy, pair.projected).map((difference) => ({
      ...pair.identity,
      field: difference.field,
      legacy: difference.legacy,
      projected: difference.projected,
    }));
  });
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

// Thrown by `selectGameReadAuthority()` when `mode === 'new'` is asked to
// serve the projected/new-system response while the supplied `comparison`
// still shows a mismatch against legacy for this exact read. `mode: 'new'`
// means the projected side has become the source of truth — it must never
// silently hand back a response already known to diverge from legacy.
// Callers that reach this branch should treat it as a hard stop (log +
// surface, do not swallow), not retry-and-ignore.
export class GameReadAuthorityMismatchError extends Error {
  readonly comparison: GameResultComparison;

  constructor(comparison: GameResultComparison) {
    super(
      `Refusing to serve the projected game result as authoritative: ` +
        `${comparison.counts.mismatched} mismatch(es) detected against the legacy source ` +
        `(populationHash=${comparison.populationHash}).`,
    );
    this.name = 'GameReadAuthorityMismatchError';
    this.comparison = comparison;
  }
}

// Read-path authority selection for the Task 10 legacy -> projected game
// result cutover.
//
// `mode: 'compare'` intentionally keeps legacy as the served authority even
// when `comparison` reports a mismatch (pinned by
// compare-game-result-reads.spec.ts — "keeps legacy response authority in
// compare mode while surfacing mismatches"): during the comparison phase the
// projected side is unverified by definition, so live reads must keep
// serving the trusted source while the mismatch is surfaced as evidence via
// `comparison`. The fail-closed guarantee for this phase lives one level up,
// at the population gate (`evaluateConsecutiveZeroGate`), which must reach
// `requiredConsecutiveRuns` fully-populated, zero-mismatch runs before
// anything is allowed to flip `mode` to `'new'`. Per-request throwing here
// would contradict that pinned contract and would also turn a single
// in-flight comparison bug into a live-traffic outage during the very phase
// meant to de-risk the cutover.
//
// `mode: 'new'` is different: it means the projected side has *already*
// become authoritative, so there is no "keep serving the trusted side while
// evidence accumulates" step left to fall back on. If the caller still
// passes a `comparison` for this read (every call site is required to
// supply one) and it shows a mismatch, that is a live divergence on the
// authoritative path itself — this DOES fail closed by throwing
// `GameReadAuthorityMismatchError` instead of returning a response.
export function selectGameReadAuthority<Legacy, Projected>(
  mode: 'legacy' | 'compare' | 'new',
  legacy: Legacy,
  projected: Projected,
  comparison: GameResultComparison,
):
  | { authority: 'legacy'; response: Legacy; comparison: GameResultComparison | null }
  | { authority: 'new'; response: Projected; comparison: null } {
  if (mode === 'new') {
    if (comparison.counts.mismatched > 0) {
      throw new GameReadAuthorityMismatchError(comparison);
    }
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
