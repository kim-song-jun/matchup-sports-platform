#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createServer, Socket } from 'node:net';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(SCRIPT_DIR, '..', '..');
const API_ROOT = join(REPOSITORY_ROOT, 'apps', 'v1_api');
const API_ENTRYPOINT = join(API_ROOT, 'dist', 'src', 'main.js');
const BACKFILL_ENTRYPOINT = join(API_ROOT, 'src', 'games', 'migration', 'game-result-backfill.cli.ts');
const BACKFILL_TEST = join(API_ROOT, 'test', 'games', 'game-backfill.integration-spec.ts');
const BACKFILL_FIXTURE = join(API_ROOT, 'test', 'fixtures', 'game-backfill.fixture.ts');
const LAST_PRE_TASK10_MIGRATION = '20260802000400_v1_public_official_result_cache';
const MODES = new Set(['pin', 'red', 'route-preflight', 'seed', 'inventory', 'apply', 'live', 'cleanup']);
const COMMAND_TIMEOUT_MS = 180_000;
const API_START_TIMEOUT_MS = 45_000;
const STOP_TIMEOUT_MS = 10_000;
const MAX_OUTPUT_BYTES = 4 * 1024 * 1024;

const state = {
  evidenceDir: null,
  runtimeFile: null,
  statePath: null,
  summaryPath: null,
  commandLogPath: null,
  apiLogPath: null,
  activeCommand: null,
  apiProcess: null,
};

function fail(message) {
  throw new Error(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function redactText(value) {
  return String(value)
    .replaceAll(/postgres(?:ql)?:\/\/[^\s"']+/gi, '[REDACTED_DATABASE_URL]')
    .replaceAll(/(authorization\s*:\s*bearer\s+)[^\s"']+/gi, '$1[REDACTED_TOKEN]')
    .replaceAll(/(bearer\s+)[A-Za-z0-9._~+\/-]+/gi, '$1[REDACTED_TOKEN]')
    .replaceAll(/("opsToken"\s*:\s*")[^"]+"/gi, '$1[REDACTED_TOKEN]"')
    .replaceAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[REDACTED_EMAIL]');
}

function sensitiveHitCount(value) {
  const patterns = [
    /postgres(?:ql)?:\/\/[^\s"']+/gi,
    /authorization\s*:\s*bearer\s+(?!\[REDACTED_TOKEN\])[^\s"']+/gi,
    /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
  ];
  return patterns.reduce((count, pattern) => count + (String(value).match(pattern) ?? []).length, 0);
}

function parseArguments(argv) {
  assert(argv.length % 2 === 0, 'Arguments must be flag/value pairs');
  const result = { mode: null, fixture: null, evidenceDir: null };
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    assert(value.length > 0, `Missing value for ${flag}`);
    if (flag === '--mode') result.mode = value;
    else if (flag === '--fixture') result.fixture = value;
    else if (flag === '--evidence-dir') result.evidenceDir = value;
    else fail(`Unknown argument: ${flag}`);
  }
  assert(result.mode !== null && MODES.has(result.mode), `--mode must be one of ${[...MODES].join(', ')}`);
  assert(result.evidenceDir !== null, '--evidence-dir is required');
  if (['seed', 'inventory', 'apply'].includes(result.mode)) assert(result.fixture !== null, `--fixture is required for ${result.mode}`);
  else assert(result.fixture === null, `--fixture is not accepted for ${result.mode}`);
  return result;
}

function positiveEnvironment(name) {
  const value = process.env[name];
  assert(typeof value === 'string' && /^[1-9][0-9]*$/.test(value), `${name} must be a positive integer`);
  return value;
}

function strictDescendant(parent, child, label) {
  const fromParent = relative(parent, child);
  assert(
    fromParent !== '' && fromParent !== '..' && !fromParent.startsWith(`..${sep}`) && !isAbsolute(fromParent),
    `${label} must be a strict descendant of RUNNER_TEMP`,
  );
}

function validateCi(evidenceArgument) {
  assert(process.env.CI === 'true' && process.env.GITHUB_ACTIONS === 'true', 'This harness is GitHub Actions only');
  assert(process.env.GITHUB_EVENT_NAME === 'workflow_dispatch', 'Task 10 requires workflow_dispatch');
  assert(process.env.GITHUB_REF_TYPE === 'branch', 'Task 10 requires a branch ref');
  assert(!['main', 'dev'].includes(process.env.GITHUB_REF_NAME), 'Task 10 refuses main and dev');
  const runId = positiveEnvironment('GITHUB_RUN_ID');
  const runAttempt = positiveEnvironment('GITHUB_RUN_ATTEMPT');
  const headSHA = process.env.GITHUB_SHA;
  assert(typeof headSHA === 'string' && /^[0-9a-f]{40}$/.test(headSHA), 'GITHUB_SHA must be an exact commit SHA');
  const runnerTempInput = process.env.RUNNER_TEMP;
  assert(typeof runnerTempInput === 'string' && isAbsolute(runnerTempInput), 'RUNNER_TEMP must be absolute');
  assert(existsSync(runnerTempInput) && statSync(runnerTempInput).isDirectory(), 'RUNNER_TEMP must exist');
  const runnerTemp = realpathSync(runnerTempInput);
  assert(isAbsolute(evidenceArgument), '--evidence-dir must be absolute');
  const evidenceDir = resolve(evidenceArgument);
  strictDescendant(runnerTemp, evidenceDir, 'Evidence directory');
  const runtimeFile = resolve(process.env.TASK10_RUNTIME_FILE ?? join(runnerTemp, `task10-runtime-${runId}-${runAttempt}.json`));
  strictDescendant(runnerTemp, runtimeFile, 'Runtime file');
  assert(!runtimeFile.startsWith(`${evidenceDir}${sep}`), 'Runtime secrets must not be uploaded as evidence');
  return { evidenceDir, runtimeFile, runId, runAttempt, headSHA };
}

function atomicJson(path, value) {
  const temporary = `${path}.tmp-${process.pid}`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  renameSync(temporary, path);
}

function readJson(path, label) {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    fail(`${label} is invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  assert(parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed), `${label} must be an object`);
  return parsed;
}

function updateJson(path, mutate) {
  const value = readJson(path, basename(path));
  mutate(value);
  atomicJson(path, value);
  return value;
}

function initializeEvidence(context) {
  state.evidenceDir = context.evidenceDir;
  state.runtimeFile = context.runtimeFile;
  state.statePath = join(context.evidenceDir, 'task10-state.json');
  state.summaryPath = join(context.evidenceDir, 'task10-summary.json');
  state.commandLogPath = join(context.evidenceDir, 'task10-command.log');
  state.apiLogPath = join(context.evidenceDir, 'task10-api.log');
  if (!existsSync(context.evidenceDir)) mkdirSync(context.evidenceDir, { recursive: false, mode: 0o700 });
  assert(realpathSync(context.evidenceDir) === context.evidenceDir, 'Evidence path resolved unexpectedly');
  if (!existsSync(state.commandLogPath)) {
    writeFileSync(
      state.commandLogPath,
      `Task 10 game-result cutover\nrunId=${context.runId}\nrunAttempt=${context.runAttempt}\nheadSHA=${context.headSHA}\nsecrets=REDACTED\n`,
      { mode: 0o600 },
    );
  }
  if (!existsSync(state.apiLogPath)) writeFileSync(state.apiLogPath, '', { mode: 0o600 });
  if (!existsSync(state.statePath)) {
    atomicJson(state.statePath, {
      schemaVersion: 1,
      runId: context.runId,
      runAttempt: context.runAttempt,
      headSHA: context.headSHA,
      stages: [],
      inventoryRun: null,
      applyRuns: [],
      process: null,
      port: null,
      failure: null,
    });
  } else {
    const persisted = readJson(state.statePath, 'Task 10 state');
    assert(persisted.runId === context.runId, 'Refusing stale state from another workflow run');
    assert(persisted.runAttempt === context.runAttempt, 'Refusing stale state from another workflow attempt');
    assert(persisted.headSHA === context.headSHA, 'Refusing state from another candidate SHA');
  }
  if (!existsSync(state.summaryPath)) {
    atomicJson(state.summaryPath, {
      schemaVersion: 1,
      runId: context.runId,
      runAttempt: context.runAttempt,
      headSHA: context.headSHA,
      verdict: 'IN_PROGRESS',
      bucketCounts: {},
      hashes: {},
      mismatches: [],
      curlStatus: {},
      operationFlagRoute: { status: null, registered: null },
      latchBehavior: { before: null, after: null, rollbackBlocked: null },
      redactionHits: 0,
      redactionsApplied: 0,
      cleanup: { residualProcesses: null, residualPorts: null, residualDatabases: null, residualTempPaths: null },
    });
  }
}

function appendCommand(line) {
  appendFileSync(state.commandLogPath, `${redactText(line)}\n`, 'utf8');
}

function recordStage(name, status, detail = null) {
  updateJson(state.statePath, (value) => {
    value.stages.push({ name, status, detail: detail === null ? null : redactText(detail), observedAt: new Date().toISOString() });
    if (status === 'failed') value.failure = redactText(detail ?? name);
  });
}

function discoverBoundary() {
  const migrationRoot = join(API_ROOT, 'prisma', 'migrations');
  const futureMigrations = readdirSync(migrationRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name > LAST_PRE_TASK10_MIGRATION)
    .map((entry) => entry.name)
    .filter((name) => existsSync(join(migrationRoot, name, 'migration.sql')))
    .sort();
  const required = {
    backfillEntrypoint: existsSync(BACKFILL_ENTRYPOINT),
    integrationTest: existsSync(BACKFILL_TEST),
    fixture: existsSync(BACKFILL_FIXTURE),
    futureMigration: futureMigrations.length > 0,
  };
  return { required, futureMigrations, complete: Object.values(required).every(Boolean) };
}

function processGroupExists(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(-pid, 0);
    return true;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ESRCH') return false;
    throw error;
  }
}

async function delay(milliseconds) {
  await new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

async function terminateProcessGroup(pid, label) {
  if (!processGroupExists(pid)) return;
  process.kill(-pid, 'SIGTERM');
  appendCommand(`process-signal label=${label} pgid=${pid} signal=SIGTERM`);
  const deadline = Date.now() + STOP_TIMEOUT_MS;
  while (Date.now() < deadline && processGroupExists(pid)) await delay(100);
  if (processGroupExists(pid)) {
    process.kill(-pid, 'SIGKILL');
    appendCommand(`process-signal label=${label} pgid=${pid} signal=SIGKILL`);
  }
}

function runCommand(command, args, options = {}) {
  assert(state.activeCommand === null, `Cannot start ${options.label ?? command}; another owned command is active`);
  return new Promise((resolveCommand, rejectCommand) => {
    const label = options.label ?? command;
    const child = spawn(command, args, {
      cwd: options.cwd ?? REPOSITORY_ROOT,
      env: options.env ?? process.env,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const record = { child, label, closed: false, timedOut: false };
    state.activeCommand = record;
    let stdout = '';
    let stderr = '';
    let overflow = false;
    appendCommand(`command-start label=${label} pid=${child.pid ?? 'pending'} ppid=${process.pid}`);
    const collect = (current, chunk) => {
      const next = current + chunk.toString('utf8');
      if (Buffer.byteLength(next) <= MAX_OUTPUT_BYTES) return next;
      overflow = true;
      return next.slice(-MAX_OUTPUT_BYTES);
    };
    child.stdout.on('data', (chunk) => { stdout = collect(stdout, chunk); });
    child.stderr.on('data', (chunk) => { stderr = collect(stderr, chunk); });
    const timer = setTimeout(() => {
      record.timedOut = true;
      void terminateProcessGroup(child.pid, `${label} timeout`);
    }, options.timeout ?? COMMAND_TIMEOUT_MS);
    child.once('error', (error) => { stderr += `\n${error.message}`; });
    child.once('close', (code, signal) => {
      clearTimeout(timer);
      record.closed = true;
      if (state.activeCommand === record) state.activeCommand = null;
      appendCommand(`command-exit label=${label} code=${String(code)} signal=${signal ?? 'none'}`);
      if (record.timedOut || overflow || code !== 0) {
        const reason = record.timedOut ? 'timed out' : overflow ? 'exceeded output limit' : `exited ${String(code)}`;
        rejectCommand(new Error(`${label} ${reason}: ${redactText(stderr).trim().slice(-2_000)}`));
        return;
      }
      resolveCommand({ stdout, stderr });
    });
  });
}

function validateFixture(fixture) {
  assert(!isAbsolute(fixture), '--fixture must be repository-relative');
  const resolvedFixture = resolve(REPOSITORY_ROOT, fixture);
  const fromRoot = relative(REPOSITORY_ROOT, resolvedFixture);
  assert(fromRoot !== '..' && !fromRoot.startsWith(`..${sep}`), '--fixture escapes the repository');
  assert(resolvedFixture === BACKFILL_FIXTURE, `--fixture must be ${relative(REPOSITORY_ROOT, BACKFILL_FIXTURE)}`);
  assert(existsSync(resolvedFixture), 'Task 10 fixture is missing');
  return resolvedFixture;
}

async function invokeBackfill(mode, fixture) {
  const args = [
    'exec', 'ts-node', '--transpile-only', relative(API_ROOT, BACKFILL_ENTRYPOINT),
    '--mode', mode,
    '--fixture', relative(API_ROOT, fixture),
    '--evidence-dir', state.evidenceDir,
  ];
  appendCommand(`cd apps/v1_api && DATABASE_URL=[REDACTED_DATABASE_URL] pnpm ${args.join(' ')}`);
  const { stdout } = await runCommand('pnpm', args, { cwd: API_ROOT, label: `Task 10 backfill ${mode}` });
  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch (error) {
    fail(`Task 10 backfill ${mode} must print one JSON object: ${error instanceof Error ? error.message : String(error)}`);
  }
  assert(parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed), 'Backfill output must be an object');
  assert(parsed.mode === mode, `Backfill mode must be ${mode}`);
  assert(parsed.bucketCounts !== null && typeof parsed.bucketCounts === 'object', 'Backfill output requires bucketCounts');
  assert(typeof parsed.sourceHash === 'string' && /^[0-9a-f]{64}$/.test(parsed.sourceHash), 'Backfill output requires sourceHash');
  assert(typeof parsed.resultHash === 'string' && /^[0-9a-f]{64}$/.test(parsed.resultHash), 'Backfill output requires resultHash');
  assert(Array.isArray(parsed.mismatches), 'Backfill output requires mismatches');
  return parsed;
}

async function invokeLatchProbe(fixture) {
  const args = [
    'exec', 'ts-node', '--transpile-only', relative(API_ROOT, BACKFILL_ENTRYPOINT),
    '--mode', 'latch-probe',
    '--fixture', relative(API_ROOT, fixture),
    '--evidence-dir', state.evidenceDir,
  ];
  appendCommand(`cd apps/v1_api && DATABASE_URL=[REDACTED_DATABASE_URL] pnpm ${args.join(' ')}`);
  const { stdout } = await runCommand('pnpm', args, { cwd: API_ROOT, label: 'Task 10 new-write latch probe' });
  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch (error) {
    fail(`Latch probe must print one JSON object: ${error instanceof Error ? error.message : String(error)}`);
  }
  assert(parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed), 'Latch probe output must be an object');
  assert(parsed.before !== null && typeof parsed.before === 'object', 'Latch probe requires before');
  assert(parsed.after !== null && typeof parsed.after === 'object', 'Latch probe requires after');
  assert(parsed.before.firstNewWriteAt === null && parsed.before.firstNewWriteResourceId === null, 'Latch must be empty before the first new write');
  assert(typeof parsed.after.firstNewWriteAt === 'string' && parsed.after.firstNewWriteAt.length > 0, 'Latch timestamp must be set after the first new write');
  assert(typeof parsed.after.firstNewWriteResourceId === 'string' && parsed.after.firstNewWriteResourceId.length > 0, 'Latch resource must be set after the first new write');
  assert(parsed.rollbackBlocked === true, 'Read/write authority rollback must be blocked after the first new write');
  return parsed;
}

function normalized(value) {
  if (Array.isArray(value)) return value.map(normalized);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, normalized(value[key])]));
  }
  return value;
}

function hashBody(body) {
  return createHash('sha256').update(JSON.stringify(normalized(body))).digest('hex');
}

function responseData(body) {
  if (body !== null && typeof body === 'object' && !Array.isArray(body) && 'data' in body) return body.data;
  return body;
}

async function reservePort() {
  return new Promise((resolvePort, rejectPort) => {
    const server = createServer();
    server.once('error', rejectPort);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      assert(address !== null && typeof address === 'object', 'Dynamic port allocation failed');
      server.close((error) => error ? rejectPort(error) : resolvePort(address.port));
    });
  });
}

async function portOpen(port) {
  return new Promise((resolveOpen) => {
    const socket = new Socket();
    socket.setTimeout(250);
    socket.once('connect', () => { socket.destroy(); resolveOpen(true); });
    socket.once('timeout', () => { socket.destroy(); resolveOpen(false); });
    socket.once('error', () => resolveOpen(false));
    socket.connect(port, '127.0.0.1');
  });
}

async function startApi(port) {
  assert(existsSync(API_ENTRYPOINT), 'Built v1 API entrypoint is missing');
  assert(!(await portOpen(port)), 'Dynamic API port is already open');
  const child = spawn(process.execPath, [API_ENTRYPOINT], {
    cwd: API_ROOT,
    env: { ...process.env, API_PORT: String(port), NODE_ENV: 'test' },
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  assert(child.pid !== undefined, 'API PID is missing');
  state.apiProcess = child;
  updateJson(state.statePath, (value) => {
    value.process = { pid: child.pid, pgid: child.pid, command: `${process.execPath} ${API_ENTRYPOINT}` };
    value.port = port;
  });
  const capture = (chunk) => appendFileSync(state.apiLogPath, redactText(chunk.toString('utf8')), 'utf8');
  child.stdout.on('data', capture);
  child.stderr.on('data', capture);
  appendCommand(`api-start pid=${child.pid} pgid=${child.pid} port=${port}`);
  const deadline = Date.now() + API_START_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await portOpen(port)) return;
    if (child.exitCode !== null) fail(`API exited before opening its port with code ${String(child.exitCode)}`);
    await delay(200);
  }
  await terminateProcessGroup(child.pid, 'API startup timeout');
  fail('API startup timed out');
}

async function curlJson({ label, url, token, method = 'GET', body = null, expectedStatuses = [200] }) {
  const logged = ['-i', '-H', 'Authorization: Bearer [REDACTED_TOKEN]'];
  const actual = ['-sS', '-i', '--max-time', '20', '-X', method, '-H', `Authorization: Bearer ${token}`];
  if (body !== null) {
    logged.push('-H', 'Content-Type: application/json', '--data-binary', '[REDACTED_REQUEST_BODY]');
    actual.push('-H', 'Content-Type: application/json', '--data-binary', JSON.stringify(body));
  }
  logged.push(url);
  actual.push(url);
  appendCommand(`curl ${logged.map((value) => JSON.stringify(value)).join(' ')}`);
  const { stdout } = await runCommand('curl', actual, { label: `curl ${label}`, timeout: 30_000 });
  const boundary = stdout.lastIndexOf('\r\n\r\n');
  assert(boundary >= 0, `${label} returned no HTTP header boundary`);
  const headers = stdout.slice(0, boundary);
  const bodyText = stdout.slice(boundary + 4);
  const statuses = [...headers.matchAll(/^HTTP\/\S+\s+(\d{3})/gm)];
  assert(statuses.length > 0, `${label} returned no HTTP status`);
  const status = Number(statuses.at(-1)[1]);
  let parsedBody;
  try {
    parsedBody = JSON.parse(bodyText);
  } catch (error) {
    fail(`${label} returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  const digest = hashBody(responseData(parsedBody));
  atomicJson(join(state.evidenceDir, `curl-${label}.json`), {
    label,
    status,
    headers: redactText(headers),
    body: '[REDACTED_RESPONSE_BODY]',
    bodyHash: digest,
  });
  updateJson(state.summaryPath, (summary) => { summary.curlStatus[label] = status; });
  assert(expectedStatuses.includes(status), `${label} returned HTTP ${status}`);
  return { body: parsedBody, hash: digest };
}

async function operationFlagRoutePreflight() {
  const port = await reservePort();
  const url = `http://127.0.0.1:${port}/api/v1/tournament-ops/operation-flags/GAME_READ`;
  await startApi(port);
  try {
    let response;
    try {
      response = await curlJson({
        label: 'operation-flag-route-preflight',
        url,
        token: 'task10-ci-route-presence-token',
        expectedStatuses: [200, 401, 403],
      });
    } catch (error) {
      const summary = readJson(state.summaryPath, 'Task 10 summary');
      const status = summary.curlStatus['operation-flag-route-preflight'] ?? null;
      updateJson(state.summaryPath, (value) => {
        value.operationFlagRoute = { status, registered: false };
      });
      const detail = status === 404
        ? 'TASK10_IMPLEMENTATION_MISSING: operation-flags route is absent from the live AppModule'
        : error instanceof Error ? error.message : String(error);
      recordStage('route-preflight', 'failed', detail);
      fail(detail);
    }
    const summary = readJson(state.summaryPath, 'Task 10 summary');
    updateJson(state.summaryPath, (value) => {
      value.operationFlagRoute = { status: summary.curlStatus['operation-flag-route-preflight'], registered: true };
    });
    assert(response !== undefined, 'Operation flag preflight response is missing');
    recordStage('route-preflight', 'passed');
  } finally {
    if (state.apiProcess?.pid !== undefined) await terminateProcessGroup(state.apiProcess.pid, 'Task 10 route preflight API');
  }
}

function runtimeManifest() {
  assert(existsSync(state.runtimeFile), 'Task 10 runtime manifest is missing');
  const runtime = readJson(state.runtimeFile, 'Task 10 runtime manifest');
  assert(runtime.schemaVersion === 1, 'Runtime manifest schemaVersion must be 1');
  assert(typeof runtime.opsToken === 'string' && runtime.opsToken.length >= 20, 'Runtime manifest requires opsToken');
  assert(typeof runtime.tournamentId === 'string' && /^[0-9a-f-]{36}$/i.test(runtime.tournamentId), 'Runtime manifest requires tournamentId');
  for (const key of ['compareTransition', 'killSwitchTransition']) {
    const transition = runtime[key];
    assert(transition !== null && typeof transition === 'object', `Runtime manifest requires ${key}`);
    assert(['PATCH', 'POST'].includes(transition.method), `${key}.method is invalid`);
    assert(typeof transition.path === 'string' && transition.path.startsWith('/api/v1/tournament-ops/operation-flags/'), `${key}.path is invalid`);
    assert(transition.body !== null && typeof transition.body === 'object', `${key}.body is invalid`);
  }
  return runtime;
}

async function liveCutover() {
  assert(discoverBoundary().complete, 'TASK10_IMPLEMENTATION_MISSING: live cutover boundary is incomplete');
  const runtime = runtimeManifest();
  const port = await reservePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  await startApi(port);
  try {
    const operationsUrl = `${baseUrl}/api/v1/tournament-ops/tournaments/${runtime.tournamentId}/operations`;
    const legacy = await curlJson({ label: 'legacy', url: operationsUrl, token: runtime.opsToken });
    await curlJson({
      label: 'transition-compare',
      method: runtime.compareTransition.method,
      url: `${baseUrl}${runtime.compareTransition.path}`,
      token: runtime.opsToken,
      body: runtime.compareTransition.body,
      expectedStatuses: [200, 201],
    });
    const compare = await curlJson({ label: 'compare', url: operationsUrl, token: runtime.opsToken });
    assert(compare.hash === legacy.hash, 'Compare response hash differs from legacy baseline');
    const mismatch = await invokeBackfill('inject-mismatch', BACKFILL_FIXTURE);
    assert(mismatch.mismatches.length > 0, 'Injected mismatch was not detected');
    const mismatchEntry = mismatch.mismatches[0];
    for (const key of ['entity', 'revision', 'field']) assert(typeof mismatchEntry[key] === 'string' && mismatchEntry[key].length > 0, `Mismatch requires ${key}`);
    await curlJson({ label: 'mismatch', url: operationsUrl, token: runtime.opsToken, expectedStatuses: [409, 500, 503] });
    await curlJson({
      label: 'transition-kill-switch',
      method: runtime.killSwitchTransition.method,
      url: `${baseUrl}${runtime.killSwitchTransition.path}`,
      token: runtime.opsToken,
      body: runtime.killSwitchTransition.body,
      expectedStatuses: [200, 201],
    });
    const rollback = await curlJson({ label: 'kill-switch', url: operationsUrl, token: runtime.opsToken });
    assert(rollback.hash === legacy.hash, 'Rollback body hash differs from legacy baseline');
    const latch = await invokeLatchProbe(BACKFILL_FIXTURE);
    updateJson(state.summaryPath, (summary) => {
      summary.hashes.legacyBody = legacy.hash;
      summary.hashes.compareBody = compare.hash;
      summary.hashes.rollbackBody = rollback.hash;
      summary.mismatches = mismatch.mismatches;
      summary.latchBehavior = latch;
      summary.verdict = 'PASS';
    });
    recordStage('live', 'passed');
  } finally {
    if (state.apiProcess?.pid !== undefined) await terminateProcessGroup(state.apiProcess.pid, 'Task 10 API');
  }
}

async function cleanup() {
  const persisted = existsSync(state.statePath) ? readJson(state.statePath, 'Task 10 state') : null;
  const pid = state.apiProcess?.pid ?? persisted?.process?.pgid ?? null;
  if (Number.isInteger(pid) && pid > 0 && processGroupExists(pid)) {
    const procCommandPath = `/proc/${pid}/cmdline`;
    assert(existsSync(procCommandPath), 'Owned API process exists without a readable Linux command descriptor');
    const command = readFileSync(procCommandPath, 'utf8').replaceAll('\0', ' ');
    assert(command.includes(API_ENTRYPOINT), 'Refusing to signal a PID that no longer belongs to the Task 10 API');
    await terminateProcessGroup(pid, 'Task 10 cleanup');
  }
  const port = persisted?.port ?? null;
  const residualProcesses = Number.isInteger(pid) && pid > 0 && processGroupExists(pid) ? 1 : 0;
  const residualPorts = Number.isInteger(port) && port > 0 && await portOpen(port) ? 1 : 0;
  if (existsSync(state.runtimeFile)) rmSync(state.runtimeFile, { force: true });
  const residualTempPaths = existsSync(state.runtimeFile) ? 1 : 0;
  const uploadedLogs = `${readFileSync(state.commandLogPath, 'utf8')}\n${readFileSync(state.apiLogPath, 'utf8')}`;
  const redactionHits = sensitiveHitCount(uploadedLogs);
  const redactionsApplied = (uploadedLogs.match(/\[REDACTED_[A-Z_]+\]/g) ?? []).length;
  const residualDatabases = process.env.TASK10_DATABASE_DROPPED === 'true' ? 0 : 1;
  updateJson(state.summaryPath, (summary) => {
    summary.cleanup = {
      residualProcesses,
      residualPorts,
      residualDatabases,
      residualTempPaths,
    };
    summary.redactionHits = redactionHits;
    summary.redactionsApplied = redactionsApplied;
    if (summary.verdict === 'IN_PROGRESS') summary.verdict = 'RED';
  });
  const residual = residualProcesses + residualPorts + residualDatabases + residualTempPaths + redactionHits;
  recordStage('cleanup', residual === 0 ? 'passed' : 'failed');
  assert(residual === 0, 'Task 10 cleanup left owned process, port, or temp resources');
}

async function main() {
  const args = parseArguments(process.argv.slice(2));
  const context = validateCi(args.evidenceDir);
  initializeEvidence(context);
  const boundary = discoverBoundary();
  if (args.mode === 'pin') {
    updateJson(state.summaryPath, (summary) => { summary.pin = boundary; });
    recordStage('pin', 'passed', boundary.complete ? 'implementation boundary present' : 'pre-implementation boundary pinned');
    return;
  }
  if (args.mode === 'red') {
    updateJson(state.summaryPath, (summary) => { summary.red = boundary; });
    if (!boundary.complete) {
      const missing = Object.entries(boundary.required).filter(([, present]) => !present).map(([name]) => name).join(', ');
      const detail = `TASK10_IMPLEMENTATION_MISSING: ${missing}`;
      recordStage('red', 'failed', detail);
      fail(detail);
    }
    recordStage('red', 'passed', 'Task 10 implementation boundary exists');
    return;
  }
  if (args.mode === 'route-preflight') {
    await operationFlagRoutePreflight();
    return;
  }
  if (args.mode === 'seed' || args.mode === 'inventory' || args.mode === 'apply') {
    assert(boundary.complete, `TASK10_IMPLEMENTATION_MISSING: cannot run ${args.mode}`);
    const result = await invokeBackfill(args.mode, validateFixture(args.fixture));
    updateJson(state.summaryPath, (summary) => {
      summary.bucketCounts = result.bucketCounts;
      summary.hashes.source = result.sourceHash;
      summary.hashes.result = result.resultHash;
      summary.mismatches = result.mismatches;
    });
    if (args.mode === 'apply') {
      const persisted = updateJson(state.statePath, (value) => {
        assert(value.inventoryRun !== null, 'Inventory must run before apply');
        assert(value.applyRuns.length < 2, 'Refusing more than two apply attempts in one workflow attempt');
        value.applyRuns.push(result);
      });
      const inventory = persisted.inventoryRun;
      assert(inventory.sourceHash === result.sourceHash && inventory.resultHash === result.resultHash, 'Inventory/apply hashes differ');
      assert(JSON.stringify(inventory.bucketCounts) === JSON.stringify(result.bucketCounts), 'Inventory/apply bucket counts differ');
      if (persisted.applyRuns.length === 2) {
        const [first, second] = persisted.applyRuns;
        assert(first.sourceHash === second.sourceHash && first.resultHash === second.resultHash, 'Repeated apply hashes differ');
        assert(JSON.stringify(first.bucketCounts) === JSON.stringify(second.bucketCounts), 'Repeated apply bucket counts differ');
        assert(Number(second.insertedCount) === 0, 'Second apply must insert zero rows');
        assert(Number(first.incompleteCount) > 0, 'Fixture must retain explicit partial/incomplete rows');
      }
    } else if (args.mode === 'inventory') {
      updateJson(state.statePath, (value) => {
        assert(value.applyRuns.length === 0, 'Inventory cannot replace a state after apply has started');
        value.inventoryRun = result;
      });
    } else {
      updateJson(state.statePath, (value) => {
        assert(value.inventoryRun === null && value.applyRuns.length === 0, 'Seed must precede inventory and apply');
      });
    }
    recordStage(args.mode, 'passed');
    return;
  }
  if (args.mode === 'live') {
    await liveCutover();
    return;
  }
  await cleanup();
}

async function terminateForSignal(signal) {
  if (state.activeCommand?.child.pid !== undefined) await terminateProcessGroup(state.activeCommand.child.pid, `signal ${signal}`);
  if (state.apiProcess?.pid !== undefined) await terminateProcessGroup(state.apiProcess.pid, `signal ${signal}`);
  process.exitCode = 128 + (signal === 'SIGTERM' ? 15 : 2);
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => { void terminateForSignal(signal); });
}

try {
  await main();
} catch (error) {
  const message = redactText(error instanceof Error ? error.message : String(error));
  if (state.statePath !== null && existsSync(state.statePath)) recordStage('fatal', 'failed', message);
  if (state.summaryPath !== null && existsSync(state.summaryPath)) {
    updateJson(state.summaryPath, (summary) => {
      summary.verdict = message.includes('TASK10_IMPLEMENTATION_MISSING') ? 'RED' : 'FAIL';
      summary.failure = message;
    });
  }
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}
