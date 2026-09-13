#!/usr/bin/env node
// Builds every file the Task 168 Stage B runner (deploy/task168-stage-b-migrate.sh)
// needs to accept a run: the source tree (real repo migrations + real M11),
// the Stage B manifest, the Stage A predecessor transition chain, and the
// final-image preflight receipt/report. All hashes are computed from the
// real files being written — nothing here is asserted by hand.
//
// This is test-fixture generation only (scripts/qa/harness/**, owned by this
// delegation); it does not touch scripts/release/create-alpha-release-manifest.sh
// or task168-final-image-preflight.sh, which produce these same shapes for
// real StageB runs and are owned by a different track.
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, statSync, readFileSync, writeFileSync, copyFileSync, cpSync } from 'node:fs';
import path from 'node:path';

function sha256File(p) { return createHash('sha256').update(readFileSync(p)).digest('hex'); }
function sha256Str(s) { return createHash('sha256').update(s).digest('hex'); }
function writeJson(p, obj) { mkdirSync(path.dirname(p), { recursive: true }); writeFileSync(p, JSON.stringify(obj, null, 2) + '\n'); }

const env = process.env;
const REPO_MIGRATIONS_DIR = env.REPO_MIGRATIONS_DIR; // real apps/v1_api/prisma/migrations
const M11_DIR = env.M11_DIR; // candidate M11 migration directory
const FINAL_SCHEMA_FILE = env.FINAL_SCHEMA_FILE; // candidate final-schema/schema.prisma (sha e44990c6...)
const WORK_DIR = env.WORK_DIR; // per-scenario scratch root
const RELEASE_SHA = env.RELEASE_SHA;
const PREDECESSOR_SHA = env.PREDECESSOR_SHA;
const DB_USER = env.DB_USER;
const DB_NAME = env.DB_NAME;
const API_IMAGE = env.API_IMAGE; // real, docker-resolvable, digest-pinned final image ref
const PREDECESSOR_API_IMAGE = env.PREDECESSOR_API_IMAGE; // plain tag, matches the currently-running writer
const RESOLVED_ATTEMPTS_SHA = env.RESOLVED_ATTEMPTS_SHA || sha256Str(''); // empty-DB default (no resolved attempts)

for (const [name, v] of Object.entries({ REPO_MIGRATIONS_DIR, M11_DIR, FINAL_SCHEMA_FILE, WORK_DIR, RELEASE_SHA, PREDECESSOR_SHA, DB_USER, DB_NAME, API_IMAGE, PREDECESSOR_API_IMAGE })) {
  if (!v) { console.error(`missing required env: ${name}`); process.exit(1); }
}

const TASK_SCHEMA_SHA = 'e44990c6d17e612b9d93e4ce41a6c5adaacb813ab3c67f75fd4f05b185736f46';
const STAGE_A_SCHEMA_SHA = '91222f64cf30dd15169a17cf5eb096c446861c5f578a31c51d44c92b3a321f3f';
const M11_NAME = '20260911090000_retire_tournament_fixture_tables';
const M11_SHA = '08eac7347cbb10fcc4ef87d31d63bd9516d5bfda281dcf5730c4f0a1985d9323';
const M1 = ['20260908130000_v1_team_match_tournament_expand','20260908150000_v1_operation_audit_team_match_expand','20260908160000_v1_official_fact_team_match_scope','20260908170000_v1_lineup_invalidation','20260908180000_v1_staff_scope_team_match','20260909000000_v1_tournament_result_lineage','20260909110000_v1_operation_audit_canonical_binding'];
const M8 = '20260910010000_v1_official_fact_source_history';
const M9 = '20260910020000_v1_canonical_game_db_guards';
const M10 = '20260910160000_v1_outbox_cutover_claim_gate';
const ALL_TASK_MIGRATIONS = [...M1, M8, M9, M10, M11_NAME];

// 1. Build SOURCE_DIR: real full migrations history + candidate M11 + final schema.
const sourceDir = path.join(WORK_DIR, 'source');
const migrationsOut = path.join(sourceDir, 'apps/v1_api/prisma/migrations');
mkdirSync(migrationsOut, { recursive: true });
cpSync(REPO_MIGRATIONS_DIR, migrationsOut, { recursive: true });
cpSync(M11_DIR, path.join(migrationsOut, M11_NAME), { recursive: true });
copyFileSync(FINAL_SCHEMA_FILE, path.join(sourceDir, 'apps/v1_api/prisma/schema.prisma'));
const finalSchemaSha = sha256File(path.join(sourceDir, 'apps/v1_api/prisma/schema.prisma'));
if (finalSchemaSha !== TASK_SCHEMA_SHA) { console.error(`final schema sha mismatch: got ${finalSchemaSha}`); process.exit(1); }
const m11Sha = sha256File(path.join(migrationsOut, M11_NAME, 'migration.sql'));
if (m11Sha !== M11_SHA) { console.error(`M11 sha mismatch: got ${m11Sha}`); process.exit(1); }

// 2. Canonical full migration history: sorted dir listing, {name, sha256} of migration.sql each.
const migrationDirs = readdirSync(migrationsOut, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
const fullMigrationHistory = migrationDirs.map((name) => ({ name, sha256: sha256File(path.join(migrationsOut, name, 'migration.sql')) }));
if (fullMigrationHistory.length <= 11) { console.error('harness source tree has too few migrations'); process.exit(1); }
const last = fullMigrationHistory[fullMigrationHistory.length - 1];
if (last.name !== M11_NAME || last.sha256 !== M11_SHA) { console.error('M11 is not the sole final entry in the canonical history'); process.exit(1); }
const migrationLockSha = sha256File(path.join(migrationsOut, 'migration_lock.toml'));

// 3. Task168 migration entries (M1..M11) with real hashes, in fixed order.
const task168Migrations = ALL_TASK_MIGRATIONS.map((name) => ({ name, sha256: sha256File(path.join(migrationsOut, name, 'migration.sql')) }));
const predecessorMigrations = task168Migrations.slice(0, 10);

// 4. DB identity is deterministic for a unix-socket `psql -U user -d db`
// connection with no -h flag (inet_server_addr()/port() are both NULL for a
// local socket connection) — see final report for the live confirmation.
const DB_ID = `${DB_NAME}|${DB_USER}|local|local`;

// 5. Predecessor (Stage A) state: transition + quiesce + backup receipt +
// cutover report + a dummy backup blob, all cross-hashed exactly like a real
// Stage A run would leave them.
const stateRoot = path.join(WORK_DIR, 'state', 'task168');
const predDir = path.join(stateRoot, PREDECESSOR_SHA);
mkdirSync(predDir, { recursive: true });

const predQuiescePath = path.join(predDir, 'quiesce.json');
writeJson(predQuiescePath, { schemaVersion: 1, kind: 'quiesce', status: 'COMPLETED', stage: 'stageAIntermediate', releaseSha: PREDECESSOR_SHA, apiImage: PREDECESSOR_API_IMAGE, databaseIdentity: DB_ID, services: ['v1_api', 'v1_game_operations_worker'], completedAt: new Date().toISOString() });
const predQuiesceSha = sha256File(predQuiescePath);

const predBackupPath = path.join(predDir, 'backup.sql.gz');
const predBackupContent = Buffer.from(`task168-harness-stage-a-backup-${PREDECESSOR_SHA}`);
writeFileSync(predBackupPath, predBackupContent);
const predBackupSha = sha256File(predBackupPath);
const predBackupBytes = predBackupContent.length;

const predBackupReceiptPath = path.join(predDir, 'backup-receipt.json');
writeJson(predBackupReceiptPath, { schemaVersion: 1, kind: 'backup', status: 'COMPLETED', stage: 'stageAIntermediate', releaseSha: PREDECESSOR_SHA, apiImage: PREDECESSOR_API_IMAGE, databaseIdentity: DB_ID, backupPath: predBackupPath, backupSha256: predBackupSha, backupBytes: predBackupBytes, completedAt: new Date().toISOString() });
const predBackupReceiptSha = sha256File(predBackupReceiptPath);

const predReportPath = path.join(predDir, 'report', 'cutover-report.json');
writeJson(predReportPath, { status: 'COMPLETED', result: { verification: { remainingLegacyGameLinks: 0, remainingLegacyStaffScopes: 0, remainingLegacyAuditScopes: 0 } } });
const predReportSha = sha256File(predReportPath);

const predTransitionPath = path.join(predDir, 'transition.json');
writeJson(predTransitionPath, {
  schemaVersion: 1, kind: 'transition', status: 'COMPLETED', stage: 'stageAIntermediate',
  releaseSha: PREDECESSOR_SHA, apiImage: PREDECESSOR_API_IMAGE, databaseIdentity: DB_ID, schemaSha256: STAGE_A_SCHEMA_SHA,
  migrationHashes: predecessorMigrations,
  quiesceReceipt: predQuiescePath, quiesceReceiptSha256: predQuiesceSha,
  backupReceipt: predBackupReceiptPath, backupReceiptSha256: predBackupReceiptSha,
  // Stage A's real transition.json carries the backup file's own path/hash at
  // the top level (bound again inside backup-receipt.json) — the runner's
  // predecessor check reads both.
  backupPath: predBackupPath, backupSha256: predBackupSha,
  cutoverReport: predReportPath, cutoverReportSha256: predReportSha,
});
const predTransitionSha = sha256File(predTransitionPath);

// 6. Final-image preflight receipt + report (T5 rehearsal evidence the
// runner requires but never itself re-executes).
const preflightDir = path.join(WORK_DIR, 'preflight');
mkdirSync(preflightDir, { recursive: true });
const sourceSha = sha256Str(`task168-harness-source-${RELEASE_SHA}`);
const inputSnapshotSha = sha256Str(`task168-harness-input-snapshot-${RELEASE_SHA}`);
const webImage = `registry.example.invalid/teameet-harness-v1-web@sha256:${sha256Str('web-' + RELEASE_SHA)}`;
const toolImage = `registry.example.invalid/teameet-harness-v1-api@sha256:${sha256Str('tool-' + RELEASE_SHA)}`;

const preflightReportPath = path.join(preflightDir, 'report.json');
writeJson(preflightReportPath, {
  schemaSha256: TASK_SCHEMA_SHA, migrations: task168Migrations, fullMigrationHistory, resolvedMigrationAttemptsSha256: RESOLVED_ATTEMPTS_SHA,
  status: 'COMPLETED', catalog: { legacyTables: 0, legacyLinkColumns: 0, retirementTriggers: 0, retirementFunctions: 0 }, ledger: { count: 11, m11OnlyNew: true },
});
const preflightReportSha = sha256File(preflightReportPath);

const preflightReceiptPath = path.join(preflightDir, 'receipt.json');
writeJson(preflightReceiptPath, {
  schemaVersion: 1, kind: 'task168FinalImagePreflight', status: 'COMPLETED',
  releaseSha: RELEASE_SHA, sourceSha256: sourceSha, schemaSha256: TASK_SCHEMA_SHA,
  apiImage: API_IMAGE, webImage, cutoverToolImage: toolImage,
  harness: { sourceSha256: sourceSha, schemaSha256: TASK_SCHEMA_SHA, migrationHashes: task168Migrations, fullMigrationHistory, migrationLockSha256: migrationLockSha, resolvedMigrationAttemptsSha256: RESOLVED_ATTEMPTS_SHA },
  inputSnapshot: { kind: 'task168-stageB-inputs', sha256: inputSnapshotSha },
  execution: { status: 'COMPLETED', cleanupStatus: 'COMPLETED' },
  rehearsal: {
    status: 'COMPLETED', postM11: true, report: preflightReportPath, reportSha256: preflightReportSha,
    catalog: { legacyTables: 0, legacyLinkColumns: 0, retirementTriggers: 0, retirementFunctions: 0 },
    ledger: { applied: task168Migrations.map((m) => m.name), count: 11, m11OnlyNew: true },
    fullLedger: { applied: fullMigrationHistory.map((m) => m.name) },
  },
});
const preflightReceiptSha = sha256File(preflightReceiptPath);

// 7. The Stage B manifest itself.
const manifestPath = path.join(WORK_DIR, 'manifest.json');
writeJson(manifestPath, {
  schemaVersion: 1, environment: 'alpha',
  release: { sha: RELEASE_SHA, version: `0.0.0-harness.${RELEASE_SHA.slice(0, 8)}`, createdAt: new Date().toISOString() },
  source: { key: `releases/task168-stage-b/${RELEASE_SHA}.tar.gz`, sha256: sourceSha },
  database: {
    migrationPolicy: 'task168-stageBFinal', rollbackMode: 'backup-only', compatibilityCheck: 'expand-contract-sql-v1',
    migrationValidatedFrom: null, rollbackCompatibleWith: null,
    task168: {
      stage: 'stageBFinal', schemaSha256: TASK_SCHEMA_SHA, runtimeClientSchemaSha256: TASK_SCHEMA_SHA,
      recoveryFrom: null, rollbackTarget: null,
      migrations: task168Migrations, fullMigrationHistory,
      resolvedMigrationAttemptsSha256: RESOLVED_ATTEMPTS_SHA,
      predecessor: { releaseSha: PREDECESSOR_SHA, apiImage: PREDECESSOR_API_IMAGE, transition: predTransitionPath, transitionSha256: predTransitionSha, schemaSha256: STAGE_A_SCHEMA_SHA, databaseIdentity: DB_ID },
      finalImagePreflight: { receipt: preflightReceiptPath, receiptSha256: preflightReceiptSha, inputSnapshotSha256: inputSnapshotSha },
    },
  },
  images: {
    api: { repository: API_IMAGE.split('@')[0], digest: API_IMAGE.split('@')[1], uri: API_IMAGE },
    web: { repository: webImage.split('@')[0], digest: webImage.split('@')[1], uri: webImage },
    cutoverTool: { repository: toolImage.split('@')[0], digest: toolImage.split('@')[1], uri: toolImage },
  },
});

console.log(JSON.stringify({ manifestPath, sourceDir, stateRoot, dbId: DB_ID, predecessorSha: PREDECESSOR_SHA, releaseSha: RELEASE_SHA }, null, 2));
