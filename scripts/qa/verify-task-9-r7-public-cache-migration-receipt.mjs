#!/usr/bin/env node
import {
  closeSync,
  constants as fsConstants,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  statSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const PLAN_PATH = '.omo/plans/teameet-team-tournament-operations-v1.md';
export const TASK_PATH = '.github/tasks/127-v1-team-tournament-operations-game-record.md';
export const R6_RECEIPT_PATH = '.omo/start-work/host-pressure-override-task-9-plan-r6.json';
export const R7_RECEIPT_PATH = '.omo/start-work/host-pressure-override-task-9-plan-r7.json';
export const TERMINAL_DONE_CLAIM_PATH = '.omo/evidence/task-9-public-cache-final-fix-20260803T000000Z/DoneClaim.json';
export const MIGRATION_PATH =
  'apps/v1_api/prisma/migrations/20260802000400_v1_public_official_result_cache';
export const SESSION_ID = 'codex:019fa9b3-efe1-75e0-811d-d2d03b08f027';
export const R6_PLAN_SHA256 = '5d59d8b616414fe81cf05cf5e9a09b3b985b065940651cd0a4e8d647c35bd027';
export const TERMINAL_DONE_CLAIM_SHA256 = 'eadd4e36f0e6fe7d054e9dc01b0021e32bb52705594fb4be83dd358917ed0c8f';

export const R6_OWNED_PATHS = Object.freeze([
  'apps/v1_api/prisma/schema.prisma',
  'apps/v1_api/prisma/migrations/20260802000100_v1_game_projections_escalations',
  'apps/v1_api/prisma/migrations/20260802000200_v1_team_record_facts',
  'apps/v1_api/src/game-operations',
  'apps/v1_api/src/games/projections',
  'apps/v1_api/src/jobs/result-escalation',
  'apps/v1_api/src/jobs/v1-game-operations-worker.module.ts',
  'apps/v1_api/src/jobs/v1-game-operations-worker.service.ts',
  'apps/v1_api/src/jobs/v1-game-operations-worker.main.ts',
  'apps/v1_api/src/games/games.service.ts',
  'apps/v1_api/src/notifications/notifications.module.ts',
  'apps/v1_api/src/notifications/notifications.service.ts',
  'apps/v1_api/src/tournaments/tournament-bracket.service.ts',
  'apps/v1_api/test/games/game-projection.integration-spec.ts',
  'docs/api/domains/games.md',
  'docs/api/domains/tournaments.md',
  'docs/api/domains/tournament-operations-escalations.md',
  'apps/v1_api/prisma/migrations/20260802000300_v1_result_escalation_lifecycle',
  'docs/api/global-contract.md',
  'docs/api/domains/tournament-operations-auth.md',
]);

const AUTHORIZATION = Object.freeze({
  authorizationSource: 'user-pressure-override',
  authorizationText: '부하는 상관하지말고 작업해 더 늘려서작업하라는거야',
  authorizedAt: '2026-08-03T00:00:00Z',
  constraints: [
    'load average above the prior maximum of 24 is explicitly approved for this Task 9 continuation',
    'Task 9 validation runs serially with minimum workers',
    'record actual host load, swap, Node/MCP, browser, Docker, target-port, command, exit-code, and owned-process metrics on every invocation',
    'record exact owned PID/PPID, command, and port before starting any owned process',
    'do not terminate, alter, or clean up other sessions\' processes or resources',
    'after each owned workload, clean up only the exact owned process tree with TERM then bounded KILL if required',
    'verify cleanup residual is zero and foreignTouched is zero',
    'continue monitoring swap and Node/MCP growth; approval does not waive those observations or cleanup',
  ],
});

class ReceiptError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function fail(code, message) {
  throw new ReceiptError(code, message);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function assert(condition, code, message) {
  if (!condition) fail(code, message);
}

function assertKeys(value, keys, code) {
  assert(value && typeof value === 'object' && !Array.isArray(value), code, 'expected object');
  assert(sameJson(Object.keys(value).sort(), [...keys].sort()), code, 'unexpected object keys');
}

function parseStrictJson(text, label) {
  let offset = 0;
  const white = /[\t\n\r ]/;
  const skip = () => {
    while (white.test(text[offset] ?? '')) offset += 1;
  };
  const string = () => {
    assert(text[offset] === '"', 'MALFORMED_JSON', `${label}: expected string`);
    offset += 1;
    let result = '';
    while (offset < text.length) {
      const char = text[offset++];
      if (char === '"') return result;
      if (char === '\\') {
        const escaped = text[offset++];
        const map = { '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' };
        if (escaped === 'u') {
          const hex = text.slice(offset, offset + 4);
          assert(/^[0-9a-fA-F]{4}$/.test(hex), 'MALFORMED_JSON', `${label}: invalid unicode escape`);
          result += String.fromCharCode(Number.parseInt(hex, 16));
          offset += 4;
        } else {
          assert(Object.hasOwn(map, escaped), 'MALFORMED_JSON', `${label}: invalid escape`);
          result += map[escaped];
        }
      } else {
        assert(char.charCodeAt(0) >= 0x20, 'MALFORMED_JSON', `${label}: control character in string`);
        result += char;
      }
    }
    fail('MALFORMED_JSON', `${label}: unterminated string`);
  };
  const value = () => {
    skip();
    const first = text[offset];
    if (first === '"') return string();
    if (first === '{') {
      offset += 1;
      const result = {};
      const keys = new Set();
      skip();
      if (text[offset] === '}') {
        offset += 1;
        return result;
      }
      while (true) {
        skip();
        const key = string();
        assert(!keys.has(key), 'DUPLICATE_JSON_KEY', `${label}: duplicate key ${key}`);
        keys.add(key);
        skip();
        assert(text[offset++] === ':', 'MALFORMED_JSON', `${label}: expected colon`);
        result[key] = value();
        skip();
        if (text[offset] === '}') {
          offset += 1;
          return result;
        }
        assert(text[offset++] === ',', 'MALFORMED_JSON', `${label}: expected comma`);
      }
    }
    if (first === '[') {
      offset += 1;
      const result = [];
      skip();
      if (text[offset] === ']') {
        offset += 1;
        return result;
      }
      while (true) {
        result.push(value());
        skip();
        if (text[offset] === ']') {
          offset += 1;
          return result;
        }
        assert(text[offset++] === ',', 'MALFORMED_JSON', `${label}: expected comma`);
      }
    }
    for (const [literal, parsed] of [['true', true], ['false', false], ['null', null]]) {
      if (text.startsWith(literal, offset)) {
        offset += literal.length;
        return parsed;
      }
    }
    const number = text.slice(offset).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);
    assert(number, 'MALFORMED_JSON', `${label}: invalid value`);
    offset += number[0].length;
    return Number(number[0]);
  };
  const parsed = value();
  skip();
  assert(offset === text.length, 'MALFORMED_JSON', `${label}: trailing bytes`);
  return parsed;
}

export function descriptorReadRegular(filePath, { immutable = false } = {}) {
  const before = lstatSync(filePath, { bigint: true });
  assert(before.isFile(), 'DESCRIPTOR_NOT_REGULAR', `${filePath} is not a regular file`);
  assert(!immutable || before.nlink === 1n, 'RECEIPT_LINK_COUNT', `${filePath} must have nlink=1`);
  assert(!immutable || (before.mode & 0o777n) === 0o444n, 'RECEIPT_MODE', `${filePath} must be mode 0444`);
  let descriptor;
  try {
    descriptor = openSync(filePath, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
    const opened = fstatSync(descriptor, { bigint: true });
    assert(opened.dev === before.dev && opened.ino === before.ino, 'DESCRIPTOR_IDENTITY_DRIFT', `${filePath} changed before open`);
    const bytes = readFileSync(descriptor);
    const after = lstatSync(filePath, { bigint: true });
    assert(after.dev === before.dev && after.ino === before.ino, 'DESCRIPTOR_IDENTITY_DRIFT', `${filePath} changed during read`);
    return { bytes, sha256: sha256(bytes), mode: Number(before.mode & 0o777n), nlink: Number(before.nlink) };
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function readJson(filePath, options) {
  const read = descriptorReadRegular(filePath, options);
  return { ...read, value: parseStrictJson(read.bytes.toString('utf8'), filePath) };
}

function taskNinePaths(taskText) {
  const match = taskText.match(/<!-- TASK127_LEDGER_JSON_BEGIN -->\s*```json\s*([\s\S]*?)\s*```\s*<!-- TASK127_LEDGER_JSON_END -->/);
  assert(match, 'TASK_LEDGER_MISSING', 'Task127 machine ledger markers are absent');
  const ledger = parseStrictJson(match[1], TASK_PATH);
  const ownership = ledger.ownership?.find((entry) => entry.todo === 9);
  assert(Array.isArray(ownership?.outputs), 'TASK_LEDGER_NINE_MISSING', 'Task127 Todo 9 outputs are absent');
  return ownership.outputs;
}

function planNinePaths(planText) {
  const line = planText.split('\n').find((candidate) => candidate.startsWith('| 9 | Todo-5/6/7/11 outputs;'));
  assert(line, 'PLAN_NINE_MISSING', 'plan Todo 9 ownership row is absent');
  const columns = line.split('|');
  assert(columns.length === 5, 'PLAN_NINE_MALFORMED', 'plan Todo 9 ownership row is malformed');
  return [...columns[3].matchAll(/`([^`]+)`/g)].map((match) => match[1]);
}

function assertOrderedPaths(paths, code) {
  assert(Array.isArray(paths) && paths.length === 21, code, 'must contain exactly 21 ordered paths');
  assert(sameJson(paths.slice(0, 20), R6_OWNED_PATHS), code, 'R6 20-path prefix drifted');
  assert(paths[20] === MIGRATION_PATH, code, 'public-cache migration must be ordered path 21');
}

function assertAuthority(receipt, { revision, planSha }) {
  assertKeys(receipt, [
    'allowedTasks', 'authorizationSource', 'authorizationText', 'authorizedAt', 'constraints', 'mode',
    'ownedPaths', 'planName', 'planPath', 'planSHA256', 'receiptType', 'schemaVersion', 'scope', 'sessionId', 'task',
  ], 'RECEIPT_SCHEMA');
  assert(receipt.schemaVersion === 1 && receipt.task === 9 && sameJson(receipt.allowedTasks, [9]), 'RECEIPT_TASK', 'Task 9 authority is required');
  assert(receipt.planName === 'teameet-team-tournament-operations-v1' && receipt.planPath === PLAN_PATH, 'RECEIPT_PLAN_PATH', 'plan path mismatch');
  assert(receipt.planSHA256 === planSha, 'RECEIPT_PLAN_SHA', 'plan SHA mismatch');
  assert(receipt.sessionId === SESSION_ID, 'RECEIPT_SESSION', 'session mismatch');
  assert(receipt.receiptType === `task-9-host-pressure-override-${revision}`, 'RECEIPT_TYPE', 'receipt revision mismatch');
  assert(receipt.mode === 'direct' && receipt.scope === 'host-preflight-only', 'RECEIPT_LOAD_SCOPE', 'load authority scope mismatch');
  assert(
    receipt.authorizationSource === AUTHORIZATION.authorizationSource
      && receipt.authorizationText === AUTHORIZATION.authorizationText
      && receipt.authorizedAt === AUTHORIZATION.authorizedAt
      && sameJson(receipt.constraints, AUTHORIZATION.constraints),
    'RECEIPT_LOAD_AUTHORITY',
    'inherited load authority mismatch',
  );
}

function assertTerminalProvenance(doneClaim) {
  assert(doneClaim.task === 9 && doneClaim.authoritativeV9?.verdict === 'REJECTED_AUTHORITY_ALLOWLIST_ONLY', 'TERMINAL_PROVENANCE_SCHEMA', 'Task 9 terminal provenance is malformed');
  const migrationCriterion = doneClaim.successCriteriaEvidence?.find((entry) => entry.criterion === 'Fresh schema applies the public cache migration.');
  const testCriterion = doneClaim.successCriteriaEvidence?.find((entry) => entry.criterion === 'Public cache is idempotent across official, duplicate, and reordered deliveries and contains only official aggregate data.');
  assert(migrationCriterion?.binaryObservable === 'PASS: 88 migrations found; all migrations successfully applied.', 'TERMINAL_88_MIGRATIONS', 'terminal provenance must record 88 applied migrations');
  assert(testCriterion?.binaryObservable?.startsWith('PASS: 15/15 tests;'), 'TERMINAL_15_TESTS', 'terminal provenance must record 15 passing focused tests');
  assert(
    doneClaim.authoritativeV9?.exactCause === 'R6 ordered20 ownedPaths omitted apps/v1_api/prisma/migrations/20260802000400_v1_public_official_result_cache. The authoritative snapshot therefore contained the schema/code/test changes but only 87 migrations; six tests failed solely because relation v1_game_official_result_cache did not exist.',
    'R6_OMISSION_PROVENANCE',
    'terminal provenance must record the R6 87-migration omission exactly',
  );
}

function validateOnce({ repoRoot }) {
  const resolve = (relativePath) => path.join(repoRoot, relativePath);
  const plan = descriptorReadRegular(resolve(PLAN_PATH));
  const task = descriptorReadRegular(resolve(TASK_PATH));
  const r6 = readJson(resolve(R6_RECEIPT_PATH), { immutable: true });
  const r7 = readJson(resolve(R7_RECEIPT_PATH), { immutable: true });
  const doneClaim = readJson(resolve(TERMINAL_DONE_CLAIM_PATH));
  const planSha = plan.sha256;

  assertAuthority(r6.value, { revision: 'r6', planSha: R6_PLAN_SHA256 });
  assert(sameJson(r6.value.ownedPaths, R6_OWNED_PATHS), 'STALE_R6_RECEIPT', 'R6 receipt must remain exact 20-path predecessor evidence');
  assertAuthority(r7.value, { revision: 'r7', planSha });
  assert(doneClaim.sha256 === TERMINAL_DONE_CLAIM_SHA256, 'TERMINAL_PROVENANCE_SHA', 'terminal DoneClaim SHA mismatch');
  assertTerminalProvenance(doneClaim.value);
  assertOrderedPaths(r7.value.ownedPaths, 'R7_OWNERSHIP_ORDER');
  assertOrderedPaths(planNinePaths(plan.bytes.toString('utf8')), 'PLAN_OWNERSHIP_ORDER');
  assertOrderedPaths(taskNinePaths(task.bytes.toString('utf8')), 'TASK_LEDGER_OWNERSHIP_ORDER');
  assert(
    task.bytes.toString('utf8').includes('Task 9 R7 SERIAL transfer: the exact R6 ordered 20-path prefix remains unchanged.'),
    'TASK_R7_TRANSFER_PROSE',
    'Task127 R7 transfer prose is missing',
  );
  let migration;
  try {
    migration = statSync(resolve(MIGRATION_PATH));
  } catch (error) {
    if (error?.code === 'ENOENT') fail('PUBLIC_CACHE_MIGRATION_MISSING', 'public-cache migration directory is missing');
    throw error;
  }
  assert(migration.isDirectory(), 'PUBLIC_CACHE_MIGRATION_MISSING', 'public-cache migration directory is missing');
  return { planSha, r6ReceiptSha: r6.sha256, r7ReceiptSha: r7.sha256, terminalDoneClaimSha: doneClaim.sha256, receiptLstat: { mode: r7.mode, nlink: r7.nlink } };
}

export async function runBoundedChild({ command, args, timeoutMs = 30_000 }) {
  assert(Number.isInteger(timeoutMs) && timeoutMs > 0 && timeoutMs <= 30_000, 'CHILD_TIMEOUT_ARGUMENT', 'timeout must be an integer no greater than 30000ms');
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let forceTimer;
    const termination = { termSent: false, killSent: false };
    const timer = setTimeout(() => {
      timedOut = true;
      termination.termSent = child.kill('SIGTERM');
      forceTimer = setTimeout(() => {
        termination.killSent = child.kill('SIGKILL');
      }, 250);
    }, timeoutMs);
    const clearTimers = () => {
      clearTimeout(timer);
      if (forceTimer) clearTimeout(forceTimer);
    };
    const processAliveAfterClose = () => {
      try {
        process.kill(child.pid, 0);
        return true;
      } catch (error) {
        if (error?.code === 'ESRCH') return false;
        throw error;
      }
    };
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.once('error', (error) => {
      clearTimers();
      reject(new ReceiptError('CHILD_SPAWN_ERROR', error.message));
    });
    child.once('close', (code, signal) => {
      clearTimers();
      const cleanup = {
        pid: child.pid,
        closeObserved: true,
        exitCode: code,
        signal: signal ?? null,
        processAliveAfterClose: processAliveAfterClose(),
        termination,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
      };
      if (timedOut) {
        const error = new ReceiptError('CHILD_TIMEOUT', `child exceeded ${timeoutMs}ms`);
        error.cleanup = cleanup;
        return reject(error);
      }
      if (code !== 0) {
        const error = new ReceiptError('CHILD_NONZERO', `child exited ${code ?? signal}; stdout=${JSON.stringify(stdout)}`);
        error.cleanup = cleanup;
        return reject(error);
      }
      resolve({ stdout, stderr, cleanup });
    });
  });
}

export async function runExactReceiptHarness({ repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'), runs = 3, child = null } = {}) {
  assert(Number.isInteger(runs) && runs === 3, 'RUN_COUNT', 'exact harness requires exactly three serial runs');
  const childSpec = child ?? { command: process.execPath, args: ['-e', 'process.stdout.write("R7_CHILD_PASS\\n")'] };
  const observations = [];
  for (let run = 1; run <= runs; run += 1) {
    const descriptor = validateOnce({ repoRoot });
    const childResult = await runBoundedChild({ ...childSpec, timeoutMs: 30_000 });
    observations.push({ run, descriptor, child: { cleanup: childResult.cleanup } });
  }
  const childClosures = observations.map((observation) => observation.child.cleanup);
  return {
    verdict: 'PASS',
    runs: observations,
    interactions: { prompts: 0, cancellations: 0 },
    cleanup: {
      childClosures,
      noLiveOwnedChildren: childClosures.every((closure) => closure.closeObserved && !closure.processAliveAfterClose),
    },
  };
}

async function main() {
  assert(process.argv.length === 2, 'MALFORMED_ARGUMENTS', 'the exact descriptor invocation accepts no arguments');
  const result = await runExactReceiptHarness();
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.code ?? 'UNEXPECTED_ERROR'}: ${error.message}\n`);
    process.exitCode = 1;
  });
}
