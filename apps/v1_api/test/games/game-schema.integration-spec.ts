import { PrismaClient } from '@prisma/client';
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { FOOTBALL_V1_CONFIG } from '../../src/tournaments/competition-config/competition-config';
import { gameConfigData, gameSchemaFixture, gameSchemaSourceManifest, verifyGameSchemaSourceSnapshot } from '../fixtures/game-schema.fixture';

const prisma = new PrismaClient();

type RawDatabaseError = {
  message?: unknown;
  meta?: unknown;
};

function rawErrorDetails(error: unknown) {
  const value = (typeof error === 'object' && error !== null ? error : {}) as RawDatabaseError;
  const meta = (typeof value.meta === 'object' && value.meta !== null ? value.meta : {}) as {
    code?: unknown;
    constraint?: unknown;
    message?: unknown;
  };
  return {
    sqlState: typeof meta.code === 'string' ? meta.code : '',
    constraint: typeof meta.constraint === 'string' ? meta.constraint : '',
    message: `${typeof meta.message === 'string' ? meta.message : ''} ${typeof value.message === 'string' ? value.message : ''}`,
  };
}

async function captureRawFailure(operation: () => Promise<unknown>): Promise<RawDatabaseError> {
  try {
    await operation();
  } catch (error) {
    return error as RawDatabaseError;
  }
  throw new Error('expected database operation to fail');
}

function expectRawFailure(error: RawDatabaseError, sqlState: string, marker: string) {
  const details = rawErrorDetails(error);
  expect(details.sqlState).toBe(sqlState);
  expect(`${details.constraint} ${details.message}`).toContain(marker);
}

async function insertConfig(id: string) {
  const name = id === gameSchemaFixture.secondConfigId
    ? 'game-schema-football-v1-secondary'
    : 'game-schema-football-v1';
  const version = id === gameSchemaFixture.secondConfigId ? 2 : 1;
  const config = {
    ...gameConfigData(id),
    sportCode: 'football',
    name,
    version,
    periods: FOOTBALL_V1_CONFIG.periods,
    events: FOOTBALL_V1_CONFIG.events,
    lineup: FOOTBALL_V1_CONFIG.lineup,
    result: FOOTBALL_V1_CONFIG.result,
    tieBreak: FOOTBALL_V1_CONFIG.tieBreak,
    visibility: FOOTBALL_V1_CONFIG.visibility,
  };
  await prisma.$executeRaw`
    INSERT INTO v1_competition_config_versions
      (id, sport_code, name, version, status, periods, events, lineup, result, tie_break, visibility, content_hash, created_at, updated_at)
    VALUES
      (${config.id}, ${config.sportCode}, ${config.name}, ${config.version}, 'ACTIVE', ${JSON.stringify(config.periods)}::jsonb,
       ${JSON.stringify(config.events)}::jsonb, ${JSON.stringify(config.lineup)}::jsonb, ${JSON.stringify(config.result)}::jsonb,
       ${JSON.stringify(config.tieBreak)}::jsonb, ${JSON.stringify(config.visibility)}::jsonb, ${config.contentHash}, ${config.createdAt}, ${config.updatedAt})
    ON CONFLICT (sport_code, name, version) DO NOTHING
  `;
}

async function insertGame(id: string, sourceType: 'TEAM_MATCH' | 'TOURNAMENT_FIXTURE', configId = gameSchemaFixture.configId) {
  const sourceColumns = sourceType === 'TEAM_MATCH'
    ? { teamMatchId: gameSchemaFixture.teamMatchId, tournamentFixtureId: null }
    : { teamMatchId: null, tournamentFixtureId: gameSchemaFixture.tournamentFixtureId };
  await prisma.$executeRaw`
    INSERT INTO v1_games
      (id, source_type, team_match_id, tournament_fixture_id, state, version, last_sequence, competition_config_version_id, created_at, updated_at)
    VALUES
      (${id}, ${sourceType}::"V1GameSourceType", ${sourceColumns.teamMatchId}, ${sourceColumns.tournamentFixtureId}, 'SCHEDULED', 0, 0, ${configId}, ${gameSchemaFixture.now}, ${gameSchemaFixture.now})
  `;
}

describe('v1 game operations schema', () => {
  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for game schema integration verification');
    }
    await prisma.$connect();
    await prisma.$executeRaw`
      INSERT INTO v1_users (id, email, created_at, updated_at)
      VALUES (${gameSchemaFixture.userId}, 'game-schema-owner@example.test', ${gameSchemaFixture.now}, ${gameSchemaFixture.now})
      ON CONFLICT (id) DO NOTHING
    `;
    await prisma.$executeRaw`
      INSERT INTO v1_sports (id, code, name, created_at, updated_at)
      VALUES (${gameSchemaFixture.sportId}, 'football', 'Game schema football', ${gameSchemaFixture.now}, ${gameSchemaFixture.now})
      ON CONFLICT (id) DO NOTHING
    `;
    await prisma.$executeRaw`
      INSERT INTO v1_regions (id, code, name, level, created_at, updated_at)
      VALUES (${gameSchemaFixture.regionId}, 'GAME_SCHEMA_REGION', 'Game schema region', 1, ${gameSchemaFixture.now}, ${gameSchemaFixture.now})
      ON CONFLICT (id) DO NOTHING
    `;
    await prisma.$executeRaw`
      INSERT INTO v1_teams (id, owner_user_id, sport_id, region_id, name, created_at, updated_at)
      VALUES (${gameSchemaFixture.teamId}, ${gameSchemaFixture.userId}, ${gameSchemaFixture.sportId}, ${gameSchemaFixture.regionId}, 'Game schema team', ${gameSchemaFixture.now}, ${gameSchemaFixture.now})
      ON CONFLICT (id) DO NOTHING
    `;
    await prisma.$executeRaw`
      INSERT INTO v1_team_matches
        (id, host_team_id, created_by_user_id, sport_id, region_id, title, place_name, start_at, created_at, updated_at)
      VALUES
        (${gameSchemaFixture.teamMatchId}, ${gameSchemaFixture.teamId}, ${gameSchemaFixture.userId}, ${gameSchemaFixture.sportId}, ${gameSchemaFixture.regionId}, 'Game schema match', 'Game schema venue', ${gameSchemaFixture.now}, ${gameSchemaFixture.now}, ${gameSchemaFixture.now})
      ON CONFLICT (id) DO NOTHING
    `;
    await prisma.$executeRaw`
      INSERT INTO v1_tournaments (id, sport_id, title, created_at, updated_at)
      VALUES (${gameSchemaFixture.tournamentId}, ${gameSchemaFixture.sportId}, 'Game schema tournament', ${gameSchemaFixture.now}, ${gameSchemaFixture.now})
      ON CONFLICT (id) DO NOTHING
    `;
    await prisma.$executeRaw`
      INSERT INTO v1_tournaments (id, sport_id, title, created_at, updated_at)
      VALUES (${gameSchemaFixture.secondTournamentId}, ${gameSchemaFixture.sportId}, 'Game schema second tournament', ${gameSchemaFixture.now}, ${gameSchemaFixture.now})
      ON CONFLICT (id) DO NOTHING
    `;
    await prisma.$executeRaw`
      INSERT INTO v1_tournament_fixtures
        (id, tournament_id, round, fixture_number, created_at, updated_at)
      VALUES (${gameSchemaFixture.tournamentFixtureId}, ${gameSchemaFixture.tournamentId}, 'group', 1, ${gameSchemaFixture.now}, ${gameSchemaFixture.now})
      ON CONFLICT (id) DO NOTHING
    `;
    await prisma.$executeRaw`
      INSERT INTO v1_tournament_fixtures
        (id, tournament_id, round, fixture_number, created_at, updated_at)
      VALUES (${gameSchemaFixture.secondTournamentFixtureId}, ${gameSchemaFixture.secondTournamentId}, 'group', 1, ${gameSchemaFixture.now}, ${gameSchemaFixture.now})
      ON CONFLICT (id) DO NOTHING
    `;
    await insertConfig(gameSchemaFixture.configId);
    await insertConfig(gameSchemaFixture.secondConfigId);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('replays the additive table set with required unique and deferred constraints', async () => {
    const tables = await prisma.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name LIKE 'v1_%'
    `;
    const names = new Set(tables.map((row) => row.table_name));
    const required = [
      'v1_games',
      'v1_game_sides',
      'v1_game_periods',
      'v1_game_lineups',
      'v1_game_participants',
      'v1_participant_identity_link_events',
      'v1_participant_identity_link_current',
      'v1_participant_consent_snapshots',
      'v1_game_events',
      'v1_game_result_revisions',
      'v1_game_result_participants',
      'v1_game_result_decisions',
      'v1_game_visibility_policies',
      'v1_outbox_events',
      'v1_projection_watermarks',
      'v1_team_schedules',
      'v1_schedule_attendance',
      'v1_schedule_guest_recruitments',
      'v1_schedule_guest_applications',
      'v1_tournament_fields',
      'v1_tournament_staff_assignments',
      'v1_tournament_staff_fixture_scopes',
      'v1_competition_config_versions',
      'v1_result_escalations',
      'v1_game_operation_flags',
      'v1_game_cutover_epochs',
      'v1_operation_audits',
    ];
    expect(required.filter((name) => !names.has(name))).toEqual([]);

    const constraints = await prisma.$queryRaw<Array<{ constraint_name: string }>>`
      SELECT constraint_name
      FROM information_schema.table_constraints
      WHERE constraint_schema = 'public'
        AND constraint_name IN (
          'v1_games_source_exactly_one_ck',
          'v1_games_current_revision_fk',
          'v1_result_revisions_supersedes_fk',
          'v1_staff_field_fk',
          'v1_staff_scope_fixture_fk'
        )
    `;
    expect(new Set(constraints.map((row) => row.constraint_name))).toEqual(
      new Set([
        'v1_games_source_exactly_one_ck',
        'v1_games_current_revision_fk',
        'v1_result_revisions_supersedes_fk',
        'v1_staff_field_fk',
        'v1_staff_scope_fixture_fk',
      ]),
    );
  });

  it('rejects a game with zero or two source adapters at the database boundary', async () => {
    expectRawFailure(await captureRawFailure(() => prisma.$executeRaw`
      INSERT INTO v1_games
        (id, source_type, state, version, last_sequence, competition_config_version_id, created_at, updated_at)
      VALUES
        (${gameSchemaFixture.gameId}, 'TEAM_MATCH', 'SCHEDULED', 0, 0, ${gameSchemaFixture.configId}, ${gameSchemaFixture.now}, ${gameSchemaFixture.now})
    `), '23514', 'v1_games_source_exactly_one_ck');

    expectRawFailure(await captureRawFailure(() => prisma.$executeRaw`
      INSERT INTO v1_games
        (id, source_type, team_match_id, tournament_fixture_id, state, version, last_sequence, competition_config_version_id, created_at, updated_at)
        VALUES
        (${gameSchemaFixture.secondGameId}, 'TEAM_MATCH', ${gameSchemaFixture.teamMatchId}, ${gameSchemaFixture.tournamentFixtureId}, 'SCHEDULED', 0, 0, ${gameSchemaFixture.configId}, ${gameSchemaFixture.now}, ${gameSchemaFixture.now})
    `), '23514', 'v1_games_source_exactly_one_ck');
  });

  it('keeps game source adapters nullable and unique for soft-deleted source records', async () => {
    await insertGame(gameSchemaFixture.gameId, 'TEAM_MATCH');
    await prisma.$executeRaw`UPDATE v1_team_matches SET deleted_at = ${gameSchemaFixture.now} WHERE id = ${gameSchemaFixture.teamMatchId}`;
    const survivingGame = await prisma.$queryRaw<Array<{ id: string }>>`SELECT id FROM v1_games WHERE id = ${gameSchemaFixture.gameId}`;
    expect(survivingGame).toEqual([{ id: gameSchemaFixture.gameId }]);
    await prisma.$executeRaw`UPDATE v1_team_matches SET deleted_at = NULL WHERE id = ${gameSchemaFixture.teamMatchId}`;
    await prisma.$executeRaw`DELETE FROM v1_games WHERE id = ${gameSchemaFixture.gameId}`;
    const sourceAdapterColumns = await prisma.$queryRaw<Array<{ column_name: string; is_nullable: string }>>`
      SELECT column_name, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'v1_games'
        AND column_name IN ('team_match_id', 'tournament_fixture_id')
      ORDER BY column_name
    `;
    expect(sourceAdapterColumns).toHaveLength(2);
    expect(sourceAdapterColumns.every((column) => column.is_nullable === 'YES')).toBe(true);

    const sourceConfigPins = await prisma.$queryRaw<Array<{ table_name: string; column_name: string; is_nullable: string }>>`
      SELECT table_name, column_name, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND column_name = 'competition_config_version_id'
        AND table_name IN ('v1_team_matches', 'v1_tournament_fixtures')
      ORDER BY table_name
    `;
    // Nullable, not 'NO', until the deferred contract-phase migration adds
    // SET NOT NULL to these two pre-existing tables — see
    // docs/ops/task9-competition-config-contract-phase.md
    // (fix/v1-expand-contract-split). v1_games.competition_config_version_id
    // itself (a brand-new column on a brand-new table) is unaffected and
    // stays NOT NULL; this assertion only ever covered the two source
    // tables' pinned copies.
    expect(sourceConfigPins).toEqual([
      { table_name: 'v1_team_matches', column_name: 'competition_config_version_id', is_nullable: 'YES' },
      { table_name: 'v1_tournament_fixtures', column_name: 'competition_config_version_id', is_nullable: 'YES' },
    ]);

    const uniqueIndexes = await prisma.$queryRaw<Array<{ indexname: string }>>`
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename IN ('v1_games', 'v1_game_events', 'v1_outbox_events')
        AND indexname IN (
          'v1_games_team_match_id_key', 'v1_games_tournament_fixture_id_key',
          'v1_game_events_game_client_event_key', 'v1_game_events_reverses_event_id_key',
          'v1_outbox_events_business_key_key'
        )
    `;
    expect(new Set(uniqueIndexes.map((index) => index.indexname))).toEqual(
      new Set([
        'v1_games_team_match_id_key',
        'v1_games_tournament_fixture_id_key',
        'v1_game_events_game_client_event_key',
        'v1_game_events_reverses_event_id_key',
        'v1_outbox_events_business_key_key',
      ]),
    );
  });

  it('rejects duplicate event identity, sequence, and self or cross-game reversal', async () => {
    await insertGame(gameSchemaFixture.gameId, 'TEAM_MATCH');
    await insertGame(gameSchemaFixture.secondGameId, 'TOURNAMENT_FIXTURE');
    const eventId = '00000000-0000-4000-8000-0000000009c1';
    await prisma.$executeRaw`
      INSERT INTO v1_game_events
        (id, game_id, sequence, client_event_id, payload_hash, type, period, clock_ms, occurred_at, actor_user_id, payload)
      VALUES (${eventId}, ${gameSchemaFixture.gameId}, 1, 'game-schema-event-1', 'hash-1', 'GOAL', 1, 1200, ${gameSchemaFixture.now}, ${gameSchemaFixture.userId}, '{}'::jsonb)
    `;
    expectRawFailure(await captureRawFailure(() => prisma.$executeRaw`
      INSERT INTO v1_game_events
        (id, game_id, sequence, client_event_id, payload_hash, type, period, clock_ms, occurred_at, actor_user_id, payload)
      VALUES ('00000000-0000-4000-8000-0000000009c2', ${gameSchemaFixture.gameId}, 1, 'game-schema-event-2', 'hash-2', 'CARD', 1, 1300, ${gameSchemaFixture.now}, ${gameSchemaFixture.userId}, '{}'::jsonb)
    `), '23505', 'Key (game_id, sequence)');
    expectRawFailure(await captureRawFailure(() => prisma.$executeRaw`
      INSERT INTO v1_game_events
        (id, game_id, sequence, client_event_id, payload_hash, type, period, clock_ms, occurred_at, actor_user_id, payload)
      VALUES ('00000000-0000-4000-8000-0000000009c3', ${gameSchemaFixture.gameId}, 2, 'game-schema-event-1', 'hash-3', 'CARD', 1, 1400, ${gameSchemaFixture.now}, ${gameSchemaFixture.userId}, '{}'::jsonb)
    `), '23505', 'Key (game_id, client_event_id)');
    expectRawFailure(await captureRawFailure(() => prisma.$executeRaw`
      INSERT INTO v1_game_events
        (id, game_id, sequence, client_event_id, payload_hash, type, period, clock_ms, occurred_at, actor_user_id, reverses_event_id, payload)
      VALUES ('00000000-0000-4000-8000-0000000009c4', ${gameSchemaFixture.gameId}, 3, 'game-schema-event-3', 'hash-4', 'CORRECTION', 1, 1500, ${gameSchemaFixture.now}, ${gameSchemaFixture.userId}, '00000000-0000-4000-8000-0000000009c4', '{}'::jsonb)
    `), '23514', 'reversal must target another event in the same game');
    expectRawFailure(await captureRawFailure(() => prisma.$executeRaw`
      INSERT INTO v1_game_events
        (id, game_id, sequence, client_event_id, payload_hash, type, period, clock_ms, occurred_at, actor_user_id, reverses_event_id, payload)
      VALUES ('00000000-0000-4000-8000-0000000009c5', ${gameSchemaFixture.gameId}, 4, 'game-schema-event-4', 'hash-5', 'CORRECTION', 1, 1600, ${gameSchemaFixture.now}, ${gameSchemaFixture.userId}, ${'00000000-0000-4000-8000-0000000009d1'}, '{}'::jsonb)
    `), '23514', 'reversal must target another event in the same game');
    await prisma.$executeRaw`DELETE FROM v1_game_events WHERE game_id IN (${gameSchemaFixture.gameId}, ${gameSchemaFixture.secondGameId})`;
    await prisma.$executeRaw`DELETE FROM v1_games WHERE id IN (${gameSchemaFixture.gameId}, ${gameSchemaFixture.secondGameId})`;
  });

  it('rejects cross-game revision pointers and freezes submitted and terminal revisions', async () => {
    await insertGame(gameSchemaFixture.gameId, 'TEAM_MATCH');
    await insertGame(gameSchemaFixture.secondGameId, 'TOURNAMENT_FIXTURE');
    await prisma.$executeRaw`
      INSERT INTO v1_game_result_revisions
        (id, game_id, revision, state, score, events_hash, created_by_actor_type, created_by_user_id, created_at, updated_at)
      VALUES (${gameSchemaFixture.revisionId}, ${gameSchemaFixture.gameId}, 1, 'DRAFT', '{"home":0,"away":0}'::jsonb, 'events-a', 'USER', ${gameSchemaFixture.userId}, ${gameSchemaFixture.now}, ${gameSchemaFixture.now})
    `;
    await prisma.$executeRaw`
      INSERT INTO v1_game_result_revisions
        (id, game_id, revision, state, score, events_hash, created_by_actor_type, created_by_user_id, created_at, updated_at)
      VALUES (${gameSchemaFixture.secondRevisionId}, ${gameSchemaFixture.secondGameId}, 1, 'DRAFT', '{"home":1,"away":0}'::jsonb, 'events-b', 'USER', ${gameSchemaFixture.userId}, ${gameSchemaFixture.now}, ${gameSchemaFixture.now})
    `;
    expectRawFailure(await captureRawFailure(() => prisma.$executeRaw`
      UPDATE v1_games SET current_official_revision_id = ${gameSchemaFixture.secondRevisionId} WHERE id = ${gameSchemaFixture.gameId}
    `), '23503', 'v1_games_current_revision_fk');
    expectRawFailure(await captureRawFailure(() => prisma.$executeRaw`
      INSERT INTO v1_game_result_revisions
        (id, game_id, revision, state, score, events_hash, created_by_actor_type, created_by_user_id, supersedes_id, created_at, updated_at)
      VALUES ('00000000-0000-4000-8000-0000000009c6', ${gameSchemaFixture.gameId}, 2, 'DRAFT', '{"home":0,"away":0}'::jsonb, 'events-c', 'USER', ${gameSchemaFixture.userId}, ${gameSchemaFixture.secondRevisionId}, ${gameSchemaFixture.now}, ${gameSchemaFixture.now})
    `), '23503', 'v1_result_revisions_supersedes_fk');
    await prisma.$executeRaw`UPDATE v1_game_result_revisions SET state = 'SUBMITTED', submitted_at = ${gameSchemaFixture.now} WHERE id = ${gameSchemaFixture.revisionId}`;
    expectRawFailure(await captureRawFailure(() => prisma.$executeRaw`UPDATE v1_game_result_revisions SET score = '{"home":9,"away":9}'::jsonb WHERE id = ${gameSchemaFixture.revisionId}`), '55000', 'submitted result content is frozen');
    await prisma.$executeRaw`UPDATE v1_game_result_revisions SET state = 'OFFICIAL', official_at = ${gameSchemaFixture.now} WHERE id = ${gameSchemaFixture.revisionId}`;
    expectRawFailure(await captureRawFailure(() => prisma.$executeRaw`DELETE FROM v1_game_result_revisions WHERE id = ${gameSchemaFixture.revisionId}`), '55000', 'terminal result revisions are immutable');
  });

  it('requires same-tournament field scope and allows parent-first scoped assignment in one transaction', async () => {
    const fieldId = gameSchemaFixture.fieldId;
    const secondFieldId = gameSchemaFixture.secondFieldId;
    await prisma.$executeRaw`
      INSERT INTO v1_tournament_fields (id, tournament_id, scope_key, name, created_at, updated_at)
      VALUES (${fieldId}, ${gameSchemaFixture.tournamentId}, 'court-a', 'Court A', ${gameSchemaFixture.now}, ${gameSchemaFixture.now}),
             (${secondFieldId}, ${gameSchemaFixture.secondTournamentId}, 'court-a', 'Court A', ${gameSchemaFixture.now}, ${gameSchemaFixture.now})
    `;
    expectRawFailure(await captureRawFailure(() => prisma.$executeRaw`
      INSERT INTO v1_tournament_staff_assignments
        (id, tournament_id, user_id, role, field_id, granted_by_user_id, created_at, updated_at)
      VALUES ('00000000-0000-4000-8000-0000000009c7', ${gameSchemaFixture.tournamentId}, ${gameSchemaFixture.userId}, 'FIELD_OPERATOR', ${secondFieldId}, ${gameSchemaFixture.userId}, ${gameSchemaFixture.now}, ${gameSchemaFixture.now})
    `), '23503', 'v1_staff_field_fk');
    expectRawFailure(await captureRawFailure(() => prisma.$executeRaw`
      INSERT INTO v1_tournament_staff_assignments
        (id, tournament_id, user_id, role, granted_by_user_id, created_at, updated_at)
      VALUES ('00000000-0000-4000-8000-0000000009c8', ${gameSchemaFixture.tournamentId}, ${gameSchemaFixture.userId}, 'FIELD_OPERATOR', ${gameSchemaFixture.userId}, ${gameSchemaFixture.now}, ${gameSchemaFixture.now})
    `), '23514', 'field operator requires a field or fixture scope');
    const assignmentId = '00000000-0000-4000-8000-0000000009c9';
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        INSERT INTO v1_tournament_staff_assignments
          (id, tournament_id, user_id, role, granted_by_user_id, created_at, updated_at)
        VALUES (${assignmentId}, ${gameSchemaFixture.tournamentId}, ${gameSchemaFixture.userId}, 'FIELD_OPERATOR', ${gameSchemaFixture.userId}, ${gameSchemaFixture.now}, ${gameSchemaFixture.now})
      `;
      await tx.$executeRaw`
        INSERT INTO v1_tournament_staff_fixture_scopes (id, assignment_id, fixture_id, created_at)
        VALUES ('00000000-0000-4000-8000-0000000009ca', ${assignmentId}, ${gameSchemaFixture.tournamentFixtureId}, ${gameSchemaFixture.now})
      `;
    });
    expectRawFailure(await captureRawFailure(() => prisma.$executeRaw`
      UPDATE v1_tournament_staff_fixture_scopes
      SET fixture_id = ${gameSchemaFixture.secondTournamentFixtureId}
      WHERE assignment_id = ${assignmentId}
    `), '23514', 'staff fixture scope must stay within tournament');
    expectRawFailure(await captureRawFailure(() => prisma.$executeRaw`
      DELETE FROM v1_tournament_staff_fixture_scopes WHERE assignment_id = ${assignmentId}
    `), '23514', 'field operator requires a field or fixture scope');
    await prisma.$executeRaw`DELETE FROM v1_tournament_staff_assignments WHERE id = ${assignmentId}`;
    await prisma.$executeRaw`DELETE FROM v1_tournament_fields WHERE id IN (${fieldId}, ${secondFieldId})`;
  });

  it('refuses source snapshot mutation before migration verification', () => {
    const schemaPath = resolve(__dirname, '../../prisma/schema.prisma');
    const migrationPath = resolve(__dirname, '../../prisma/migrations/20260729000100_v1_game_operations/migration.sql');
    const snapshotDir = mkdtempSync(join(tmpdir(), 'teameet-game-schema-source-'));
    const snapshotSchema = join(snapshotDir, 'schema.prisma');
    const snapshotMigration = join(snapshotDir, 'migration.sql');
    try {
      copyFileSync(schemaPath, snapshotSchema);
      copyFileSync(migrationPath, snapshotMigration);
      expect(() => verifyGameSchemaSourceSnapshot(gameSchemaSourceManifest, { schema: snapshotSchema, migration: snapshotMigration })).not.toThrow();
      writeFileSync(snapshotMigration, `${readFileSync(snapshotMigration, 'utf8')}\n-- source snapshot mutation\n`);
      expect(() => verifyGameSchemaSourceSnapshot(gameSchemaSourceManifest, { schema: snapshotSchema, migration: snapshotMigration })).toThrow('SOURCE_SNAPSHOT_DRIFT');
    } finally {
      rmSync(snapshotDir, { recursive: true, force: true });
    }
  });

  it('rehearses expand-contract rollback while preserving committed data', async () => {
    const flagId = '00000000-0000-4000-8000-0000000009e2';
    await prisma.$executeRaw`
      INSERT INTO v1_game_operation_flags (id, key, value, owner_actor, updated_at)
      VALUES (${flagId}, 'GAME_READ', 'stable', 'platform_ops', ${gameSchemaFixture.now})
    `;
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`ALTER TABLE v1_game_operation_flags ADD COLUMN rollback_probe TEXT`;
      await tx.$executeRaw`UPDATE v1_game_operation_flags SET rollback_probe = 'temporary' WHERE id = ${flagId}`;
      await tx.$executeRaw`ALTER TABLE v1_game_operation_flags DROP COLUMN rollback_probe`;
    });
    const sentinel = await prisma.$queryRaw<Array<{ value: string }>>`
      SELECT value FROM v1_game_operation_flags WHERE id = ${flagId}
    `;
    expect(sentinel).toEqual([{ value: 'stable' }]);
    await prisma.$executeRaw`DELETE FROM v1_game_operation_flags WHERE id = ${flagId}`;
  });

  it('enforces identity attestation actors, versioned config, and field/outbox CAS', async () => {
    const identityGameId = gameSchemaFixture.secondGameId;
    await prisma.$executeRaw`
      INSERT INTO v1_game_sides (id, game_id, side_key, display_name_snapshot, created_at, updated_at)
      VALUES (${gameSchemaFixture.sideHomeId}, ${identityGameId}, 'HOME', 'Home', ${gameSchemaFixture.now}, ${gameSchemaFixture.now})
    `;
    await prisma.$executeRaw`
      INSERT INTO v1_game_lineups (id, game_id, side_id, revision, created_at, updated_at)
      VALUES (${gameSchemaFixture.lineupId}, ${identityGameId}, ${gameSchemaFixture.sideHomeId}, 1, ${gameSchemaFixture.now}, ${gameSchemaFixture.now})
    `;
    await prisma.$executeRaw`
      INSERT INTO v1_game_participants (id, game_id, side_id, lineup_id, display_name_snapshot, created_at, updated_at)
      VALUES (${gameSchemaFixture.participantId}, ${identityGameId}, ${gameSchemaFixture.sideHomeId}, ${gameSchemaFixture.lineupId}, 'Player', ${gameSchemaFixture.now}, ${gameSchemaFixture.now})
    `;
    await prisma.$executeRaw`
      INSERT INTO v1_participant_identity_link_events
        (id, participant_id, link_id, event_version, request_id, action, user_id, actor_type, actor_user_id, created_at)
      VALUES ('00000000-0000-4000-8000-0000000009cb', ${gameSchemaFixture.participantId}, ${gameSchemaFixture.linkId}, 1, ${gameSchemaFixture.requestId}, 'REQUESTED', ${gameSchemaFixture.userId}, 'USER', ${gameSchemaFixture.userId}, ${gameSchemaFixture.now})
    `;
    expectRawFailure(await captureRawFailure(() => prisma.$executeRaw`
      INSERT INTO v1_participant_identity_link_events
        (id, participant_id, link_id, event_version, request_id, action, user_id, actor_type, actor_user_id, created_at)
      VALUES ('00000000-0000-4000-8000-0000000009cc', ${gameSchemaFixture.participantId}, '00000000-0000-4000-8000-0000000009cd', 2, ${gameSchemaFixture.requestId}, 'ATTESTED', ${gameSchemaFixture.userId}, 'USER', ${gameSchemaFixture.userId}, ${gameSchemaFixture.now})
    `), '23514', 'attestation requires a distinct pending requestor');
    await prisma.$executeRaw`
      INSERT INTO v1_participant_identity_link_events
        (id, participant_id, link_id, event_version, request_id, action, user_id, actor_type, actor_user_id, created_at)
      VALUES ('00000000-0000-4000-8000-0000000009ce', ${gameSchemaFixture.participantId}, ${gameSchemaFixture.linkId}, 2, ${gameSchemaFixture.requestId}, 'ATTESTED', ${gameSchemaFixture.secondUserId}, 'USER', ${gameSchemaFixture.secondUserId}, ${gameSchemaFixture.now})
    `;
    expectRawFailure(await captureRawFailure(() => prisma.$executeRaw`
      INSERT INTO v1_participant_identity_link_events
        (id, participant_id, link_id, event_version, request_id, action, user_id, actor_type, actor_user_id, system_actor, created_at)
      VALUES ('00000000-0000-4000-8000-0000000009cf', ${gameSchemaFixture.participantId}, ${gameSchemaFixture.linkId}, 3, ${gameSchemaFixture.requestId}, 'EXPIRED', ${gameSchemaFixture.userId}, 'SYSTEM', NULL, 'IDENTITY_LINK_EXPIRY', ${gameSchemaFixture.now})
    `), '40001', 'identity terminal action already committed');
    expectRawFailure(await captureRawFailure(() => prisma.$executeRaw`
      INSERT INTO v1_participant_identity_link_events
        (id, participant_id, link_id, event_version, request_id, action, user_id, actor_type, system_actor, created_at)
      VALUES ('00000000-0000-4000-8000-0000000009d0', ${gameSchemaFixture.participantId}, '00000000-0000-4000-8000-0000000009d0', 4, 'game-schema-expiry', 'EXPIRED', ${gameSchemaFixture.userId}, 'SYSTEM', 'WRONG_ACTOR', ${gameSchemaFixture.now})
    `), '23514', 'invalid identity expiry actor');
    expectRawFailure(await captureRawFailure(() => prisma.$executeRaw`
      INSERT INTO v1_competition_config_versions
        (id, sport_code, name, version, status, periods, events, lineup, result, tie_break, visibility, content_hash, created_at, updated_at)
      VALUES ('00000000-0000-4000-8000-0000000009d2', 'FOOTBALL', 'unversioned', NULL, 'ACTIVE', '[{"code":"FIRST_HALF","label":"전반","durationMinutes":45,"extraTime":false},{"code":"SECOND_HALF","label":"후반","durationMinutes":45,"extraTime":false}]'::jsonb, '["GOAL","OWN_GOAL","YELLOW_CARD","RED_CARD","SUBSTITUTION"]'::jsonb, '{"minPlayers":7,"maxPlayers":11,"substitutions":"limited","maxSubstitutions":5}'::jsonb, '{"tournamentScorerPolicy":"required","teamMatchScorerPolicy":"optional_with_warning","mvpMin":0,"mvpMax":1}'::jsonb, '{"points":{"win":3,"draw":1,"loss":0},"order":["points","head_to_head","goal_difference","goals_for","fair_play","seeded_draw"],"seededDraw":"sha256-v1"}'::jsonb, '{"default":"live","allowed":["live","official"]}'::jsonb, 'unversioned', ${gameSchemaFixture.now}, ${gameSchemaFixture.now})
    `), '23502', 'Failing row contains');
    await prisma.$executeRaw`
      INSERT INTO v1_outbox_events (id, business_key, aggregate_type, aggregate_id, type, payload, updated_at)
      VALUES ('00000000-0000-4000-8000-0000000009d3', 'game-schema-outbox', 'GAME', ${identityGameId}, 'TEST', '{}'::jsonb, ${gameSchemaFixture.now})
    `;
    expectRawFailure(await captureRawFailure(() => prisma.$executeRaw`UPDATE v1_outbox_events SET status = 'PROCESSING' WHERE business_key = 'game-schema-outbox'`), '40001', 'version compare-and-swap required');
    await prisma.$executeRaw`UPDATE v1_outbox_events SET status = 'PROCESSING', version = 1 WHERE business_key = 'game-schema-outbox'`;
    await prisma.$executeRaw`DELETE FROM v1_outbox_events WHERE business_key = 'game-schema-outbox'`;
    await prisma.$executeRaw`DELETE FROM v1_participant_identity_link_events WHERE participant_id = ${gameSchemaFixture.participantId}`;
    await prisma.$executeRaw`DELETE FROM v1_game_participants WHERE id = ${gameSchemaFixture.participantId}`;
    await prisma.$executeRaw`DELETE FROM v1_game_lineups WHERE id = ${gameSchemaFixture.lineupId}`;
    await prisma.$executeRaw`DELETE FROM v1_game_sides WHERE id = ${gameSchemaFixture.sideHomeId}`;
    await prisma.$executeRaw`DELETE FROM v1_game_result_revisions WHERE id = ${gameSchemaFixture.secondRevisionId}`;
    await prisma.$executeRaw`DELETE FROM v1_games WHERE id = ${identityGameId}`;
  });
});
