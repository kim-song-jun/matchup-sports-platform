#!/usr/bin/env node

import { createRequire } from 'node:module';
import { createServer, connect } from 'node:net';
import {
  appendFileSync,
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(SCRIPT_DIR, '..', '..');
const API_ROOT = join(REPOSITORY_ROOT, 'apps', 'v1_api');
const API_ENTRYPOINT = join(API_ROOT, 'dist', 'src', 'main.js');
const TERMS_RUNTIME_SERVICE_ENTRYPOINT = join(API_ROOT, 'dist', 'src', 'terms', 'managed-terms-runtime.service.js');
const DB_PREFIX = 'ulw_v1_integration_task9_ci_';
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);
const REQUIRED_OUTPUTS = [
  'task9-http-summary.json',
  'task9-db-snapshot.json',
  'task9-command.log',
  'task9-api.log',
];
const COMMAND_TIMEOUT_MS = 30_000;
const MIGRATION_TIMEOUT_MS = 180_000;
const API_START_TIMEOUT_MS = 45_000;
const API_STOP_TIMEOUT_MS = 10_000;
const PORT_CLOSE_TIMEOUT_MS = 10_000;

const FIXTURE = Object.freeze({
  opsUser: '90000000-0000-4000-8000-000000000001',
  reviewerUser: '90000000-0000-4000-8000-000000000002',
  adminGrant: '90000000-0000-4000-8000-000000000003',
  sport: '90000000-0000-4000-8000-000000000010',
  config: '90000000-0000-4000-8000-000000000011',
  tournamentA: '90000000-0000-4000-8000-000000000101',
  tournamentB: '90000000-0000-4000-8000-000000000102',
  fixtureA: '90000000-0000-4000-8000-000000000111',
  fixtureB: '90000000-0000-4000-8000-000000000112',
  gameA: '90000000-0000-4000-8000-000000000121',
  gameB: '90000000-0000-4000-8000-000000000122',
  revisionA: '90000000-0000-4000-8000-000000000131',
  revisionB: '90000000-0000-4000-8000-000000000132',
  revisionHidden: '90000000-0000-4000-8000-000000000133',
  escalationA: '90000000-0000-4000-8000-000000000141',
  escalationB: '90000000-0000-4000-8000-000000000142',
  futureEscalation: '90000000-0000-4000-8000-000000000143',
  dueReminder: '90000000-0000-4000-8000-000000000144',
  reviewerAssignment: '90000000-0000-4000-8000-000000000151',
});

const ACTION = Object.freeze({
  ackReason: 'Task 9 literal curl acknowledgement',
  resolveReason: 'Task 9 literal curl resolution',
  changedReason: 'Task 9 literal curl changed payload',
  deniedReason: 'Task 9 reviewer cannot resolve platform escalation',
  ackKey: 'task9-ci-http-ack-a',
  resolveKey: 'task9-ci-http-resolve-b',
  deniedKey: 'task9-ci-http-reviewer-denied',
});

const state = {
  outputDir: null,
  responseDir: null,
  runtimeDir: null,
  rawApiLogPath: null,
  commandLogPath: null,
  outputDirCreated: false,
  runtimeDirCreated: false,
  commandLogInitialized: false,
  databaseName: null,
  adminConnection: null,
  databaseUrl: null,
  databaseCreationAttempted: false,
  prisma: null,
  termsService: null,
  apiProcess: null,
  apiLogFd: null,
  activeCommand: null,
  port: null,
  baselinePortOpen: null,
  cleanupPromise: null,
  cleanupReceipt: null,
  finalizationPromise: null,
  startedAt: new Date().toISOString(),
  scenarioResults: [],
  snapshots: {},
  failure: null,
  interruptedSignal: null,
};

let signalFinalizationStarted = false;

function fail(message) {
  throw new Error(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function parseArguments(argv) {
  assert(argv.length === 2 && argv[0] === '--output-dir', 'Usage: task9-ci-manual-http.mjs --output-dir <absolute-path>');
  assert(typeof argv[1] === 'string' && argv[1].length > 0, 'The evidence output directory is required');
  return { outputDir: argv[1] };
}

function requireNumericEnvironment(name) {
  const value = process.env[name];
  assert(typeof value === 'string' && /^[1-9][0-9]*$/.test(value), `${name} must be a positive numeric GitHub value`);
  return value;
}

function ensureInside(parent, child, label) {
  const pathFromParent = relative(parent, child);
  assert(
    pathFromParent !== '' && pathFromParent !== '..' && !pathFromParent.startsWith(`..${sep}`) && !isAbsolute(pathFromParent),
    `${label} must be a strict descendant of ${parent}`,
  );
}

function validateEnvironment(outputArgument) {
  assert(process.env.CI === 'true' && process.env.GITHUB_ACTIONS === 'true', 'This manual-QA harness is GitHub CI only');
  const runId = requireNumericEnvironment('GITHUB_RUN_ID');
  const runAttempt = requireNumericEnvironment('GITHUB_RUN_ATTEMPT');
  const runnerTempInput = process.env.RUNNER_TEMP;
  assert(typeof runnerTempInput === 'string' && isAbsolute(runnerTempInput), 'RUNNER_TEMP must be an absolute path');
  assert(existsSync(runnerTempInput) && statSync(runnerTempInput).isDirectory(), 'RUNNER_TEMP must be an existing directory');
  const runnerTemp = realpathSync(runnerTempInput);

  assert(isAbsolute(outputArgument), 'The evidence output directory must be absolute');
  const outputParent = resolve(dirname(outputArgument));
  assert(existsSync(outputParent) && statSync(outputParent).isDirectory(), 'The evidence parent directory must already exist');
  const realOutputParent = realpathSync(outputParent);
  ensureInside(runnerTemp, resolve(realOutputParent, basename(outputArgument)), 'The evidence output directory');
  const outputDir = resolve(outputArgument);
  assert(!existsSync(outputDir), 'The evidence output directory must not preexist');

  const databaseName = `${DB_PREFIX}${runId}_${runAttempt}`;
  assert(databaseName.length <= 63, 'The generated Task 9 database name exceeds PostgreSQL identifier length');
  assert(new RegExp(`^${DB_PREFIX}[1-9][0-9]*_[1-9][0-9]*$`).test(databaseName), 'The generated Task 9 database name is unsafe');

  const inputUrl = process.env.DATABASE_URL;
  assert(typeof inputUrl === 'string' && inputUrl.length > 0, 'DATABASE_URL is required');
  let parsed;
  try {
    parsed = new URL(inputUrl);
  } catch (error) {
    fail(`DATABASE_URL is invalid: ${error instanceof Error ? error.message : String(error)}`);
  }
  assert(parsed.protocol === 'postgresql:' || parsed.protocol === 'postgres:', 'DATABASE_URL must use PostgreSQL');
  assert(LOCAL_HOSTS.has(parsed.hostname), 'DATABASE_URL must target localhost');
  assert(parsed.pathname === '/teameet_test', 'DATABASE_URL must target the CI service database teameet_test');
  assert(parsed.username.length > 0 && parsed.password.length > 0, 'DATABASE_URL must contain the CI database credentials');
  assert(parsed.search === '' && parsed.hash === '', 'DATABASE_URL must not contain query or fragment components');

  const databaseUrl = new URL(inputUrl);
  databaseUrl.pathname = `/${databaseName}`;
  const runtimeDir = join(runnerTemp, `task9-ci-runtime-${runId}-${runAttempt}`);
  assert(!existsSync(runtimeDir), 'The Task 9 runtime directory must not preexist');

  return {
    outputDir,
    runtimeDir,
    databaseName,
    databaseUrl: databaseUrl.toString(),
    adminConnection: {
      host: parsed.hostname,
      port: parsed.port || '5432',
      user: decodeURIComponent(parsed.username),
      password: decodeURIComponent(parsed.password),
      database: parsed.pathname.slice(1),
    },
  };
}

function assertNoEnvironmentFiles() {
  for (const directory of [REPOSITORY_ROOT, API_ROOT]) {
    const names = readdirSync(directory).filter((name) => name === '.env');
    assert(names.length === 0, `Refusing to run while environment files exist in ${directory}`);
  }
}

function initializeEvidence(paths) {
  state.outputDir = paths.outputDir;
  state.runtimeDir = paths.runtimeDir;
  state.databaseName = paths.databaseName;
  state.databaseUrl = paths.databaseUrl;
  state.adminConnection = paths.adminConnection;
  state.responseDir = join(paths.runtimeDir, 'responses');
  state.rawApiLogPath = join(paths.runtimeDir, 'task9-api.raw.log');
  state.commandLogPath = join(paths.outputDir, 'task9-command.log');
  mkdirSync(paths.outputDir, { recursive: false, mode: 0o700 });
  state.outputDirCreated = true;
  assert(realpathSync(paths.outputDir) === paths.outputDir, 'The created evidence directory resolved to an unexpected path');
  writeFileSync(
    state.commandLogPath,
    `Task 9 CI literal HTTP/DB manual QA\nstarted_at=${state.startedAt}\ndatabase=${state.databaseName}\nsecrets=REDACTED\n`,
    { mode: 0o600 },
  );
  state.commandLogInitialized = true;
  mkdirSync(paths.runtimeDir, { recursive: false, mode: 0o700 });
  state.runtimeDirCreated = true;
  assert(realpathSync(paths.runtimeDir) === paths.runtimeDir, 'The created runtime directory resolved to an unexpected path');
  mkdirSync(state.responseDir, { recursive: false, mode: 0o700 });
}

function appendCommand(line) {
  assert(state.commandLogPath !== null && state.commandLogInitialized, 'Command log is not initialized');
  appendFileSync(state.commandLogPath, `${line}\n`, { encoding: 'utf8' });
}

function appendCommandIfInitialized(line) {
  if (state.commandLogPath === null || !state.commandLogInitialized) return;
  appendFileSync(state.commandLogPath, `${line}\n`, { encoding: 'utf8' });
}

async function commandExists(command) {
  await runChecked(command, ['--version'], { label: `${command} availability`, timeout: COMMAND_TIMEOUT_MS });
}

function processGroupExists(pid) {
  try {
    process.kill(-pid, 0);
    return true;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ESRCH') return false;
    throw error;
  }
}

function signalProcessGroup(pid, signal, label) {
  try {
    process.kill(-pid, signal);
    appendCommandIfInitialized(`command-signal label=${label} processGroup=${pid} signal=${signal}`);
    return true;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ESRCH') return false;
    throw error;
  }
}

async function terminateOwnedCommand(record, reason) {
  if (record.closed) return;
  record.abortReason ??= reason;
  if (record.child.pid !== undefined) signalProcessGroup(record.child.pid, 'SIGTERM', record.label);
  await Promise.race([record.closedPromise, delay(2_000)]);
  if (!record.closed && record.child.pid !== undefined && processGroupExists(record.child.pid)) {
    signalProcessGroup(record.child.pid, 'SIGKILL', record.label);
    await Promise.race([record.closedPromise, delay(2_000)]);
  }
}

function runChecked(command, args, options = {}) {
  assert(state.activeCommand === null, `Cannot start ${options.label ?? command} while another owned command is active`);
  const label = options.label ?? command;
  const timeoutMs = options.timeout ?? COMMAND_TIMEOUT_MS;
  return new Promise((resolveCommand, rejectCommand) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? REPOSITORY_ROOT,
      env: options.env ?? process.env,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let outputOverflow = false;
    let closeRecord;
    const closedPromise = new Promise((resolveClosed) => {
      closeRecord = resolveClosed;
    });
    const record = {
      child,
      label,
      closed: false,
      closedPromise,
      abortReason: null,
    };
    state.activeCommand = record;
    appendCommandIfInitialized(`command-start label=${label} pid=${child.pid ?? 'pending'} ppid=${process.pid} timeoutMs=${timeoutMs}`);

    const collect = (target, chunk) => {
      const next = target + chunk.toString('utf8');
      if (Buffer.byteLength(next) <= 8 * 1024 * 1024) return next;
      outputOverflow = true;
      record.abortReason ??= 'output exceeded 8 MiB';
      void terminateOwnedCommand(record, record.abortReason).catch((error) => {
        state.failure ??= `${label} overflow cleanup failed: ${error instanceof Error ? error.message : String(error)}`;
      });
      return next.slice(-8 * 1024 * 1024);
    };
    child.stdout.on('data', (chunk) => {
      stdout = collect(stdout, chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr = collect(stderr, chunk);
    });

    const timeout = setTimeout(() => {
      record.abortReason ??= `timeout after ${timeoutMs}ms`;
      void terminateOwnedCommand(record, record.abortReason).catch((error) => {
        state.failure ??= `${label} timeout cleanup failed: ${error instanceof Error ? error.message : String(error)}`;
      });
    }, timeoutMs);

    child.once('error', (error) => {
      record.abortReason ??= `failed to start: ${error.message}`;
    });
    child.once('close', (code, signal) => {
      clearTimeout(timeout);
      record.closed = true;
      closeRecord();
      if (state.activeCommand === record) state.activeCommand = null;
      appendCommandIfInitialized(`command-exit label=${label} code=${String(code)} signal=${signal ?? 'none'} abort=${record.abortReason ?? 'none'}`);
      if (record.abortReason !== null || outputOverflow || code !== 0) {
        const detail = redactText(stderr).trim().slice(-4_000);
        rejectCommand(new Error(`${label} ${record.abortReason ?? `exited ${String(code)}${signal ? ` by ${signal}` : ''}`}${detail ? `: ${detail}` : ''}`));
        return;
      }
      resolveCommand(stdout);
    });
  });
}

async function psql(sql, database = state.adminConnection?.database) {
  const connection = state.adminConnection;
  assert(connection !== null && connection !== undefined, 'PostgreSQL connection is not initialized');
  assert(typeof database === 'string' && /^[a-z0-9_]+$/.test(database), 'Unsafe PostgreSQL database target');
  return (await runChecked(
    'psql',
    [
      '-X',
      '--host', connection.host,
      '--port', connection.port,
      '--username', connection.user,
      '--dbname', database,
      '--no-align',
      '--tuples-only',
      '--set', 'ON_ERROR_STOP=1',
      '--command', sql,
    ],
    {
      env: { ...process.env, PGPASSWORD: connection.password },
      label: 'psql',
    },
  )).trim();
}

function quotedDatabaseName() {
  assert(state.databaseName !== null && new RegExp(`^${DB_PREFIX}[1-9][0-9]*_[1-9][0-9]*$`).test(state.databaseName), 'Unsafe Task 9 database name');
  return `"${state.databaseName}"`;
}

async function databaseExists() {
  assert(state.databaseName !== null, 'Database name is not initialized');
  const escaped = state.databaseName.replaceAll("'", "''");
  return (await psql(`SELECT COUNT(*) FROM pg_database WHERE datname = '${escaped}';`)) === '1';
}

async function createDatabase() {
  assert(!(await databaseExists()), 'The generated Task 9 database already exists; refusing stale-state reuse');
  appendCommand(`psql [LOCAL_CI_SERVICE_DB] -c 'CREATE DATABASE ${state.databaseName};'`);
  state.databaseCreationAttempted = true;
  await psql(`CREATE DATABASE ${quotedDatabaseName()};`);
  assert(await databaseExists(), 'The generated Task 9 database was not created');
}

async function migrateDatabase() {
  assert(existsSync(API_ENTRYPOINT), 'The built v1_api entrypoint is missing; run this harness after the API build');
  appendCommand('cd apps/v1_api && DATABASE_URL=[REDACTED_TASK9_DB_URL] pnpm exec prisma migrate deploy');
  await runChecked('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    cwd: API_ROOT,
    env: { ...process.env, DATABASE_URL: state.databaseUrl },
    timeout: MIGRATION_TIMEOUT_MS,
    label: 'Task 9 migration deploy',
  });
}

function loadRuntimeClients() {
  const requireFromApi = createRequire(join(API_ROOT, 'package.json'));
  requireFromApi('reflect-metadata');
  const { PrismaClient } = requireFromApi('@prisma/client');
  assert(existsSync(TERMS_RUNTIME_SERVICE_ENTRYPOINT), 'The built managed terms runtime service is missing; run this harness after the API build');
  const { ManagedTermsRuntimeService } = requireFromApi(TERMS_RUNTIME_SERVICE_ENTRYPOINT);
  assert(typeof ManagedTermsRuntimeService === 'function', 'The built managed terms runtime service export is invalid');
  state.prisma = new PrismaClient({ datasources: { db: { url: state.databaseUrl } } });
  state.termsService = new ManagedTermsRuntimeService(state.prisma);
}

async function seedFixture() {
  const prisma = state.prisma;
  assert(prisma !== null, 'Prisma client is not initialized');
  const nowRows = await prisma.$queryRawUnsafe('SELECT CURRENT_TIMESTAMP AS now');
  const databaseNow = nowRows[0]?.now;
  assert(databaseNow instanceof Date, 'Database CURRENT_TIMESTAMP was not returned');
  const dueAt = new Date(databaseNow.getTime() - 60_000);
  const futureAt = new Date(databaseNow.getTime() + 24 * 60 * 60 * 1_000);
  const phoneVerifiedAt = new Date(databaseNow.getTime() - 60_000);

  await prisma.v1User.createMany({
    data: [
      {
        id: FIXTURE.opsUser,
        email: 'task9-ci-ops@example.invalid',
        accountStatus: 'active',
        onboardingStatus: 'completed',
        phoneVerifiedAt,
      },
      {
        id: FIXTURE.reviewerUser,
        email: 'task9-ci-reviewer@example.invalid',
        accountStatus: 'active',
        onboardingStatus: 'completed',
        phoneVerifiedAt,
      },
    ],
  });

  const termsService = state.termsService;
  assert(termsService !== null, 'Managed terms runtime service is not initialized');
  const requiredDocumentIds = (await termsService.currentSignupTerms()).items
    .filter((item) => item.requirement === 'required')
    .map((item) => item.documentId);
  assert(requiredDocumentIds.length > 0, 'At least one current required signup terms document must exist');
  await Promise.all([
    termsService.acceptSignupTerms(FIXTURE.opsUser, requiredDocumentIds),
    termsService.acceptSignupTerms(FIXTURE.reviewerUser, requiredDocumentIds),
  ]);

  await prisma.$transaction(async (tx) => {
    await tx.v1AdminUser.create({
      data: {
        id: FIXTURE.adminGrant,
        userId: FIXTURE.opsUser,
        adminRole: 'ops',
        status: 'active',
      },
    });
    await tx.v1Sport.create({
      data: { id: FIXTURE.sport, code: 'football', name: 'Task 9 CI Sport' },
    });
    await tx.v1CompetitionConfigVersion.create({
      data: {
        id: FIXTURE.config,
        sportCode: 'football',
        name: 'Task 9 CI Config',
        version: 1,
        status: 'ACTIVE',
        periods: [
          { code: 'FIRST_HALF', label: '전반', durationMinutes: 45, extraTime: false },
          { code: 'SECOND_HALF', label: '후반', durationMinutes: 45, extraTime: false },
        ],
        events: ['GOAL', 'OWN_GOAL', 'YELLOW_CARD', 'RED_CARD', 'SUBSTITUTION'],
        lineup: {
          minPlayers: 7,
          maxPlayers: 11,
          substitutions: 'limited',
          maxSubstitutions: 5,
        },
        result: {
          tournamentScorerPolicy: 'required',
          teamMatchScorerPolicy: 'optional_with_warning',
          mvpMin: 0,
          mvpMax: 1,
        },
        tieBreak: {
          points: { win: 3, draw: 1, loss: 0 },
          order: [
            'points',
            'head_to_head',
            'goal_difference',
            'goals_for',
            'fair_play',
            'seeded_draw',
          ],
          seededDraw: 'sha256-v1',
        },
        visibility: { default: 'live', allowed: ['live', 'official'] },
        contentHash: 'task9-ci-competition-config-content-hash-v1',
        createdByUserId: FIXTURE.opsUser,
      },
    });
    await tx.v1Tournament.createMany({
      data: [
        {
          id: FIXTURE.tournamentA,
          sportId: FIXTURE.sport,
          title: 'Task 9 CI Tournament A',
          status: 'in_progress',
          competitionConfigVersionId: FIXTURE.config,
        },
        {
          id: FIXTURE.tournamentB,
          sportId: FIXTURE.sport,
          title: 'Task 9 CI Tournament B',
          status: 'in_progress',
          competitionConfigVersionId: FIXTURE.config,
        },
      ],
    });
    await tx.v1TournamentFixture.createMany({
      data: [
        {
          id: FIXTURE.fixtureA,
          tournamentId: FIXTURE.tournamentA,
          round: 'Task 9 CI A',
          fixtureNumber: 1,
          status: 'completed',
          competitionConfigVersionId: FIXTURE.config,
        },
        {
          id: FIXTURE.fixtureB,
          tournamentId: FIXTURE.tournamentB,
          round: 'Task 9 CI B',
          fixtureNumber: 1,
          status: 'completed',
          competitionConfigVersionId: FIXTURE.config,
        },
      ],
    });
    await tx.v1TournamentStaffAssignment.create({
      data: {
        id: FIXTURE.reviewerAssignment,
        tournamentId: FIXTURE.tournamentA,
        userId: FIXTURE.reviewerUser,
        role: 'TOURNAMENT_DIRECTOR',
        grantedByUserId: FIXTURE.opsUser,
      },
    });
    await tx.v1Game.createMany({
      data: [
        {
          id: FIXTURE.gameA,
          sourceType: 'TOURNAMENT_FIXTURE',
          tournamentFixtureId: FIXTURE.fixtureA,
          state: 'ENDED',
          competitionConfigVersionId: FIXTURE.config,
        },
        {
          id: FIXTURE.gameB,
          sourceType: 'TOURNAMENT_FIXTURE',
          tournamentFixtureId: FIXTURE.fixtureB,
          state: 'ENDED',
          competitionConfigVersionId: FIXTURE.config,
        },
      ],
    });
    await tx.v1GameResultRevision.createMany({
      data: [
        {
          id: FIXTURE.revisionA,
          gameId: FIXTURE.gameA,
          revision: 1,
          state: 'SUBMITTED',
          score: { home: 1, away: 0 },
          eventsHash: 'task9-ci-revision-a',
          createdByActorType: 'SYSTEM',
          createdBySystemActor: 'TASK9_CI_MANUAL_HTTP',
          submittedAt: dueAt,
        },
        {
          id: FIXTURE.revisionB,
          gameId: FIXTURE.gameB,
          revision: 1,
          state: 'SUBMITTED',
          score: { home: 0, away: 1 },
          eventsHash: 'task9-ci-revision-b',
          createdByActorType: 'SYSTEM',
          createdBySystemActor: 'TASK9_CI_MANUAL_HTTP',
          submittedAt: dueAt,
        },
        {
          id: FIXTURE.revisionHidden,
          gameId: FIXTURE.gameA,
          revision: 2,
          state: 'SUBMITTED',
          score: { home: 0, away: 0 },
          eventsHash: 'task9-ci-revision-hidden',
          createdByActorType: 'SYSTEM',
          createdBySystemActor: 'TASK9_CI_MANUAL_HTTP',
          submittedAt: dueAt,
        },
      ],
    });
    await tx.v1ResultEscalation.createMany({
      data: [
        { id: FIXTURE.escalationA, resultRevisionId: FIXTURE.revisionA, kind: 'ESCALATION', dueAt },
        { id: FIXTURE.escalationB, resultRevisionId: FIXTURE.revisionB, kind: 'ESCALATION', dueAt },
        { id: FIXTURE.futureEscalation, resultRevisionId: FIXTURE.revisionHidden, kind: 'ESCALATION', dueAt: futureAt },
        { id: FIXTURE.dueReminder, resultRevisionId: FIXTURE.revisionHidden, kind: 'REMINDER', dueAt },
      ],
    });
  });

  const preconditions = await fixturePreconditions(databaseNow, requiredDocumentIds);
  assert(preconditions.users.every((user) => user.accountStatus === 'active' && user.phoneVerifiedAt !== null), 'Fixture users must be active and phone verified');
  assert(preconditions.platformRole?.adminRole === 'ops' && preconditions.platformRole.status === 'active' && preconditions.platformRole.revokedAt === null, 'Fixture ops grant is not active');
  assert(preconditions.reviewerGrant?.role === 'TOURNAMENT_DIRECTOR' && preconditions.reviewerGrant.revokedAt === null, 'Fixture reviewer grant is not active');
  assert(preconditions.reviewerPlatformRole === null, 'Fixture reviewer must not have a platform role');
  const expectedTermsAcceptances = new Set(
    [FIXTURE.opsUser, FIXTURE.reviewerUser]
      .flatMap((userId) => requiredDocumentIds.map((documentId) => `${userId}:${documentId}`)),
  );
  const acceptanceCounts = new Map();
  for (const acceptance of preconditions.acceptedTerms) {
    const key = `${acceptance.userId}:${acceptance.documentId}`;
    acceptanceCounts.set(key, (acceptanceCounts.get(key) ?? 0) + 1);
  }
  assert(preconditions.acceptedTerms.length === expectedTermsAcceptances.size, 'Current required signup terms acceptance count must equal the actor-document cross-product');
  assert([...expectedTermsAcceptances].every((key) => acceptanceCounts.get(key) === 1), 'Every fixture actor must accept every current required signup terms document exactly once');
  assert([...acceptanceCounts].every(([key, count]) => expectedTermsAcceptances.has(key) && count === 1), 'Signup terms preconditions contain an unexpected or duplicate acceptance');
  assert(preconditions.rows.filter((row) => row.kind === 'ESCALATION' && row.dueAt <= databaseNow).length === 2, 'Fixture must contain exactly two due escalations');
  assert(preconditions.rows.filter((row) => row.kind === 'ESCALATION' && row.dueAt > databaseNow).length === 1, 'Fixture must contain exactly one future escalation');
  assert(preconditions.rows.filter((row) => row.kind === 'REMINDER' && row.dueAt <= databaseNow).length === 1, 'Fixture must contain exactly one due reminder');
  state.snapshots.fixture = serialize(preconditions);
}

async function fixturePreconditions(databaseNow, requiredDocumentIds) {
  const prisma = state.prisma;
  return {
    databaseNow,
    requiredSignupDocumentIds: requiredDocumentIds,
    users: await prisma.v1User.findMany({
      where: { id: { in: [FIXTURE.opsUser, FIXTURE.reviewerUser] } },
      orderBy: { id: 'asc' },
      select: { id: true, accountStatus: true, onboardingStatus: true, phoneVerifiedAt: true },
    }),
    platformRole: await prisma.v1AdminUser.findUnique({
      where: { userId: FIXTURE.opsUser },
      select: { adminRole: true, status: true, revokedAt: true },
    }),
    reviewerPlatformRole: await prisma.v1AdminUser.findUnique({
      where: { userId: FIXTURE.reviewerUser },
      select: { adminRole: true, status: true, revokedAt: true },
    }),
    reviewerGrant: await prisma.v1TournamentStaffAssignment.findUnique({
      where: { id: FIXTURE.reviewerAssignment },
      select: { tournamentId: true, userId: true, role: true, revokedAt: true, expiresAt: true },
    }),
    acceptedTerms: await prisma.v1ManagedTermsConsentEvent.findMany({
      where: {
        userId: { in: [FIXTURE.opsUser, FIXTURE.reviewerUser] },
        documentId: { in: requiredDocumentIds },
        context: 'signup',
        decision: 'accepted',
      },
      orderBy: [{ userId: 'asc' }, { documentId: 'asc' }],
      select: { userId: true, documentId: true, decision: true },
    }),
    rows: await prisma.v1ResultEscalation.findMany({
      where: { id: { in: allEscalationIds() } },
      orderBy: { id: 'asc' },
      select: { id: true, resultRevisionId: true, kind: true, dueAt: true, status: true, version: true },
    }),
  };
}

function allEscalationIds() {
  return [FIXTURE.escalationA, FIXTURE.escalationB, FIXTURE.futureEscalation, FIXTURE.dueReminder];
}

function serialize(value) {
  return JSON.parse(JSON.stringify(value));
}

function probePort(port, timeoutMs = 400) {
  return new Promise((resolveProbe) => {
    const socket = connect({ host: '127.0.0.1', port });
    let settled = false;
    const finish = (open) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolveProbe(open);
    };
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
    socket.setTimeout(timeoutMs, () => finish(false));
  });
}

function allocateUnusedPort() {
  return new Promise((resolvePort, rejectPort) => {
    const server = createServer();
    server.unref();
    server.once('error', rejectPort);
    server.listen({ host: '127.0.0.1', port: 0, exclusive: true }, () => {
      const address = server.address();
      if (address === null || typeof address === 'string') {
        server.close(() => rejectPort(new Error('Unable to allocate a TCP port')));
        return;
      }
      const port = address.port;
      server.close((error) => {
        if (error) rejectPort(error);
        else resolvePort(port);
      });
    });
  });
}

async function startApi() {
  assert(typeof process.env.JWT_SECRET === 'string' && process.env.JWT_SECRET.length > 0, 'JWT_SECRET is required from the existing API CI job');
  assert(typeof process.env.PATH === 'string' && process.env.PATH.length > 0, 'PATH is required to start the built API');
  state.port = await allocateUnusedPort();
  assert(Number.isInteger(state.port) && state.port >= 1024 && state.port <= 65535, 'Allocated API port is invalid');
  state.baselinePortOpen = await probePort(state.port);
  assert(state.baselinePortOpen === false, `Allocated API port ${state.port} is already occupied`);
  appendCommand(`tcp-baseline host=127.0.0.1 port=${state.port} open=false`);

  state.apiLogFd = openSync(state.rawApiLogPath, 'wx', 0o600);
  const child = spawn(process.execPath, [API_ENTRYPOINT], {
    cwd: state.runtimeDir,
    env: {
      PATH: process.env.PATH,
      LANG: process.env.LANG ?? 'C.UTF-8',
      TZ: 'UTC',
      CI: 'true',
      API_PORT: String(state.port),
      DATABASE_URL: state.databaseUrl,
      JWT_SECRET: process.env.JWT_SECRET,
      NODE_ENV: 'test',
      LOG_LEVEL: 'info',
    },
    detached: true,
    stdio: ['ignore', state.apiLogFd, state.apiLogFd],
  });
  state.apiProcess = child;
  appendCommand(`api-start executable=node entrypoint=apps/v1_api/dist/src/main.js pid=${child.pid} ppid=${process.pid} port=${state.port}`);
  child.once('error', (error) => {
    state.failure ??= `API child process error: ${error.message}`;
  });

  const deadline = Date.now() + API_START_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) fail(`v1_api exited before opening its port with code ${child.exitCode}`);
    if (await probePort(state.port, 500)) {
      appendCommand(`api-ready pid=${child.pid} port=${state.port}`);
      return;
    }
    await delay(250);
  }
  fail(`v1_api did not open port ${state.port} within ${API_START_TIMEOUT_MS}ms`);
}

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

function quoteForLog(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function redactCurlArgument(argument) {
  return argument
    .replaceAll(FIXTURE.opsUser, '[OPS_USER_ID]')
    .replaceAll(FIXTURE.reviewerUser, '[REVIEWER_USER_ID]')
    .replaceAll(FIXTURE.escalationA, '[ESCALATION_A_ID]')
    .replaceAll(FIXTURE.escalationB, '[ESCALATION_B_ID]')
    .replaceAll(FIXTURE.futureEscalation, '[FUTURE_ESCALATION_ID]')
    .replaceAll(FIXTURE.dueReminder, '[DUE_REMINDER_ID]');
}

function safeResponseHeaders(rawHeaders) {
  const blocks = rawHeaders.trim().split(/\r?\n\r?\n/);
  const finalBlock = blocks.at(-1) ?? '';
  const lines = finalBlock.split(/\r?\n/);
  const statusLine = lines.shift() ?? '';
  const allowed = new Set(['content-type', 'content-length']);
  const headers = {};
  for (const line of lines) {
    const separator = line.indexOf(':');
    if (separator < 1) continue;
    const name = line.slice(0, separator).trim().toLowerCase();
    if (allowed.has(name)) headers[name] = line.slice(separator + 1).trim();
  }
  return { statusLine, headers };
}

async function curlScenario({ name, method = 'GET', path, actor, idempotencyKey, body }) {
  assert(state.responseDir !== null && state.port !== null, 'HTTP runtime is not initialized');
  assert(/^\/[a-zA-Z0-9_?&=./:-]+$/.test(path), `Unsafe curl scenario path: ${path}`);
  const bodyPath = join(state.responseDir, `${name}.body.json`);
  const headersPath = join(state.responseDir, `${name}.headers.txt`);
  const args = [
    '--silent',
    '--show-error',
    '--max-time',
    '10',
    '--request',
    method,
    '--header',
    'accept: application/json',
  ];
  if (actor !== undefined) args.push('--header', `x-v1-user-id: ${actor}`);
  if (idempotencyKey !== undefined) args.push('--header', `idempotency-key: ${idempotencyKey}`);
  if (body !== undefined) {
    args.push('--header', 'content-type: application/json', '--data-binary', JSON.stringify(body));
  }
  args.push('--dump-header', headersPath, '--output', bodyPath, '--write-out', '%{http_code}', `http://127.0.0.1:${state.port}${path}`);

  const loggedArgs = args.map((argument) => quoteForLog(redactCurlArgument(argument))).join(' ');
  appendCommand(`scenario=${name} literal-command: curl ${loggedArgs}`);
  const statusOutput = (await runChecked('curl', args, { label: `curl scenario ${name}`, timeout: 15_000 })).trim();
  assert(/^[1-5][0-9]{2}$/.test(statusOutput), `curl scenario ${name} returned an invalid status observable`);
  assert(existsSync(bodyPath) && statSync(bodyPath).size > 0, `curl scenario ${name} produced no body`);
  assert(existsSync(headersPath) && statSync(headersPath).size > 0, `curl scenario ${name} produced no headers`);
  const rawBody = readFileSync(bodyPath, 'utf8');
  let parsedBody;
  try {
    parsedBody = JSON.parse(rawBody);
  } catch (error) {
    fail(`curl scenario ${name} returned non-JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  const response = {
    name,
    command: `curl ${loggedArgs}`,
    status: Number(statusOutput),
    responseHeaders: safeResponseHeaders(readFileSync(headersPath, 'utf8')),
    body: parsedBody,
  };
  state.scenarioResults.push(response);
  appendCommand(`scenario=${name} observable-status=${response.status} observable-body=${JSON.stringify(parsedBody)}`);
  return response;
}

function responseCode(response) {
  return response.body?.code;
}

function responseData(response) {
  return response.body?.data;
}

function assertHttp(response, expectedStatus, expectedCode) {
  assert(response.status === expectedStatus, `${response.name} expected HTTP ${expectedStatus}, received ${response.status}`);
  if (expectedCode !== undefined) {
    assert(responseCode(response) === expectedCode, `${response.name} expected code ${expectedCode}, received ${String(responseCode(response))}`);
  }
}

async function databaseSnapshot(label) {
  const prisma = state.prisma;
  assert(prisma !== null, 'Prisma client is not initialized');
  const escalationIds = allEscalationIds();
  const snapshot = {
    label,
    rows: await prisma.v1ResultEscalation.findMany({
      where: { id: { in: escalationIds } },
      orderBy: { id: 'asc' },
      select: {
        id: true,
        resultRevisionId: true,
        kind: true,
        dueAt: true,
        status: true,
        ackByUserId: true,
        resolvedByUserId: true,
        reason: true,
        version: true,
        updatedAt: true,
      },
    }),
    audits: await prisma.v1OperationAudit.findMany({
      where: { resourceType: 'RESULT_ESCALATION', resourceId: { in: escalationIds } },
      orderBy: [{ resourceId: 'asc' }, { createdAt: 'asc' }],
      select: {
        actorType: true,
        actorUserId: true,
        action: true,
        resourceType: true,
        resourceId: true,
        requestId: true,
        reason: true,
        tournamentId: true,
      },
    }),
    idempotency: await prisma.v1IdempotencyRecord.findMany({
      where: { resourceType: 'RESULT_ESCALATION', resourceId: { in: escalationIds } },
      orderBy: [{ resourceId: 'asc' }, { action: 'asc' }],
      select: {
        actorUserId: true,
        action: true,
        resourceType: true,
        resourceId: true,
        idempotencyKey: true,
        payloadHash: true,
        responseStatus: true,
      },
    }),
  };
  const serialized = serialize(snapshot);
  state.snapshots[label] = serialized;
  appendCommand(`db-snapshot label=${label} rows=${serialized.rows.length} audits=${serialized.audits.length} idempotency=${serialized.idempotency.length}`);
  return serialized;
}

function comparableSnapshot(snapshot) {
  return { rows: snapshot.rows, audits: snapshot.audits, idempotency: snapshot.idempotency };
}

function assertSnapshotsEqual(actual, expected, message) {
  assert(JSON.stringify(comparableSnapshot(actual)) === JSON.stringify(comparableSnapshot(expected)), message);
}

async function executeScenarios() {
  const queuePath = '/api/v1/tournament-ops/escalations';
  const health = await curlScenario({ name: 'health', path: '/api/v1/health' });
  assertHttp(health, 200);
  assert(responseData(health)?.service === 'v1_api' && responseData(health)?.checks?.db === true, 'Health endpoint must prove the isolated database is reachable');
  const initial = await databaseSnapshot('initial');

  const list = await curlScenario({ name: 'platform-list', path: queuePath, actor: FIXTURE.opsUser });
  assertHttp(list, 200);
  const listedIds = (responseData(list)?.items ?? []).map((item) => item.id).sort();
  assert(JSON.stringify(listedIds) === JSON.stringify([FIXTURE.escalationA, FIXTURE.escalationB].sort()), 'Platform list must contain exactly due escalation rows A and B');

  const detail = await curlScenario({ name: 'platform-detail-a', path: `${queuePath}/${FIXTURE.escalationA}`, actor: FIXTURE.opsUser });
  assertHttp(detail, 200);
  assert(responseData(detail)?.id === FIXTURE.escalationA, 'Platform detail must return escalation A');

  const reviewerResolve = await curlScenario({
    name: 'reviewer-resolve-a-denied',
    method: 'POST',
    path: `${queuePath}/${FIXTURE.escalationA}/resolve`,
    actor: FIXTURE.reviewerUser,
    idempotencyKey: ACTION.deniedKey,
    body: { expectedVersion: 0, reason: ACTION.deniedReason },
  });
  assertHttp(reviewerResolve, 403, 'ESCALATION_SCOPE_DENIED');

  const futureDetail = await curlScenario({ name: 'future-escalation-hidden', path: `${queuePath}/${FIXTURE.futureEscalation}`, actor: FIXTURE.opsUser });
  assertHttp(futureDetail, 404, 'RESULT_ESCALATION_NOT_FOUND');

  const reminderDetail = await curlScenario({ name: 'reminder-hidden', path: `${queuePath}/${FIXTURE.dueReminder}`, actor: FIXTURE.opsUser });
  assertHttp(reminderDetail, 404, 'RESULT_ESCALATION_NOT_FOUND');

  const afterNegative = await databaseSnapshot('afterNegative');
  assertSnapshotsEqual(afterNegative, initial, 'Denied/future/reminder requests changed Task 9 escalation state');

  const acknowledged = await curlScenario({
    name: 'platform-ack-a',
    method: 'POST',
    path: `${queuePath}/${FIXTURE.escalationA}/ack`,
    actor: FIXTURE.opsUser,
    idempotencyKey: ACTION.ackKey,
    body: { expectedVersion: 0, reason: ACTION.ackReason },
  });
  assertHttp(acknowledged, 200);
  assert(responseData(acknowledged)?.status === 'ACKNOWLEDGED' && responseData(acknowledged)?.version === 1 && responseData(acknowledged)?.replayed === false, 'Acknowledge A response contract failed');

  const resolved = await curlScenario({
    name: 'platform-resolve-b',
    method: 'POST',
    path: `${queuePath}/${FIXTURE.escalationB}/resolve`,
    actor: FIXTURE.opsUser,
    idempotencyKey: ACTION.resolveKey,
    body: { expectedVersion: 0, reason: ACTION.resolveReason },
  });
  assertHttp(resolved, 200);
  assert(responseData(resolved)?.status === 'RESOLVED' && responseData(resolved)?.version === 1 && responseData(resolved)?.replayed === false, 'Resolve B response contract failed');

  const afterPositive = await databaseSnapshot('afterPositive');
  assertPositiveDatabaseState(afterPositive);

  const replay = await curlScenario({
    name: 'platform-ack-a-replay',
    method: 'POST',
    path: `${queuePath}/${FIXTURE.escalationA}/ack`,
    actor: FIXTURE.opsUser,
    idempotencyKey: ACTION.ackKey,
    body: { expectedVersion: 0, reason: ACTION.ackReason },
  });
  assertHttp(replay, 200);
  assert(responseData(replay)?.replayed === true && responseData(replay)?.status === 'ACKNOWLEDGED' && responseData(replay)?.version === 1, 'Replay must return the original acknowledgement with replayed:true');

  const conflict = await curlScenario({
    name: 'platform-ack-a-conflict',
    method: 'POST',
    path: `${queuePath}/${FIXTURE.escalationA}/ack`,
    actor: FIXTURE.opsUser,
    idempotencyKey: ACTION.ackKey,
    body: { expectedVersion: 0, reason: ACTION.changedReason },
  });
  assertHttp(conflict, 409, 'IDEMPOTENCY_PAYLOAD_CONFLICT');

  const afterReplayConflict = await databaseSnapshot('afterReplayConflict');
  assertSnapshotsEqual(afterReplayConflict, afterPositive, 'Replay/conflict added a second update, audit, or idempotency record');
  assert(state.scenarioResults.length === 10, 'All ten bounded literal curl commands, including health, must execute exactly once');
}

function assertPositiveDatabaseState(snapshot) {
  assert(snapshot.rows.length === 4, 'DB snapshot must contain exactly four test-owned escalation rows');
  const byId = new Map(snapshot.rows.map((row) => [row.id, row]));
  const rowA = byId.get(FIXTURE.escalationA);
  const rowB = byId.get(FIXTURE.escalationB);
  const future = byId.get(FIXTURE.futureEscalation);
  const reminder = byId.get(FIXTURE.dueReminder);
  assert(rowA?.status === 'ACKNOWLEDGED' && rowA.version === 1 && rowA.ackByUserId === FIXTURE.opsUser && rowA.reason === ACTION.ackReason, 'DB row A acknowledgement state is incorrect');
  assert(rowB?.status === 'RESOLVED' && rowB.version === 1 && rowB.resolvedByUserId === FIXTURE.opsUser && rowB.reason === ACTION.resolveReason, 'DB row B resolution state is incorrect');
  assert(future?.status === 'PENDING' && future.version === 0 && future.ackByUserId === null && future.resolvedByUserId === null, 'Future escalation was mutated');
  assert(reminder?.status === 'PENDING' && reminder.version === 0 && reminder.ackByUserId === null && reminder.resolvedByUserId === null, 'Reminder was mutated');

  assert(snapshot.audits.length === 2, 'Exactly two operation audits are required');
  const auditByResource = new Map(snapshot.audits.map((audit) => [audit.resourceId, audit]));
  const auditA = auditByResource.get(FIXTURE.escalationA);
  const auditB = auditByResource.get(FIXTURE.escalationB);
  assert(auditA?.action === 'RESULT_ESCALATION_ACKNOWLEDGED' && auditA.tournamentId === FIXTURE.tournamentA && auditA.actorUserId === FIXTURE.opsUser && auditA.requestId === ACTION.ackKey, 'Audit A must carry the row-derived tournament A identity');
  assert(auditB?.action === 'RESULT_ESCALATION_RESOLVED' && auditB.tournamentId === FIXTURE.tournamentB && auditB.actorUserId === FIXTURE.opsUser && auditB.requestId === ACTION.resolveKey, 'Audit B must carry the row-derived tournament B identity');

  assert(snapshot.idempotency.length === 2, 'Exactly two actor-scoped idempotency records are required');
  assert(snapshot.idempotency.every((record) => record.actorUserId === FIXTURE.opsUser && record.resourceType === 'RESULT_ESCALATION' && record.responseStatus === 200), 'Idempotency records must be scoped to the ops actor and Task 9 resources');
  const keys = snapshot.idempotency.map((record) => record.idempotencyKey).sort();
  assert(JSON.stringify(keys) === JSON.stringify([ACTION.ackKey, ACTION.resolveKey].sort()), 'Idempotency records have unexpected keys');
}

async function waitForExit(child, timeoutMs) {
  if (child.exitCode !== null || child.signalCode !== null) return true;
  return new Promise((resolveExit) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.off('exit', onExit);
      resolveExit(false);
    }, timeoutMs);
    const onExit = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolveExit(true);
    };
    child.once('exit', onExit);
  });
}

function signalOwnedProcessGroup(signal) {
  const child = state.apiProcess;
  if (child === null || child.pid === undefined || child.exitCode !== null || child.signalCode !== null) return false;
  try {
    process.kill(-child.pid, signal);
    appendCommand(`api-signal pid=${child.pid} processGroup=${child.pid} signal=${signal}`);
    return true;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ESRCH') {
      appendCommand(`api-signal pid=${child.pid} signal=${signal} result=already-exited`);
      return false;
    }
    throw error;
  }
}

function ownedProcessGroupExists() {
  const child = state.apiProcess;
  if (child === null || child.pid === undefined) return false;
  return processGroupExists(child.pid);
}

async function waitForProcessGroupClosed(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!ownedProcessGroupExists()) return true;
    await delay(200);
  }
  return !ownedProcessGroupExists();
}

async function waitForPortClosed() {
  assert(state.port !== null, 'API port is not initialized');
  const deadline = Date.now() + PORT_CLOSE_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (!(await probePort(state.port, 300))) return true;
    await delay(200);
  }
  return false;
}

async function cleanup() {
  if (state.cleanupPromise !== null) return state.cleanupPromise;
  state.cleanupPromise = (async () => {
    const errors = [];
    const receipt = {
      activeCommandAtCleanup: state.activeCommand?.label ?? null,
      activeCommandClosed: state.activeCommand === null,
      apiPid: state.apiProcess?.pid ?? null,
      apiPpid: state.apiProcess === null ? null : process.pid,
      port: state.port,
      baselinePortOpen: state.baselinePortOpen,
      termSent: false,
      killSent: false,
      apiExited: state.apiProcess === null,
      processGroupClosed: state.apiProcess === null,
      portClosed: state.port === null,
      databaseConnectionsTerminated: !state.databaseCreationAttempted,
      databaseDropped: !state.databaseCreationAttempted,
      databaseResidualCount: state.databaseCreationAttempted ? null : 0,
      runtimeDirectoryRemoved: !state.runtimeDirCreated,
      cleanupErrors: errors,
    };

    if (state.outputDirCreated && !state.commandLogInitialized && state.commandLogPath !== null) {
      try {
        writeFileSync(state.commandLogPath, `Task 9 CI initialization failed before command logging\nstarted_at=${state.startedAt}\n`, { mode: 0o600 });
        state.commandLogInitialized = true;
      } catch (error) {
        errors.push(`Command log recovery failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    if (state.activeCommand !== null) {
      try {
        const active = state.activeCommand;
        await terminateOwnedCommand(active, state.interruptedSignal === null ? 'cleanup' : `signal ${state.interruptedSignal}`);
        receipt.activeCommandClosed = active.closed;
        if (!active.closed) errors.push(`Owned command ${active.label} remains active`);
      } catch (error) {
        errors.push(`Active command cleanup failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    if (state.apiProcess !== null) {
      try {
        receipt.termSent = signalOwnedProcessGroup('SIGTERM');
        receipt.apiExited = await waitForExit(state.apiProcess, API_STOP_TIMEOUT_MS);
        if (!receipt.apiExited) {
          receipt.killSent = signalOwnedProcessGroup('SIGKILL');
          receipt.apiExited = await waitForExit(state.apiProcess, API_STOP_TIMEOUT_MS);
        }
        if (!receipt.apiExited) errors.push('Owned API process did not exit after TERM/KILL');
        if (ownedProcessGroupExists()) {
          process.kill(-state.apiProcess.pid, 'SIGKILL');
          receipt.killSent = true;
          appendCommand(`api-signal processGroup=${state.apiProcess.pid} signal=SIGKILL reason=residual-child`);
        }
        receipt.processGroupClosed = await waitForProcessGroupClosed(API_STOP_TIMEOUT_MS);
        if (!receipt.processGroupClosed) errors.push(`Owned API process group ${state.apiProcess.pid} remains present`);
      } catch (error) {
        errors.push(`API cleanup failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    if (state.apiLogFd !== null) {
      try {
        closeSync(state.apiLogFd);
        state.apiLogFd = null;
      } catch (error) {
        errors.push(`API log descriptor cleanup failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    if (state.port !== null) {
      try {
        receipt.portClosed = await waitForPortClosed();
        if (!receipt.portClosed) errors.push(`Owned API port ${state.port} remains open`);
      } catch (error) {
        errors.push(`Port cleanup verification failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    if (state.prisma !== null) {
      try {
        await state.prisma.$disconnect();
        state.prisma = null;
      } catch (error) {
        errors.push(`Prisma disconnect failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    if (state.databaseCreationAttempted && state.databaseName !== null && state.adminConnection !== null) {
      try {
        const escaped = state.databaseName.replaceAll("'", "''");
        await psql(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${escaped}' AND pid <> pg_backend_pid();`);
        receipt.databaseConnectionsTerminated = true;
        if (await databaseExists()) await psql(`DROP DATABASE ${quotedDatabaseName()};`);
        receipt.databaseDropped = !(await databaseExists());
        receipt.databaseResidualCount = receipt.databaseDropped ? 0 : 1;
        if (!receipt.databaseDropped) errors.push(`Task 9 database ${state.databaseName} remains present`);
      } catch (error) {
        errors.push(`Database cleanup failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    if (state.outputDirCreated) {
      try {
        materializeRedactedApiLog();
      } catch (error) {
        errors.push(`API log redaction failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    if (state.runtimeDir !== null && state.runtimeDirCreated) {
      try {
        rmSync(state.runtimeDir, { recursive: true, force: false });
        receipt.runtimeDirectoryRemoved = !existsSync(state.runtimeDir);
        if (!receipt.runtimeDirectoryRemoved) errors.push('Task 9 runtime directory remains present');
      } catch (error) {
        errors.push(`Runtime directory cleanup failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    receipt.residualCount = [
      receipt.apiExited,
      receipt.activeCommandClosed,
      receipt.processGroupClosed,
      receipt.portClosed,
      receipt.databaseDropped,
      receipt.runtimeDirectoryRemoved,
    ].filter((value) => value !== true).length + errors.length;
    state.cleanupReceipt = receipt;
    appendCommandIfInitialized(`cleanup-receipt ${JSON.stringify(receipt)}`);
    return receipt;
  })();
  return state.cleanupPromise;
}

function redactText(input) {
  let output = input;
  const secrets = [process.env.DATABASE_URL, state.databaseUrl, process.env.JWT_SECRET, process.env.V1_SESSION_SECRET]
    .filter((value) => typeof value === 'string' && value.length > 0);
  for (const secret of secrets) output = output.replaceAll(secret, '[REDACTED]');
  output = output.replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, '[REDACTED_DATABASE_URL]');
  output = output.replace(/(authorization|cookie|jwt_secret|v1_session_secret)(["'=:\s]+)[^\s,}]+/gi, '$1$2[REDACTED]');
  return output;
}

function materializeRedactedApiLog() {
  assert(state.outputDir !== null, 'Evidence output is not initialized');
  const destination = join(state.outputDir, 'task9-api.log');
  const raw = state.rawApiLogPath !== null && existsSync(state.rawApiLogPath)
    ? readFileSync(state.rawApiLogPath, 'utf8')
    : 'v1_api was not started; no raw runtime log was created.\n';
  const redacted = redactText(raw);
  writeFileSync(destination, redacted.length > 0 ? redacted : 'v1_api produced an empty runtime log.\n', { mode: 0o600 });
}

function writeJsonAtomic(path, value) {
  const temporary = `${path}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  renameSync(temporary, path);
}

function writeEvidence() {
  assert(state.outputDir !== null, 'Evidence output is not initialized');
  const cleanupPassed = state.cleanupReceipt?.residualCount === 0;
  const scenarioPassed = state.failure === null && state.interruptedSignal === null;
  const verdict = scenarioPassed && cleanupPassed ? 'PASS' : 'FAIL';
  writeJsonAtomic(join(state.outputDir, 'task9-http-summary.json'), {
    schemaVersion: 1,
    verdict,
    ci: {
      runId: process.env.GITHUB_RUN_ID,
      runAttempt: process.env.GITHUB_RUN_ATTEMPT,
      commitSha: process.env.GITHUB_SHA ?? null,
    },
    runtime: {
      host: '127.0.0.1',
      port: state.port,
      apiPid: state.apiProcess?.pid ?? null,
      apiPpid: state.apiProcess === null ? null : process.pid,
      database: state.databaseName,
    },
    criteria: {
      literalCurlScenarioCount: state.scenarioResults.length,
      expectedLiteralCurlScenarioCount: 10,
      listExactlyAAndB: scenarioPassed,
      detailA: scenarioPassed,
      acknowledgeA: scenarioPassed,
      resolveB: scenarioPassed,
      reviewer403: scenarioPassed,
      future404: scenarioPassed,
      reminder404: scenarioPassed,
      replayTrue: scenarioPassed,
      changedPayload409: scenarioPassed,
      databaseAssertions: scenarioPassed,
      cleanupResidualZero: cleanupPassed,
    },
    scenarios: state.scenarioResults,
    cleanup: state.cleanupReceipt,
    failure: state.failure,
    interruptedSignal: state.interruptedSignal,
    startedAt: state.startedAt,
    finishedAt: new Date().toISOString(),
  });
  writeJsonAtomic(join(state.outputDir, 'task9-db-snapshot.json'), {
    schemaVersion: 1,
    verdict,
    fixtureIds: FIXTURE,
    snapshots: state.snapshots,
    assertions: {
      negativeBeforeAfterUnchanged: scenarioPassed,
      positiveStatusesVersionsAndActors: scenarioPassed,
      exactlyTwoRowDerivedTournamentAudits: scenarioPassed,
      actorScopedIdempotency: scenarioPassed,
      replayConflictNoAdditionalMutation: scenarioPassed,
    },
  });

  for (const name of REQUIRED_OUTPUTS) {
    const path = join(state.outputDir, name);
    assert(existsSync(path) && statSync(path).size > 0, `Required evidence is missing or empty: ${name}`);
  }
  const combined = REQUIRED_OUTPUTS.map((name) => readFileSync(join(state.outputDir, name), 'utf8')).join('\n');
  const forbiddenSecrets = [process.env.DATABASE_URL, state.databaseUrl, process.env.JWT_SECRET, process.env.V1_SESSION_SECRET]
    .filter((value) => typeof value === 'string' && value.length > 0);
  assert(forbiddenSecrets.every((secret) => !combined.includes(secret)), 'A secret leaked into Task 9 evidence');
}

function finalizeFailure(error) {
  state.failure ??= error instanceof Error ? error.message : String(error);
  if (state.finalizationPromise !== null) return state.finalizationPromise;
  state.finalizationPromise = (async () => {
    const receipt = await cleanup();
    if (!state.outputDirCreated) {
      if (receipt.residualCount !== 0) fail(`${state.failure}; cleanup residue=${receipt.residualCount}`);
      return;
    }
    try {
      writeEvidence();
    } catch (evidenceError) {
      state.failure = `${state.failure}; evidence finalization failed: ${evidenceError instanceof Error ? evidenceError.message : String(evidenceError)}`;
      throw evidenceError;
    }
    if (receipt.residualCount !== 0) {
      fail(`${state.failure}; cleanup residue=${receipt.residualCount}`);
    }
  })();
  return state.finalizationPromise;
}

async function handleSignal(signal) {
  if (signalFinalizationStarted) return;
  signalFinalizationStarted = true;
  state.interruptedSignal = signal;
  try {
    await finalizeFailure(new Error(`Interrupted by ${signal}`));
  } catch (error) {
    process.stderr.write(`${redactText(error instanceof Error ? error.message : String(error))}\n`);
  }
  process.exit(signal === 'SIGINT' ? 130 : 143);
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    void handleSignal(signal);
  });
}

async function main() {
  const { outputDir } = parseArguments(process.argv.slice(2));
  const paths = validateEnvironment(outputDir);
  initializeEvidence(paths);
  assertNoEnvironmentFiles();
  await commandExists('psql');
  await commandExists('curl');
  await commandExists('pnpm');
  await createDatabase();
  await migrateDatabase();
  loadRuntimeClients();
  await seedFixture();
  await startApi();
  await executeScenarios();
  const receipt = await cleanup();
  if (state.interruptedSignal !== null) {
    await finalizeFailure(new Error(`Interrupted by ${state.interruptedSignal}`));
    fail(`Interrupted by ${state.interruptedSignal}`);
  }
  assert(receipt.residualCount === 0, `Cleanup left ${receipt.residualCount} residual item(s)`);
  writeEvidence();
  process.stdout.write(`TASK9_CI_MANUAL_HTTP=PASS evidence=${state.outputDir}\n`);
}

try {
  await main();
} catch (error) {
  if (state.outputDir !== null) {
    try {
      await finalizeFailure(error);
    } catch (finalizationError) {
      process.stderr.write(`${redactText(finalizationError instanceof Error ? finalizationError.message : String(finalizationError))}\n`);
    }
  }
  process.stderr.write(`TASK9_CI_MANUAL_HTTP=FAIL ${redactText(error instanceof Error ? error.message : String(error))}\n`);
  process.exitCode = 1;
}
