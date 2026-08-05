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

// Re-pinned for the started-flag persistence fix. The schema hash covers
// apps/v1_api/prisma/schema.prisma, whose only change since the previous pin
// is one additive field backing migration
// 20260806020000_v1_game_participant_started: V1GameParticipant.started.
// The migration hash below is UNCHANGED, which proves the bound Task 6
// migration (20260729000100_v1_game_operations) was not touched.
export const gameSchemaSourceManifest = {
  schema: '1ba07dcf2ac769ef9859274067cbcc0cd94ef17cff37dd17224b7aa39f315791',
  migration: 'bda8608ee5b4498939eea0b68ac837612338e781e09a16a41f7325ff971110d7',
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
