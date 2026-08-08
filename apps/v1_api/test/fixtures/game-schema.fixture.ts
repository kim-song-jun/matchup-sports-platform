export const gameSchemaFixture = {
  gameId: '00000000-0000-4000-8000-000000000901',
  secondGameId: '00000000-0000-4000-8000-000000000902',
  teamMatchId: '00000000-0000-4000-8000-000000000911',
  tournamentFixtureId: '00000000-0000-4000-8000-000000000912',
  secondTournamentFixtureId: '00000000-0000-4000-8000-0000000009e1',
  sportId: '00000000-0000-4000-8000-000000000913',
  regionId: '00000000-0000-4000-8000-000000000914',
  teamId: '00000000-0000-4000-8000-000000000915',
  configId: '00000000-0000-4000-8000-000000000921',
  secondConfigId: '00000000-0000-4000-8000-000000000922',
  sideHomeId: '00000000-0000-4000-8000-000000000931',
  sideAwayId: '00000000-0000-4000-8000-000000000932',
  lineupId: '00000000-0000-4000-8000-000000000941',
  participantId: '00000000-0000-4000-8000-000000000951',
  revisionId: '00000000-0000-4000-8000-000000000961',
  secondRevisionId: '00000000-0000-4000-8000-000000000962',
  fieldId: '00000000-0000-4000-8000-000000000971',
  secondFieldId: '00000000-0000-4000-8000-000000000972',
  tournamentId: '00000000-0000-4000-8000-000000000981',
  secondTournamentId: '00000000-0000-4000-8000-000000000982',
  userId: '00000000-0000-4000-8000-000000000991',
  secondUserId: '00000000-0000-4000-8000-000000000992',
  requestId: '00000000-0000-4000-8000-0000000009a1',
  linkId: '00000000-0000-4000-8000-0000000009b1',
  now: new Date('2026-07-29T00:00:00.000Z'),
} as const;

// Re-pinned for the expand/contract migration-gate split
// (fix/v1-expand-contract-split). Both hashes changed this time:
// - schema: competitionConfigVersionId went from required-with-@default to
//   optional/no-default on V1TeamMatch/V1Tournament/V1TournamentFixture
//   (their `competitionConfig` relations became optional to match) — that
//   column's SET NOT NULL/SET DEFAULT moved to a deferred contract-phase
//   migration; see docs/ops/task9-competition-config-contract-phase.md.
//   V1Notification.businessKey keeps its `@unique` (deferring
//   v1_notifications_business_key_key turned out to be unsafe, not just a
//   gate nuance — game-result-submitted-escalation.service.ts's
//   notifyReviewer() relies on `INSERT ... ON CONFLICT (business_key)`
//   against an index that must actually exist, confirmed by running the
//   Task 22 result-review integration suite against a build that deferred
//   it), so schema.prisma's byte diff from the previous pin is narrower
//   than the first draft of this comment described.
// - migration (20260729000100_v1_game_operations): "V1EscalationKind" is now
//   created directly as ('ESCALATION', 'REMINDER') — its final order —
//   instead of ('REMINDER', 'ESCALATION') + a later rename/recreate/
//   alter-column/drop dance in 20260802000300_v1_result_escalation_lifecycle,
//   which scripts/qa/check-expand-contract-migrations.mjs rejected as
//   non-additive on a pre-existing type. No table, column, index, or FK in
//   this migration changed shape.
export const gameSchemaSourceManifest = {
  schema: 'af1276e862aa4a1baff1113a13932a05fd84f3b8bd0faee8e53a6624271941bf',
  migration: '6bd7fae42e9ee7debff71d26f7252d220ad2c12ae6f14745d103fc7fa61e8f64',
} as const;

type GameSchemaSourcePaths = {
  schema: string;
  migration: string;
};

export function verifyGameSchemaSourceSnapshot(
  manifest: Pick<typeof gameSchemaSourceManifest, 'schema' | 'migration'>,
  candidates: GameSchemaSourcePaths,
) {
  for (const [name, path, expected] of [
    ['schema', candidates.schema, manifest.schema],
    ['migration', candidates.migration, manifest.migration],
  ] as const) {
    const actual = createHash('sha256').update(readFileSync(path)).digest('hex');
    if (actual !== expected) {
      throw new Error(`SOURCE_SNAPSHOT_DRIFT: ${name} bytes differ from bound source snapshot`);
    }
  }
}

export function gameConfigData(id: string = gameSchemaFixture.configId) {
  return {
    id,
    sportCode: 'FOOTBALL',
    name: 'football-v1',
    version: 1,
    periods: [{ number: 1, durationSeconds: 1800 }, { number: 2, durationSeconds: 1800 }],
    events: ['GOAL', 'CARD', 'SUBSTITUTION'],
    lineup: { minimum: 5, maximum: 18 },
    result: { requiresScorer: false },
    tieBreak: { order: ['points', 'goalDifference', 'goalsFor'] },
    visibility: { default: 'LIVE' },
    contentHash: `fixture-${id}`,
    createdAt: gameSchemaFixture.now,
    updatedAt: gameSchemaFixture.now,
  };
}

export function gameData(overrides: Record<string, unknown> = {}) {
  return {
    id: gameSchemaFixture.gameId,
    sourceType: 'TEAM_MATCH' as const,
    teamMatchId: gameSchemaFixture.teamMatchId,
    tournamentFixtureId: null,
    state: 'SCHEDULED' as const,
    version: 0,
    lastSequence: 0,
    competitionConfigVersionId: gameSchemaFixture.configId,
    createdAt: gameSchemaFixture.now,
    updatedAt: gameSchemaFixture.now,
    ...overrides,
  };
}
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
