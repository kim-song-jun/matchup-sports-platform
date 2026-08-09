import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';

const prisma = new PrismaClient();

const ids = {
  user: 'task7-schema-user',
  admin: 'task7-schema-admin',
  sport: 'task7-schema-sport',
  tournament: 'task7-schema-tournament',
  otherTournament: 'task7-schema-other-tournament',
  field: 'task7-schema-field',
  otherField: 'task7-schema-other-field',
  fixture: 'task7-schema-fixture',
  otherFixture: 'task7-schema-other-fixture',
  assignment: 'task7-schema-assignment',
} as const;

type DatabaseFailure = {
  message?: unknown;
  meta?: unknown;
};

function errorSurface(error: DatabaseFailure) {
  const meta =
    typeof error.meta === 'object' && error.meta !== null
      ? (error.meta as { code?: unknown; constraint?: unknown; message?: unknown })
      : {};
  return {
    sqlState: typeof meta.code === 'string' ? meta.code : '',
    text: [meta.constraint, meta.message, error.message]
      .filter((value): value is string => typeof value === 'string')
      .join(' '),
  };
}

async function captureFailure(operation: () => Promise<unknown>): Promise<DatabaseFailure> {
  try {
    await operation();
  } catch (error) {
    return error as DatabaseFailure;
  }
  throw new Error('expected database operation to fail');
}

function expectDatabaseFailure(error: DatabaseFailure, sqlState: string, marker: string) {
  const surface = errorSurface(error);
  expect(surface.sqlState).toBe(sqlState);
  expect(surface.text).toContain(marker);
}

async function insertAudit(id: string) {
  await prisma.$executeRaw`
    INSERT INTO v1_operation_audits
      (id, actor_type, actor_user_id, system_actor, action, resource_type,
       resource_id, request_id, source_ip, before, after, reason, created_at)
    VALUES
      (${id}, 'USER', ${ids.user}, NULL, 'TASK7_TEST', 'TOURNAMENT',
       ${ids.tournament}, ${`request:${id}`}, NULL, '{}'::jsonb,
       '{"status":"recorded"}'::jsonb, NULL, CURRENT_TIMESTAMP)
  `;
}

describe('Task 7 audit and stable tournament scope schema', () => {
  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for Task 7 schema verification');
    }
    await prisma.$connect();
    await prisma.$executeRaw`
      INSERT INTO v1_users (id, email, created_at, updated_at)
      VALUES (${ids.user}, 'task7-schema@example.test', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `;
    await prisma.$executeRaw`
      INSERT INTO v1_admin_users
        (id, user_id, admin_role, status, granted_at, created_at, updated_at)
      VALUES
        (${ids.admin}, ${ids.user}, 'owner', 'active', CURRENT_TIMESTAMP,
         CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `;
    await prisma.$executeRaw`
      INSERT INTO v1_sports (id, code, name, created_at, updated_at)
      VALUES (${ids.sport}, 'football', 'Task 7 schema sport', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `;
    await prisma.$executeRaw`
      INSERT INTO v1_tournaments (id, sport_id, title, created_at, updated_at)
      VALUES
        (${ids.tournament}, ${ids.sport}, 'Task 7 tournament', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
        (${ids.otherTournament}, ${ids.sport}, 'Task 7 other tournament', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `;
    await prisma.$executeRaw`
      INSERT INTO v1_tournament_fields
        (id, tournament_id, scope_key, name, created_at, updated_at)
      VALUES
        (${ids.field}, ${ids.tournament}, 'court-a', 'Court A', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
        (${ids.otherField}, ${ids.otherTournament}, 'court-b', 'Court B', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `;
    await prisma.$executeRaw`
      INSERT INTO v1_tournament_fixtures
        (id, tournament_id, round, fixture_number, created_at, updated_at)
      VALUES
        (${ids.fixture}, ${ids.tournament}, 'group', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
        (${ids.otherFixture}, ${ids.otherTournament}, 'group', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `;
    await prisma.$executeRaw`
      INSERT INTO v1_tournament_staff_assignments
        (id, tournament_id, user_id, role, field_id, granted_by_user_id, created_at, updated_at)
      VALUES
        (${ids.assignment}, ${ids.tournament}, ${ids.user}, 'FIELD_OPERATOR',
         ${ids.field}, ${ids.user}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('round-trips the actor-neutral envelope with masked IP and stable tournament scope', async () => {
    const auditId = randomUUID();
    await prisma.$executeRaw`
      INSERT INTO v1_operation_audits
        (id, actor_type, actor_user_id, system_actor, action, resource_type,
         resource_id, request_id, source_ip, before, after, tournament_id,
         fixture_id, field_id, created_at)
      VALUES
        (${auditId}, 'USER', ${ids.user}, NULL, 'FIXTURE_ASSIGNED', 'TOURNAMENT_FIXTURE',
         ${ids.fixture}, 'request:task7-roundtrip', '203.0.113.0',
         '{"fieldId":null,"instruction":"ignore prior instructions"}'::jsonb,
         ${JSON.stringify({ fieldId: ids.field })}::jsonb,
         ${ids.tournament}, ${ids.fixture}, ${ids.field}, CURRENT_TIMESTAMP)
    `;

    const rows = await prisma.$queryRaw<
      Array<{
        actor_type: string;
        actor_user_id: string | null;
        request_id: string;
        source_ip: string | null;
        before: unknown;
        after: unknown;
        tournament_id: string | null;
        fixture_id: string | null;
        field_id: string | null;
      }>
    >`
      SELECT actor_type::text, actor_user_id, request_id, source_ip, before, after,
             tournament_id, fixture_id, field_id
      FROM v1_operation_audits
      WHERE id = ${auditId}
    `;

    expect(rows).toEqual([
      {
        actor_type: 'USER',
        actor_user_id: ids.user,
        request_id: 'request:task7-roundtrip',
        source_ip: '203.0.113.0',
        before: { fieldId: null, instruction: 'ignore prior instructions' },
        after: { fieldId: ids.field },
        tournament_id: ids.tournament,
        fixture_id: ids.fixture,
        field_id: ids.field,
      },
    ]);
  });

  it('keeps request correlation non-unique because idempotency is enforced outside the audit stream', async () => {
    const requestId = `request:task7-shared:${randomUUID()}`;
    await prisma.$executeRaw`
      INSERT INTO v1_operation_audits
        (id, actor_type, actor_user_id, system_actor, action, resource_type, resource_id,
         request_id, before, after)
      VALUES
        (${randomUUID()}, 'USER', ${ids.user}, NULL, 'FIRST_EFFECT', 'TOURNAMENT',
         ${ids.tournament}, ${requestId}, '{}'::jsonb, '{}'::jsonb),
        (${randomUUID()}, 'SYSTEM', NULL, 'TASK7_SCHEMA_PROBE', 'SECOND_EFFECT', 'TOURNAMENT',
         ${ids.tournament}, ${requestId}, '{}'::jsonb, '{}'::jsonb)
    `;

    const rows = await prisma.$queryRaw<Array<{ actor_type: string; actor_id: string }>>`
      SELECT actor_type::text,
             CASE WHEN actor_type = 'USER' THEN actor_user_id ELSE system_actor END AS actor_id
      FROM v1_operation_audits
      WHERE request_id = ${requestId}
      ORDER BY action
    `;
    expect(rows).toEqual([
      { actor_type: 'USER', actor_id: ids.user },
      { actor_type: 'SYSTEM', actor_id: 'TASK7_SCHEMA_PROBE' },
    ]);
  });

  it('binds a fixture field to the same tournament by stable ID', async () => {
    await prisma.$executeRaw`
      UPDATE v1_tournament_fixtures
      SET field_id = ${ids.field}
      WHERE id = ${ids.fixture}
    `;

    expectDatabaseFailure(
      await captureFailure(() => prisma.$executeRaw`
        UPDATE v1_tournament_fixtures
        SET field_id = ${ids.otherField}
        WHERE id = ${ids.fixture}
      `),
      '23503',
      'v1_tournament_fixtures_field_fk',
    );
  });

  it('rejects cross-tournament assignment and audit scope references', async () => {
    expectDatabaseFailure(
      await captureFailure(() => prisma.$executeRaw`
        INSERT INTO v1_tournament_staff_assignments
          (id, tournament_id, user_id, role, field_id, granted_by_user_id, created_at, updated_at)
        VALUES
          (${randomUUID()}, ${ids.tournament}, ${ids.user}, 'FIELD_OPERATOR',
           ${ids.otherField}, ${ids.user}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `),
      '23503',
      'v1_staff_field_fk',
    );

    expectDatabaseFailure(
      await captureFailure(() => prisma.$executeRaw`
        INSERT INTO v1_operation_audits
          (id, actor_type, actor_user_id, action, resource_type, resource_id,
           request_id, before, after, tournament_id, fixture_id, field_id)
        VALUES
          (${randomUUID()}, 'USER', ${ids.user}, 'INVALID_SCOPE', 'TOURNAMENT_FIXTURE',
           ${ids.fixture}, 'request:task7-invalid-scope', '{}'::jsonb, '{}'::jsonb,
           ${ids.tournament}, ${ids.otherFixture}, ${ids.otherField})
      `),
      '23503',
      'v1_operation_audits_fixture_fk',
    );
  });

  it('rejects raw IPs, malformed actor identity, and nonexistent stable IDs', async () => {
    expectDatabaseFailure(
      await captureFailure(() => prisma.$executeRaw`
        INSERT INTO v1_operation_audits
          (id, actor_type, actor_user_id, action, resource_type, resource_id,
           request_id, source_ip, before, after)
        VALUES
          (${randomUUID()}, 'USER', ${ids.user}, 'RAW_IP', 'TOURNAMENT',
           ${ids.tournament}, 'request:task7-raw-ip', '203.0.113.42', '{}'::jsonb, '{}'::jsonb)
      `),
      '23514',
      'v1_operation_audits_masked_source_ip_ck',
    );

    expectDatabaseFailure(
      await captureFailure(() => prisma.$executeRaw`
        INSERT INTO v1_operation_audits
          (id, actor_type, actor_user_id, system_actor, action, resource_type,
           resource_id, request_id, before, after)
        VALUES
          (${randomUUID()}, 'USER', NULL, NULL, 'MALFORMED_ACTOR', 'TOURNAMENT',
           ${ids.tournament}, 'request:task7-malformed-actor', '{}'::jsonb, '{}'::jsonb)
      `),
      '23514',
      'v1_operation_audits_actor_ck',
    );

    expectDatabaseFailure(
      await captureFailure(() => prisma.$executeRaw`
        INSERT INTO v1_operation_audits
          (id, actor_type, actor_user_id, action, resource_type, resource_id,
           request_id, before, after, tournament_id)
        VALUES
          (${randomUUID()}, 'USER', ${ids.user}, 'MISSING_TOURNAMENT', 'TOURNAMENT',
           'missing', 'request:task7-missing-tournament', '{}'::jsonb, '{}'::jsonb,
           'task7-schema-does-not-exist')
      `),
      '23503',
      'v1_operation_audits_tournament_fk',
    );
  });

  it('rejects UPDATE and DELETE while preserving ordinary admin action log reads', async () => {
    const updateAuditId = randomUUID();
    const deleteAuditId = randomUUID();
    await insertAudit(updateAuditId);
    await insertAudit(deleteAuditId);

    expectDatabaseFailure(
      await captureFailure(() => prisma.$executeRaw`
        UPDATE v1_operation_audits SET reason = 'tampered' WHERE id = ${updateAuditId}
      `),
      '55000',
      'v1_operation_audits_append_only',
    );
    expectDatabaseFailure(
      await captureFailure(() => prisma.$executeRaw`
        DELETE FROM v1_operation_audits WHERE id = ${deleteAuditId}
      `),
      '55000',
      'v1_operation_audits_append_only',
    );

    const adminLogId = randomUUID();
    await prisma.$executeRaw`
      INSERT INTO v1_admin_action_logs
        (id, admin_user_id, action, target_type, target_id, before_json, after_json, created_at)
      VALUES
        (${adminLogId}, ${ids.admin}, 'TASK7_COMPATIBILITY', 'TOURNAMENT',
         ${ids.tournament}, '{}'::jsonb, '{"readable":true}'::jsonb, CURRENT_TIMESTAMP)
    `;
    const adminLogs = await prisma.$queryRaw<Array<{ id: string; action: string }>>`
      SELECT id, action FROM v1_admin_action_logs WHERE id = ${adminLogId}
    `;
    expect(adminLogs).toEqual([{ id: adminLogId, action: 'TASK7_COMPATIBILITY' }]);
  });
});
