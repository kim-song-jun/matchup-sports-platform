import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const guardrailSource = join(repositoryRoot, 'scripts/qa/check-v1-db-guardrails.mjs');
const schemaPath = 'apps/v1_api/prisma/schema.prisma';
const guardrailDiagnostic = 'apps/v1_api/prisma/schema.prisma changed without a matching migration';

function sha256(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

function run(command, args, cwd) {
  return execFileSync(command, args, { cwd, encoding: 'utf8' }).trim();
}

function writeFixtureFile(root, relativePath, contents) {
  const file = join(root, relativePath);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, contents);
}

function createFixture({ malformedConstraint = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'v1-db-guardrails-'));
  copyFileSync(guardrailSource, join(root, 'check-v1-db-guardrails.mjs'));
  writeFixtureFile(
    root,
    'package.json',
    JSON.stringify({ private: true, scripts: { 'qa:v1-db-guardrails': 'node check-v1-db-guardrails.mjs' } }, null, 2),
  );
  writeFixtureFile(root, '.github/workflows/deploy.yml', 'name: fixture-deploy\n');
  writeFixtureFile(root, 'deploy/restart-containers.sh', '#!/bin/sh\n');
  writeFixtureFile(root, 'deploy/setup-ec2.sh', '#!/bin/sh\n');
  writeFixtureFile(
    root,
    schemaPath,
    `model V1Tournament {
  id    String @id
  edges V1TournamentFixtureAdvancementEdge[]

  @@map("v1_tournaments")
}

model V1TournamentFixtureAdvancementEdge {
  id           String       @id
  tournamentId String       @map("tournament_id")
  tournament   V1Tournament @relation(fields: [tournamentId], references: [id], onDelete: Cascade)

  @@map("v1_fixture_advancement_edges")
}
`,
  );
  writeFixtureFile(
    root,
    'apps/v1_api/prisma/migrations/20260716090000_v1_user_profile_real_name/migration.sql',
    `SET "real_name" = NULLIF(BTRIM("display_name"), '')
AND NULLIF(BTRIM("display_name"), '') IS NOT NULL
`,
  );
  writeFixtureFile(
    root,
    'apps/v1_api/prisma/migrations/20260716100000_v1_team_chat_membership_backfill/migration.sql',
    `UPDATE "v1_chat_rooms" AS room
COALESCE(membership."joined_at", membership."created_at")
ON CONFLICT ("chat_room_id", "user_id") DO UPDATE
"left_at" = NULL
"v1_chat_room_participants"."visible_from_at"
EXCLUDED."visible_from_at"
`,
  );
  writeFixtureFile(
    root,
    'apps/v1_api/prisma/migrations/20260802000100_v1_game_projections_escalations/migration.sql',
    `CREATE TABLE "v1_fixture_advancement_edges" (
  "id" TEXT PRIMARY KEY,
  "tournament_id" TEXT NOT NULL,
  CONSTRAINT "v1_fixture_advancement_tournament_fk" ${malformedConstraint ? 'FOREIGN' : 'FOREIGN KEY'} ("tournament_id") REFERENCES "v1_tournaments"("id") ON DELETE CASCADE
);
`,
  );

  run('git', ['init', '--quiet'], root);
  run('git', ['config', 'user.email', 'guardrail-fixture@example.test'], root);
  run('git', ['config', 'user.name', 'guardrail-fixture'], root);
  run('git', ['add', '.'], root);
  run('git', ['commit', '--quiet', '-m', 'fixture base'], root);
  return root;
}

function replaceSchema(root, replacement) {
  const schema = readFileSync(join(root, schemaPath), 'utf8');
  writeFileSync(join(root, schemaPath), schema.replace('  tournament   V1Tournament @relation(fields: [tournamentId], references: [id], onDelete: Cascade)', replacement));
}

function commitScenario(root, name) {
  const base = run('git', ['rev-parse', 'HEAD'], root);
  run('git', ['add', '.'], root);
  run('git', ['commit', '--quiet', '-m', name], root);
  assert.equal(run('git', ['status', '--porcelain'], root), '', 'fixture must be clean before the production CLI runs');
  return base;
}

function runProductionGuardrail(root, base) {
  assert.equal(sha256(guardrailSource), sha256(join(root, 'check-v1-db-guardrails.mjs')), 'fixture must run the current guardrail source');
  return spawnSync('pnpm', ['qa:v1-db-guardrails'], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, GITHUB_EVENT_BEFORE: base, GITHUB_SHA: 'HEAD' },
  });
}

function expectExit(result, status, context) {
  assert.equal(result.error, undefined, `${context}: pnpm process must launch`);
  assert.equal(result.status, status, `${context}: native CLI exit status`);
}

function withFixture(options, exercise) {
  const root = createFixture(options);
  try {
    exercise(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

withFixture({}, (root) => {
  replaceSchema(
    root,
    '  tournament   V1Tournament @relation(fields: [tournamentId], references: [id], onDelete: Cascade, map: "v1_fixture_advancement_tournament_fk")',
  );
  const result = runProductionGuardrail(root, commitScenario(root, 'add exact existing FK map'));
  expectExit(result, 0, 'exact existing-constraint relation map alignment');
});

withFixture({}, (root) => {
  replaceSchema(
    root,
    '  tournament   V1Tournament @relation(fields: [tournamentId], references: [id], onDelete: Cascade, map: "v1_fixture_advancement_missing_fk")',
  );
  const result = runProductionGuardrail(root, commitScenario(root, 'add absent FK map'));
  expectExit(result, 1, 'absent relation map constraint');
  assert.match(`${result.stdout}\n${result.stderr}`, new RegExp(guardrailDiagnostic));
});

withFixture({}, (root) => {
  const schema = readFileSync(join(root, schemaPath), 'utf8');
  writeFileSync(join(root, schemaPath), schema.replace('  id           String       @id', '  id           String       @id\n  label        String?'));
  const result = runProductionGuardrail(root, commitScenario(root, 'add structural schema field'));
  expectExit(result, 1, 'structural schema-only change');
  assert.match(`${result.stdout}\n${result.stderr}`, new RegExp(guardrailDiagnostic));
});

withFixture({}, (root) => {
  const schema = readFileSync(join(root, schemaPath), 'utf8');
  writeFileSync(
    join(root, schemaPath),
    `${schema}\nmodel V1FixtureAuditMarker {\n  id String @id\n}\n`,
  );
  const result = runProductionGuardrail(root, commitScenario(root, 'add schema model'));
  expectExit(result, 1, 'model schema-only change');
  assert.match(`${result.stdout}\n${result.stderr}`, new RegExp(guardrailDiagnostic));
});

withFixture({}, (root) => {
  const schema = readFileSync(join(root, schemaPath), 'utf8');
  writeFileSync(
    join(root, schemaPath),
    `${schema}\nenum V1FixtureAuditState {\n  pending\n}\n`,
  );
  const result = runProductionGuardrail(root, commitScenario(root, 'add schema enum'));
  expectExit(result, 1, 'enum schema-only change');
  assert.match(`${result.stdout}\n${result.stderr}`, new RegExp(guardrailDiagnostic));
});

withFixture({}, (root) => {
  const schema = readFileSync(join(root, schemaPath), 'utf8');
  writeFileSync(
    join(root, schemaPath),
    schema.replace('  @@map("v1_fixture_advancement_edges")', '  @@index([tournamentId])\n\n  @@map("v1_fixture_advancement_edges")'),
  );
  const result = runProductionGuardrail(root, commitScenario(root, 'add schema index'));
  expectExit(result, 1, 'index schema-only change');
  assert.match(`${result.stdout}\n${result.stderr}`, new RegExp(guardrailDiagnostic));
});

withFixture({}, (root) => {
  replaceSchema(
    root,
    '  tournament   V1Tournament @relation(fields: [tournamentId], references: [id], onDelete: Restrict)',
  );
  const result = runProductionGuardrail(root, commitScenario(root, 'change relation delete action'));
  expectExit(result, 1, 'substantive relation schema-only change');
  assert.match(`${result.stdout}\n${result.stderr}`, new RegExp(guardrailDiagnostic));
});

withFixture({}, (root) => {
  const schema = readFileSync(join(root, schemaPath), 'utf8');
  writeFileSync(join(root, schemaPath), schema.replace('  id           String       @id', '  id           String       @id\n  label        String?'));
  writeFixtureFile(
    root,
    'apps/v1_api/prisma/migrations/20260803000100_add_fixture_label/migration.sql',
    'ALTER TABLE "v1_fixture_advancement_edges" ADD COLUMN "label" TEXT;\n',
  );
  const result = runProductionGuardrail(root, commitScenario(root, 'schema plus migration'));
  expectExit(result, 0, 'normal schema plus migration change');
});

withFixture({ malformedConstraint: true }, (root) => {
  replaceSchema(
    root,
    '  tournament   V1Tournament @relation(fields: [tournamentId], references: [id], onDelete: Cascade, map: "v1_fixture_advancement_tournament_fk")',
  );
  const result = runProductionGuardrail(root, commitScenario(root, 'add map against malformed constraint SQL'));
  expectExit(result, 1, 'malformed constraint SQL');
  assert.match(`${result.stdout}\n${result.stderr}`, new RegExp(guardrailDiagnostic));
});

console.log('[check-v1-db-guardrails.test] passed');
