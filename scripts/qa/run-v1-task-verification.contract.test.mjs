import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import {
  chmodSync,
  closeSync,
  constants,
  cpSync,
  existsSync,
  fsyncSync,
  lstatSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
  writeSync,
} from 'node:fs';
import { test } from 'node:test';
import { dirname, join, resolve } from 'node:path';
import { descriptorRead } from './verify-team-tournament-bound-sources.mjs';

const repoRoot = resolve(import.meta.dirname, '../..');
const planSHA = 'dc4ecb2f76592799f8460135d9ea755a6e8fd768de17a29af7e61cf2b21508dd';
const workload = 'task-1-host-supervisor-v1';
const image = 'teameet-v1-verification:node22-pnpm9.15.4';
const baselineSHA = '71f67b0d24e272eecd216cebb31eefbd66c9ca02';
const restartHeadSHA = 'a4823d2f575d9396323421024a81a63dacf0cf67';
const nodeMcpOverridePath =
  '.omo/evidence/task-1-node-mcp-growth-override-dc4ecb2f.json';
const nodeMcpOverrideSHA =
  '08714fb7985dc7d71931e86cb8926f55bff48d52a035211a6c7b216d4c1d36ed';
const relativeGrowthOverridePath =
  '.omo/evidence/task-1-relative-growth-override-dc4ecb2f.json';
const relativeGrowthOverrideSHA =
  '2a1b41aedcece05f389e53fc639d732d6e01c2b886a9762286f3c0a66de7ca36';

function runNode(args, options = {}) {
  return spawnSync(process.execPath, args, {
    cwd: options.cwd ?? repoRoot,
    encoding: 'utf8',
    env: options.env ?? process.env,
    timeout: options.timeout ?? 30_000,
  });
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

function immutableReceiptAt(receiptPath, value) {
  return immutableBytesAt(receiptPath, Buffer.from(JSON.stringify(stable(value))));
}

function immutableBytesAt(receiptPath, bytes) {
  const descriptor = openSync(
    receiptPath,
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
    0o444,
  );
  try {
    writeFileSync(descriptor, bytes);
    fsyncSync(descriptor);
    chmodSync(receiptPath, 0o444);
  } finally {
    closeSync(descriptor);
  }
  const parent = openSync(
    dirname(receiptPath),
    constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
  );
  try {
    fsyncSync(parent);
  } finally {
    closeSync(parent);
  }
  return { path: receiptPath, sha256: sha256(bytes) };
}

function immutableReceipt(directory, value) {
  return immutableReceiptAt(join(directory, 'host-supervisor.json'), value);
}

function gitTreeIdentity(treeish, ownedPath) {
  const entry = spawnSync('git', ['ls-tree', '-z', treeish, '--', ownedPath], {
    cwd: repoRoot,
    encoding: null,
  });
  assert.equal(entry.status, 0, entry.stderr?.toString('utf8'));
  const records = entry.stdout.toString('utf8').split('\0').filter(Boolean);
  if (records.length === 0) return { state: 'deleted' };
  assert.equal(records.length, 1);
  const match = records[0].match(/^(\d+) (blob|tree|commit) ([0-9a-f]+)\t([\s\S]+)$/);
  assert.ok(match);
  assert.equal(match[4], ownedPath);
  const object = spawnSync('git', ['cat-file', match[2], match[3]], {
    cwd: repoRoot,
    encoding: null,
  });
  assert.equal(object.status, 0, object.stderr?.toString('utf8'));
  return {
    state: 'present',
    mode: match[1],
    type: match[2],
    blob: match[3],
    sha256: sha256(object.stdout),
    size: object.stdout.length,
  };
}

function candidateSourceManifest(temporaryDirectory, ledger) {
  const ownedPaths = ledger.ownership.find(({ todo }) => todo === 1).outputs;
  const sourceTree = spawnSync('git', ['rev-parse', 'HEAD^{tree}'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  assert.equal(sourceTree.status, 0, sourceTree.stderr);
  const sourceTreeSHA = sourceTree.stdout.trim();
  const sourceManifest = {
    schemaVersion: 2,
    task: 1,
    attemptId: `contract-candidate-${sourceTreeSHA.slice(0, 12)}`,
    baselineSHA,
    headSHA: restartHeadSHA,
    sourceTreeSHA,
    ownedPaths,
    entries: ownedPaths.map((ownedPath) => {
      const candidate = gitTreeIdentity(sourceTreeSHA, ownedPath);
      return {
        path: ownedPath,
        state: candidate.state,
        baseline: gitTreeIdentity(baselineSHA, ownedPath),
        head: gitTreeIdentity(restartHeadSHA, ownedPath),
        candidate,
      };
    }),
    createdAt: '2026-07-30T10:00:00.000Z',
  };
  const sourceManifestPath = join(temporaryDirectory, 'source-manifest.json');
  const receipt = immutableReceiptAt(sourceManifestPath, sourceManifest);
  return {
    sourceManifest,
    sourceManifestPath,
    sourceManifestSHA: receipt.sha256,
  };
}

function candidateFixture({
  mutateCandidate = (value) => value,
  mutateWorktree = () => {},
  nodeMcpCount = 0,
  browserCount = 0,
  processSnapshots = null,
} = {}) {
  const temporaryDirectory = mkdtempSync(
    '/private/tmp/teameet-v1-candidate-contract-',
  );
  const worktree = join(temporaryDirectory, 'worktree');
  const index = join(temporaryDirectory, 'index');
  const fixtureBin = join(temporaryDirectory, 'bin');
  mkdirSync(worktree);
  mkdirSync(fixtureBin);
  const fixturePs = join(fixtureBin, 'ps');
  const snapshots = processSnapshots ?? [{ nodeMcpCount, browserCount }];
  const snapshotCases = snapshots.map((snapshot, index) => [
    `${index})`,
    `  node_count=${snapshot.nodeMcpCount}`,
    `  browser_count=${snapshot.browserCount}`,
    '  ;;',
  ].join('\n'));
  const lastSnapshot = snapshots.at(-1);
  const processState = join(temporaryDirectory, 'ps-call-count');
  writeFileSync(
    fixturePs,
    [
      '#!/bin/sh',
      `state_file=${JSON.stringify(processState)}`,
      'call_count=0',
      'if [ -f "$state_file" ]; then',
      '  call_count=$(sed -n "1p" "$state_file")',
      'fi',
      'case "$call_count" in',
      ...snapshotCases,
      '*)',
      `  node_count=${lastSnapshot.nodeMcpCount}`,
      `  browser_count=${lastSnapshot.browserCount}`,
      '  ;;',
      'esac',
      'printf "%s\\n" "$((call_count + 1))" > "$state_file"',
      'index=0',
      'while [ "$index" -lt "$node_count" ]; do',
      '  printf "%s 1 node fixture-mcp\\n" "$((1000 + index))"',
      '  index=$((index + 1))',
      'done',
      'index=0',
      'while [ "$index" -lt "$browser_count" ]; do',
      '  printf "%s 1 Chrome fixture-browser\\n" "$((2000 + index))"',
      '  index=$((index + 1))',
      'done',
      '',
    ].join('\n'),
  );
  chmodSync(fixturePs, 0o755);
  const archive = spawnSync('git', ['archive', '--format=tar', 'HEAD'], {
    cwd: repoRoot,
    encoding: null,
    maxBuffer: 512 * 1024 * 1024,
  });
  assert.equal(archive.status, 0, archive.stderr?.toString('utf8'));
  const extracted = spawnSync('tar', ['-xf', '-', '-C', worktree], {
    input: archive.stdout,
    encoding: 'utf8',
  });
  assert.equal(extracted.status, 0, extracted.stderr);
  const ledgerText = readFileSync(
    join(worktree, '.github/tasks/127-v1-team-tournament-operations-game-record.md'),
    'utf8',
  );
  const ledgerMatch = ledgerText.match(
    /<!-- TASK127_LEDGER_JSON_BEGIN -->\s*```json\n([\s\S]*?)\n```\s*<!-- TASK127_LEDGER_JSON_END -->/,
  );
  assert.ok(ledgerMatch);
  const ledger = JSON.parse(ledgerMatch[1]);
  const fixtureOnlyPaths = [
    '.omo/plans/teameet-team-tournament-operations-v1.md',
    '.omo/evidence/approved-task-1-clean-restart-v0-dc4ecb2f.json',
    '.omo/evidence/task-1-task127-clean-restart-cursor-dc4ecb2f.json',
    '.omo/evidence/task-1-host-pressure-override-dc4ecb2f-r2.json',
    '.omo/evidence/task-1-v0-execution-consumption-dc4ecb2f.json',
    '.omo/evidence/task-1-rollback-a-recovered.json',
    '.omo/evidence/task-1-host-supervisor-receipt-dc4ecb2f-r6.json',
    nodeMcpOverridePath,
    relativeGrowthOverridePath,
  ];
  for (const path of [
    ...ledger.unrelatedDirty.paths.map((entry) => entry.path),
    ...fixtureOnlyPaths,
  ]) {
    const source = join(repoRoot, path);
    const target = join(worktree, path);
    mkdirSync(dirname(target), { recursive: true });
    cpSync(source, target);
  }
  const gitEnvironment = {
    PATH: `${fixtureBin}:${process.env.PATH}`,
    HOME: process.env.HOME,
    LANG: 'C.UTF-8',
    TZ: 'UTC',
    GIT_DIR: join(repoRoot, '.git'),
    GIT_WORK_TREE: worktree,
    GIT_INDEX_FILE: index,
  };
  const indexResult = spawnSync('git', ['read-tree', 'HEAD'], {
    cwd: worktree,
    env: gitEnvironment,
    encoding: 'utf8',
  });
  assert.equal(indexResult.status, 0, indexResult.stderr);
  const {
    sourceManifest,
    sourceManifestPath,
    sourceManifestSHA,
  } = candidateSourceManifest(temporaryDirectory, ledger);
  const candidateSHA = spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd: worktree,
    env: gitEnvironment,
    encoding: 'utf8',
  }).stdout.trim();
  const candidateValue = mutateCandidate({
      schemaVersion: 1,
      phase: 'candidate',
      baselineSHA: '71f67b0d24e272eecd216cebb31eefbd66c9ca02',
      restartHeadSHA: 'a4823d2f575d9396323421024a81a63dacf0cf67',
      candidateSHA,
      sourceTreeSHA: sourceManifest.sourceTreeSHA,
      sourceManifestPath,
      sourceManifestSHA,
      planSHA,
      approvalReceipt: {
        path: '.omo/evidence/approved-task-1-clean-restart-v0-dc4ecb2f.json',
        sha256: 'd30d3688ef97b0cefabfad3e6deb8343bb9e8b8f017bae0ff91572be901527ae',
      },
      task127CursorReceipt: {
        path: '.omo/evidence/task-1-task127-clean-restart-cursor-dc4ecb2f.json',
        sha256: '0946bd0170f9034fdc4c5d99803e2b0ecf7afb46344988e9903933bcee55d9a7',
      },
      overrideReceipt: {
        path: '.omo/evidence/task-1-host-pressure-override-dc4ecb2f-r2.json',
        sha256: '84ab59119f5f83bcffed1478faa50b185b0c02bbb3ca5ecc37822a3c49e92748',
      },
      consumptionReceipt: {
        path: '.omo/evidence/task-1-v0-execution-consumption-dc4ecb2f.json',
        sha256: '6cfd41dcbb56bbb07fe3dfb5eb208f2449b8dbb90cef6742618b75481d8ecac4',
      },
      ownedPathBlobs: sourceManifest.entries.map(({ path, candidate: entry }) => ({
        path,
        mode: entry.mode,
        blobSHA: entry.blob,
      })),
      createdAt: '2026-07-30T10:00:00.000Z',
    });
  const candidate = immutableReceiptAt(
    join(temporaryDirectory, 'candidate.json'),
    candidateValue,
  );
  mutateWorktree({ worktree, ledger, candidateValue });
  return {
    candidate,
    candidateSHA,
    environment: {
      ...gitEnvironment,
      OMO_SELECTED_PLAN_SHA: planSHA,
    },
    evidenceRoot: join(temporaryDirectory, 'evidence'),
    sourceManifest,
    sourceManifestPath,
    sourceManifestSHA,
    worktree,
    cleanup: () => rmSync(temporaryDirectory, { recursive: true, force: true }),
  };
}

function candidateCommand(
  fixture,
  {
    nodeMcpOverride = null,
    relativeGrowthOverride = null,
  } = {},
) {
  return [
    resolve(repoRoot, 'scripts/qa/run-v1-task-verification.mjs'),
    '--task',
    '1',
    '--phase',
    'candidate',
    '--plan-sha',
    planSHA,
    '--candidate-receipt',
    fixture.candidate.path,
    '--candidate-receipt-sha',
    fixture.candidate.sha256,
    '--require-host-supervisor-receipt',
    resolve(fixture.worktree, '.omo/evidence/task-1-host-supervisor-receipt-dc4ecb2f-r6.json'),
    '--require-host-supervisor-receipt-sha',
    'd041831fa37ea9e12301a1e934be855e6094f88beac109ed7735ed456fb6f698',
    ...(nodeMcpOverride
      ? [
          '--require-node-mcp-override-receipt',
          nodeMcpOverride.path,
          '--require-node-mcp-override-receipt-sha',
          nodeMcpOverride.sha256,
        ]
      : []),
    ...(relativeGrowthOverride?.path
      ? [
          '--require-relative-growth-override-receipt',
          relativeGrowthOverride.path,
        ]
      : []),
    ...(relativeGrowthOverride?.sha256
      ? [
          '--require-relative-growth-override-receipt-sha',
          relativeGrowthOverride.sha256,
        ]
      : []),
    '--evidence-root',
    fixture.evidenceRoot,
    '--',
    'node',
    '-e',
    'process.exit(0)',
  ];
}

function relativeGrowthReceiptDescriptor() {
  const receiptPath = resolve(repoRoot, relativeGrowthOverridePath);
  const stat = lstatSync(receiptPath);
  assert.equal(stat.isFile(), true);
  assert.equal(stat.isSymbolicLink(), false);
  assert.equal((stat.mode & 0o777).toString(8), '444');
  assert.equal(stat.nlink, 1);
  const descriptor = descriptorRead(receiptPath);
  assert.equal(descriptor.sha256, relativeGrowthOverrideSHA);
  const receipt = JSON.parse(descriptor.bytes.toString('utf8'));
  return {
    ...descriptor,
    receipt,
    waivers: {
      nodeMcpGrowth: true,
      browserRelativeGrowth: true,
    },
  };
}

function taskOneHostGateFunction(assertPortsFree = () => {}) {
  const source = readFileSync(
    join(repoRoot, 'scripts/qa/run-v1-task-verification.mjs'),
    'utf8',
  );
  const start = source.indexOf('function assertTaskOneHostGates(');
  assert.notEqual(start, -1);
  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  let end = -1;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') depth -= 1;
    if (depth === 0) {
      end = index + 1;
      break;
    }
  }
  assert.notEqual(end, -1);
  const declaration = source.slice(start, end);
  class TestHarnessError extends Error {
    constructor(code, message, exitCode) {
      super(message);
      this.code = code;
      this.exitCode = exitCode;
    }
  }
  return Function(
    'assertPortsFree',
    'HarnessError',
    `${declaration}; return assertTaskOneHostGates;`,
  )(assertPortsFree, TestHarnessError);
}

function hostPressureOverrideFunction({
  receipt,
  sha256: receiptSHA = 'fixture-receipt-sha',
  overridePath = '.omo/start-work/host-pressure-override-plan.json',
} = {}) {
  const source = readFileSync(
    join(repoRoot, 'scripts/qa/run-v1-task-verification.mjs'),
    'utf8',
  );
  const start = source.indexOf('function verifyOverride(');
  assert.notEqual(start, -1);
  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  let end = -1;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') depth -= 1;
    if (depth === 0) {
      end = index + 1;
      break;
    }
  }
  assert.notEqual(end, -1);
  const declaration = source.slice(start, end);
  class TestHarnessError extends Error {
    constructor(code, message, exitCode) {
      super(message);
      this.code = code;
      this.exitCode = exitCode;
    }
  }
  return Function(
    'resolve',
    'PLAN_PATH',
    'OVERRIDE_PATH',
    'HISTORICAL_TASK_ONE_OVERRIDE_PATH',
    'HISTORICAL_TASK_ONE_OVERRIDE_SHA256',
    'TASK_FIVE_ELEVEN_PRESSURE_B_OVERRIDE_PATH',
    'TASK_FIVE_ELEVEN_PRESSURE_B_OVERRIDE_SHA256',
    'OVERRIDE_SHA256',
    'VERIFICATION_SESSION_ID',
    'secureImmutableDescriptor',
    'HarnessError',
    'join',
    'randomUUID',
    'constants',
    'openSync',
    'writeSync',
    'fsyncSync',
    'closeSync',
    'renameSync',
    'rmSync',
    'mkdirSync',
    'lstatSync',
    'existsSync',
    'readFileSync',
    'spawnSync',
    `${declaration}; return verifyOverride;`,
  )(
    resolve,
    '.omo/plans/teameet-team-tournament-operations-v1.md',
    overridePath,
    '.omo/start-work/host-pressure-override-task-1.json',
    '2042407ad7b8f634f118d4ee9f0154ad1503564ceeac5874c6681f458e8c16da',
    '.omo/start-work/host-pressure-override-task-5-11.json',
    '41c14d9181fcac1e25296b7d363a54df974f833df03894e2e33a11e9a58b355c',
    '2c04e6621fccb1017838c6b479ac8addabba9061852654cec4c893ed588631c2',
    'codex:019fa9b3-efe1-75e0-811d-d2d03b08f027',
    (path, expectedSHA, code, exitCode) => {
      if (receiptSHA !== expectedSHA) {
        throw new TestHarnessError(code, 'fixture receipt digest mismatch', exitCode);
      }
      return {
        path: resolve(repoRoot, overridePath),
        sha256: receiptSHA,
        receipt,
      };
    },
    TestHarnessError,
    join,
    randomUUID,
    constants,
    openSync,
    writeSync,
    fsyncSync,
    closeSync,
    renameSync,
    rmSync,
    mkdirSync,
    lstatSync,
    (path) => {
      try {
        lstatSync(path);
        return true;
      } catch {
        return false;
      }
    },
    readFileSync,
    spawnSync,
  );
}

function pressureBReceipt(mutate = (receipt) => receipt) {
  return mutate({
    absoluteCaps: {
      browserCountAtMost: 200,
      loadAverageAtMost: 24,
      nodeMcpCountAtMost: 1100,
    },
    allowedTasks: [11, 5],
    authorizationSource: 'user-message',
    baselineGrowthCaps: {
      browserCountIncreaseLessThan: 20,
      nodeMcpCountIncreaseLessThan: 50,
      swapUsedMiBIncreaseLessThan: 2048,
    },
    createdAt: '2026-07-31T04:15:00.000Z',
    dockerMustBeAvailable: true,
    plan: '.omo/plans/teameet-team-tournament-operations-v1.md',
    planSHA256: '15fbcdcfff57d01730888eb3728edbd869f1d5ff24f656d18c7a5c9b1d2985a5',
    receiptType: 'task-5-11-pressure-b-host-override',
    resourceLimits: { cpus: 1, memoryBytes: 4294967296, pidsLimit: 256 },
    schemaVersion: 1,
    scope: 'task-5-11-pressure-b',
    sequence: { cleanupBetweenTasks: true, firstTask: 11, secondTask: 5 },
    sessionId: 'codex:019fa9b3-efe1-75e0-811d-d2d03b08f027',
    singleUse: true,
    targetPorts: [3013, 8121],
    taskExecution: {
      maxConcurrency: 1,
      mixedAttemptsAllowed: false,
      parallelAllowed: false,
    },
  });
}

function pressureBPreflight(mutate = (value) => value) {
  const baseline = {
    browserCount: 58,
    nodeMcpCount: 913,
    swapUsedGB: 7.0380859375,
  };
  const current = {
    browserCount: 58,
    docker: { state: 'available' },
    loadAverage: [6.1142578125, 0, 0],
    nodeMcpCount: 911,
    swapUsedGB: 7.0380859375,
    targetPorts: { 3013: [], 8121: [] },
  };
  return mutate({ baseline, current });
}

function withPressureBEnvironment(callback) {
  const previousReceipt = process.env.V1_HOST_PRESSURE_OVERRIDE_RECEIPT;
  const previousSession = process.env.V1_VERIFICATION_SESSION_ID;
  const overridePath = '.omo/start-work/host-pressure-override-task-5-11.json';
  process.env.V1_HOST_PRESSURE_OVERRIDE_RECEIPT = resolve(repoRoot, overridePath);
  process.env.V1_VERIFICATION_SESSION_ID =
    'codex:019fa9b3-efe1-75e0-811d-d2d03b08f027';
  const restore = () => {
    if (previousReceipt === undefined) {
      delete process.env.V1_HOST_PRESSURE_OVERRIDE_RECEIPT;
    } else {
      process.env.V1_HOST_PRESSURE_OVERRIDE_RECEIPT = previousReceipt;
    }
    if (previousSession === undefined) {
      delete process.env.V1_VERIFICATION_SESSION_ID;
    } else {
      process.env.V1_VERIFICATION_SESSION_ID = previousSession;
    }
  };
  try {
    const result = callback({
      overridePath,
      plan: {
        rawSHA: '15fbcdcfff57d01730888eb3728edbd869f1d5ff24f656d18c7a5c9b1d2985a5',
        normalizedSHA: 'different-normalized-plan-sha',
      },
    });
    if (result && typeof result.then === 'function') return result.finally(restore);
    restore();
    return result;
  } catch (error) {
    restore();
    throw error;
  }
}

function pressureBLifecycleContext(stateRoot, attemptId, stage) {
  return {
    attemptId,
    commandHash: '8b1b9f3c0c22c7e34c9d97fb1209302dc892a5c52c4ee1ca617a1a7d1b0ab7cd',
    stage,
    stateRoot,
  };
}

function withPressureBLifecycle(callback) {
  const stateRoot = mkdtempSync('/private/tmp/teameet-pressure-b-lifecycle-');
  const cleanup = () => rmSync(stateRoot, { recursive: true, force: true });
  try {
    const result = withPressureBEnvironment(({ overridePath, plan }) => {
      const verifyOverride = hostPressureOverrideFunction({
        overridePath,
        receipt: pressureBReceipt(),
        sha256: '41c14d9181fcac1e25296b7d363a54df974f833df03894e2e33a11e9a58b355c',
      });
      const { baseline, current } = pressureBPreflight();
      return callback({ baseline, current, plan, stateRoot, verifyOverride });
    });
    if (result && typeof result.then === 'function') {
      return result.finally(cleanup);
    }
    cleanup();
    return result;
  } catch (error) {
    cleanup();
    throw error;
  }
}

function pressureBChildScript() {
  return `
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { chmodSync, closeSync, constants, existsSync, fsyncSync, lstatSync, mkdirSync as nativeMkdirSync, openSync, readFileSync, renameSync, rmSync, writeFileSync, writeSync } from 'node:fs';
import { join, resolve } from 'node:path';
const [repoRoot, stateRoot, attemptId, stage, mode, signalPath, receiptText] = process.argv.slice(2);
const receipt = JSON.parse(receiptText);
const source = readFileSync(join(repoRoot, 'scripts/qa/run-v1-task-verification.mjs'), 'utf8');
const start = source.indexOf('function verifyOverride(');
const bodyStart = source.indexOf('{', start);
let depth = 0;
let end = -1;
for (let index = bodyStart; index < source.length; index += 1) {
  if (source[index] === '{') depth += 1;
  if (source[index] === '}') depth -= 1;
  if (depth === 0) { end = index + 1; break; }
}
class HarnessError extends Error { constructor(code, message, exitCode) { super(message); this.code = code; this.exitCode = exitCode; } }
const expectedReceiptSHA = '41c14d9181fcac1e25296b7d363a54df974f833df03894e2e33a11e9a58b355c';
const controlledMkdirSync = (path, options) => nativeMkdirSync(path, options);
const controlledRenameSync = (sourcePath, targetPath) => {
  const result = renameSync(sourcePath, targetPath);
  if (mode === 'hold-lock' && targetPath.endsWith('/pressure-b-state.json.lock')) {
    const ownerPath = join(targetPath, 'owner.json');
    const owner = JSON.parse(readFileSync(ownerPath, 'utf8'));
    writeFileSync(signalPath, JSON.stringify({
      pid: process.pid,
      lockPath: targetPath,
      owner,
    }), { flag: 'wx', mode: 0o600 });
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 30_000);
  }
  if (mode === 'hold-recovery' && targetPath.includes('.recover-')) {
    const ownerPath = join(targetPath, 'owner.json');
    const owner = JSON.parse(readFileSync(ownerPath, 'utf8'));
    writeFileSync(signalPath, JSON.stringify({
      pid: process.pid,
      phase: 'recovered',
      tombstonePath: targetPath,
      owner,
    }), { flag: 'wx', mode: 0o600 });
    const releasePath = signalPath + '.release';
    const deadline = Date.now() + 30_000;
    while (!existsSync(releasePath)) {
      if (Date.now() >= deadline) throw new Error('Timed out waiting for recovery release');
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
    }
  }
  return result;
};
const verifyOverride = Function(
  'resolve', 'PLAN_PATH', 'OVERRIDE_PATH', 'HISTORICAL_TASK_ONE_OVERRIDE_PATH', 'HISTORICAL_TASK_ONE_OVERRIDE_SHA256',
  'TASK_FIVE_ELEVEN_PRESSURE_B_OVERRIDE_PATH', 'TASK_FIVE_ELEVEN_PRESSURE_B_OVERRIDE_SHA256', 'OVERRIDE_SHA256',
  'VERIFICATION_SESSION_ID', 'secureImmutableDescriptor', 'HarnessError', 'join', 'randomUUID', 'constants', 'openSync',
  'writeSync', 'fsyncSync', 'closeSync', 'renameSync', 'rmSync', 'mkdirSync', 'lstatSync', 'existsSync', 'readFileSync', 'spawnSync',
  source.slice(start, end) + '; return verifyOverride;',
)(
  resolve, '.omo/plans/teameet-team-tournament-operations-v1.md', '.omo/start-work/host-pressure-override-plan.json',
  '.omo/start-work/host-pressure-override-task-1.json', '2042407ad7b8f634f118d4ee9f0154ad1503564ceeac5874c6681f458e8c16da',
  '.omo/start-work/host-pressure-override-task-5-11.json', expectedReceiptSHA,
  '2c04e6621fccb1017838c6b479ac8addabba9061852654cec4c893ed588631c2', 'codex:019fa9b3-efe1-75e0-811d-d2d03b08f027',
  (path, expectedSHA, code, exitCode) => {
    if (expectedSHA !== expectedReceiptSHA) throw new HarnessError(code, 'unexpected fixture receipt SHA', exitCode);
    return { path, sha256: expectedReceiptSHA, receipt };
  },
  HarnessError, join, randomUUID, constants, openSync, writeSync, fsyncSync, closeSync, controlledRenameSync, rmSync,
  controlledMkdirSync, lstatSync, existsSync, readFileSync, spawnSync,
);
process.env.V1_HOST_PRESSURE_OVERRIDE_RECEIPT = resolve(repoRoot, '.omo/start-work/host-pressure-override-task-5-11.json');
process.env.V1_VERIFICATION_SESSION_ID = 'codex:019fa9b3-efe1-75e0-811d-d2d03b08f027';
const baseline = { browserCount: 58, nodeMcpCount: 913, swapUsedGB: 7.0380859375 };
const current = { browserCount: 58, docker: { state: 'available' }, loadAverage: [6, 0, 0], nodeMcpCount: 911, swapUsedGB: 7.0380859375, targetPorts: { 3013: [], 8121: [] } };
try {
  const result = verifyOverride(repoRoot, { rawSHA: receipt.planSHA256, normalizedSHA: 'normalized' }, stage === 'V11' ? 11 : 5, ['NODE_MCP_PROCESS_PROLIFERATION'], current, baseline, { attemptId, commandHash: '8b1b9f3c0c22c7e34c9d97fb1209302dc892a5c52c4ee1ca617a1a7d1b0ab7cd', stage, stateRoot });
  if (mode === 'complete-v11-success') result.completePressureBLifecycle({ successful: true, cleanupVerified: true });
  if (mode === 'complete-v11-failed' || mode === 'complete-v5-failed') result.completePressureBLifecycle({ successful: false, cleanupVerified: true });
  process.stdout.write(JSON.stringify({ ok: true, stage: result.pressureBTransition?.stage ?? null }) + '\\n');
} catch (error) {
  process.stderr.write(JSON.stringify({ ok: false, code: error.code ?? 'UNEXPECTED', message: error.message }) + '\\n');
  process.exitCode = error.exitCode ?? 70;
}
`;
}

function startPressureBChild(fixturePath, stateRoot, attemptId, stage, mode, signalPath = '') {
  const child = spawn(process.execPath, [
    fixturePath,
    repoRoot,
    stateRoot,
    attemptId,
    stage,
    mode,
    signalPath,
    JSON.stringify(pressureBReceipt()),
  ], { cwd: repoRoot, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  const completed = new Promise((resolveChild, rejectChild) => {
    child.once('error', rejectChild);
    child.once('close', (code, signal) => resolveChild({ child, code, signal, stdout, stderr }));
  });
  return { child, completed };
}

async function waitForPressureBSignal(signalPath, timeoutMs = 2_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (existsSync(signalPath)) return JSON.parse(readFileSync(signalPath, 'utf8'));
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 10));
  }
  throw new Error(`Timed out waiting for pressure-B signal: ${signalPath}`);
}

function assertNoPressureBLockResidue(stateRoot) {
  const residue = readdirSync(stateRoot).filter((entry) =>
    entry === 'pressure-b-state.json.lock' ||
    entry.startsWith('pressure-b-state.json.lock.pending-') ||
    entry.startsWith('pressure-b-state.json.lock.recover-'));
  assert.deepEqual(residue, [], 'canonical, pending, and recovery lock paths must be absent before teardown');
}

async function withPressureBChildFixture(callback) {
  const stateRoot = mkdtempSync('/private/tmp/teameet-pressure-b-child-');
  const fixturePath = join(stateRoot, 'pressure-b-child.mjs');
  writeFileSync(fixturePath, pressureBChildScript(), { mode: 0o600 });
  const children = new Set();
  const start = (attemptId, stage, mode, signalPath = '', root = stateRoot) => {
    const run = startPressureBChild(
      fixturePath,
      root,
      attemptId,
      stage,
      mode,
      signalPath,
    );
    children.add(run.child);
    run.completed.finally(() => children.delete(run.child));
    return run;
  };
  try {
    return await callback({ stateRoot, start });
  } finally {
    for (const child of children) {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    }
    rmSync(stateRoot, { recursive: true, force: true });
    assert.equal(existsSync(stateRoot), false, 'test-owned pressure-B fixture root must be removed');
  }
}

test('pressure-B V11-first receipt accepts only the bounded serial contract', () => {
  withPressureBLifecycle(({ baseline, current, plan, stateRoot, verifyOverride }) => {
    const lifecycle = pressureBLifecycleContext(stateRoot, 'attempt-v11', 'V11');
    const result = verifyOverride(
      repoRoot,
      plan,
      11,
      ['NODE_MCP_PROCESS_PROLIFERATION'],
      current,
      baseline,
      lifecycle,
    );
    assert.equal(result.applied, true);
    assert.equal(
      result.completePressureBLifecycle({ successful: true, cleanupVerified: true }).stage,
      'v11-complete',
    );
  });
});

test('pressure-B consumes a valid V11 authority exactly once', () => {
  withPressureBLifecycle(({ baseline, current, plan, stateRoot, verifyOverride }) => {
    const lifecycle = pressureBLifecycleContext(stateRoot, 'attempt-v11', 'V11');
    const firstV11 = verifyOverride(
        repoRoot,
        plan,
        11,
        ['NODE_MCP_PROCESS_PROLIFERATION'],
        current,
        baseline,
        lifecycle,
      );
    assert.equal(firstV11.applied, true);
    assert.equal(
      firstV11.completePressureBLifecycle({ successful: true, cleanupVerified: true }).stage,
      'v11-complete',
    );
    const firstV5 = verifyOverride(
      repoRoot,
      plan,
      5,
      ['NODE_MCP_PROCESS_PROLIFERATION'],
      current,
      baseline,
      pressureBLifecycleContext(stateRoot, 'attempt-v11', 'V5'),
    );
    assert.equal(firstV5.applied, true);
    assert.equal(firstV5.pressureBTransition.stage, 'v5-claimed');
    assert.equal(
      firstV5.completePressureBLifecycle({ successful: true, cleanupVerified: true }).stage,
      'v5-complete',
    );
    assert.throws(
      () => verifyOverride(
        repoRoot,
        plan,
        11,
        ['NODE_MCP_PROCESS_PROLIFERATION'],
        current,
        baseline,
        lifecycle,
      ),
      (error) => error.code === 'HOST_PRESSURE_OVERRIDE_INVALID',
      'an identical valid V11 claim must be consumed after its first use',
    );
  });
});

test('pressure-B rejects V5 until the exact V11 cleanup transition exists', () => {
  withPressureBLifecycle(({ baseline, current, plan, stateRoot, verifyOverride }) => {
    assert.throws(
      () => verifyOverride(
        repoRoot,
        plan,
        5,
        ['NODE_MCP_PROCESS_PROLIFERATION'],
        current,
        baseline,
        pressureBLifecycleContext(stateRoot, 'attempt-v5', 'V5'),
      ),
      (error) => error.code === 'HOST_PRESSURE_OVERRIDE_INVALID',
      'Task 5 cannot claim pressure-B authority before a successful V11 cleanup receipt',
    );
  });
});

test('pressure-B allows one competing V11 claimant and rejects stale or mixed attempts', async () => {
  return withPressureBLifecycle(async ({ baseline, current, plan, stateRoot, verifyOverride }) => {
    const invoke = (attemptId, task, stage) => Promise.resolve().then(() =>
      verifyOverride(
        repoRoot,
        plan,
        task,
        ['NODE_MCP_PROCESS_PROLIFERATION'],
        current,
        baseline,
        pressureBLifecycleContext(stateRoot, attemptId, stage),
      ));
    const claims = await Promise.allSettled([
      invoke('attempt-a', 11, 'V11'),
      invoke('attempt-b', 11, 'V11'),
      invoke('attempt-b', 5, 'V5'),
    ]);
    assert.deepEqual(
      claims.map(({ status }) => status),
      ['fulfilled', 'rejected', 'rejected'],
      'exactly one V11 claimant may win; stale and mixed-attempt claims must fail',
    );
  });
});

test('pressure-B has exactly one real cross-process V11 claimant', async () => {
  await withPressureBChildFixture(async ({ stateRoot, start }) => {
    const first = start('process-a', 'V11', 'claim');
    const second = start('process-b', 'V11', 'claim');
    const results = await Promise.all([first.completed, second.completed]);
    assert.equal(results.filter(({ code }) => code === 0).length, 1);
    assert.equal(results.filter(({ code }) => code === 75).length, 1);
    const state = JSON.parse(readFileSync(join(stateRoot, 'pressure-b-state.json'), 'utf8'));
    assert.equal(state.stage, 'v11-claimed');
    assert.equal(existsSync(join(stateRoot, 'pressure-b-state.json.lock')), false);
  });
});

test('pressure-B recovers a killed lock owner through bounded authenticated state', async () => {
  await withPressureBChildFixture(async ({ stateRoot, start }) => {
    const signalPath = join(stateRoot, 'lock-owner.json');
    const owner = start('killed-owner', 'V11', 'hold-lock', signalPath);
    const signal = await waitForPressureBSignal(signalPath);
    assert.equal(signal.pid, owner.child.pid);
    const lockPath = join(stateRoot, 'pressure-b-state.json.lock');
    const publishedOwner = JSON.parse(readFileSync(join(lockPath, 'owner.json'), 'utf8'));
    assert.equal(signal.lockPath, lockPath);
    assert.deepEqual(signal.owner, publishedOwner);
    assert.equal(publishedOwner.pid, owner.child.pid);
    const ownerIdentity = spawnSync('ps', ['-o', 'lstart=', '-p', String(owner.child.pid)], {
      encoding: 'utf8',
    });
    assert.equal(ownerIdentity.status, 0, ownerIdentity.stderr);
    assert.equal(ownerIdentity.stdout.trim(), publishedOwner.startIdentity);
    const liveContender = await start('live-contender', 'V11', 'claim').completed;
    assert.equal(liveContender.code, 75, liveContender.stderr);
    assert.equal(existsSync(lockPath), true);
    assert.equal(owner.child.kill('SIGKILL'), true);
    const ownerResult = await owner.completed;
    assert.equal(ownerResult.signal, 'SIGKILL');
    assert.equal(
      spawnSync('ps', ['-o', 'pid=', '-p', String(signal.pid)], { encoding: 'utf8' }).status,
      1,
      'the registered published owner PID must be dead before recovery begins',
    );
    assert.equal(existsSync(lockPath), true);
    const recovered = await start('recovery-owner', 'V11', 'claim').completed;
    assert.equal(
      recovered.code,
      0,
      `stale lock must recover without duplicate acceptance: ${recovered.stderr}`,
    );
    assert.equal(existsSync(lockPath), false);
    assertNoPressureBLockResidue(stateRoot);

    const invalidMetadata = [
      ['malformed', '{not-json', false],
      ['mismatched', JSON.stringify({
        schemaVersion: 1,
        receiptSHA256: '41c14d9181fcac1e25296b7d363a54df974f833df03894e2e33a11e9a58b355c',
        planSHA256: 'wrong-plan',
        sessionId: 'codex:019fa9b3-efe1-75e0-811d-d2d03b08f027',
        attemptId: 'other-attempt',
        commandHash: '8b1b9f3c0c22c7e34c9d97fb1209302dc892a5c52c4ee1ca617a1a7d1b0ab7cd',
        pid: 999999,
        startIdentity: 'impossible-process',
        createdAt: new Date().toISOString(),
        nonce: 'wrong-plan-binding',
      }), false],
      ['symlink', null, true],
    ];
    for (const [name, content, symlink] of invalidMetadata) {
      const invalidRoot = join(stateRoot, `invalid-${name}`);
      const lockPath = join(invalidRoot, 'pressure-b-state.json.lock');
      mkdirSync(lockPath, { recursive: true, mode: 0o700 });
      const ownerPath = join(lockPath, 'owner.json');
      if (symlink) {
        const targetPath = join(invalidRoot, 'external-owner.json');
        writeFileSync(targetPath, '{}', { mode: 0o600 });
        symlinkSync(targetPath, ownerPath);
      } else {
        writeFileSync(ownerPath, content, { mode: 0o600 });
      }
      const rejected = await start(`invalid-${name}`, 'V11', 'claim', '', invalidRoot).completed;
      assert.equal(rejected.code, 75, `${name} metadata must fail closed: ${rejected.stderr}`);
      assert.equal(existsSync(lockPath), true, `${name} metadata lock must not be removed`);
    }
  });
});

test('pressure-B competing recovery claimants leave one claim and zero lock residue', async () => {
  await withPressureBChildFixture(async ({ stateRoot, start }) => {
    const ownerSignalPath = join(stateRoot, 'owner-published.json');
    const owner = start('two-recoverer-owner', 'V11', 'hold-lock', ownerSignalPath);
    const ownerSignal = await waitForPressureBSignal(ownerSignalPath);
    const lockPath = join(stateRoot, 'pressure-b-state.json.lock');
    const publishedOwner = JSON.parse(readFileSync(join(lockPath, 'owner.json'), 'utf8'));
    assert.equal(ownerSignal.pid, owner.child.pid);
    assert.equal(publishedOwner.pid, owner.child.pid);
    assert.deepEqual(ownerSignal.owner, publishedOwner);
    assert.equal(owner.child.kill('SIGKILL'), true);
    assert.equal((await owner.completed).signal, 'SIGKILL');
    assert.equal(
      spawnSync('ps', ['-o', 'pid=', '-p', String(ownerSignal.pid)], { encoding: 'utf8' }).status,
      1,
      'the authenticated owner must be dead before concurrent recovery begins',
    );

    const recoverySignalPath = join(stateRoot, 'first-recoverer.json');
    const first = start('recoverer-a', 'V11', 'hold-recovery', recoverySignalPath);
    const recoverySignal = await waitForPressureBSignal(recoverySignalPath);
    assert.equal(recoverySignal.pid, first.child.pid);
    assert.equal(recoverySignal.phase, 'recovered');
    assert.equal(recoverySignal.owner.nonce, publishedOwner.nonce);
    assert.equal(existsSync(lockPath), false);
    assert.equal(existsSync(recoverySignal.tombstonePath), true);

    const second = start('recoverer-b', 'V11', 'claim');
    const secondResult = await second.completed;
    assert.equal(secondResult.code, 0, secondResult.stderr);
    writeFileSync(`${recoverySignalPath}.release`, 'release', { flag: 'wx', mode: 0o600 });
    const firstResult = await first.completed;
    assert.equal(firstResult.code, 75, firstResult.stderr);
    assert.match(firstResult.stderr, /HOST_PRESSURE_OVERRIDE_INVALID/);
    const state = JSON.parse(readFileSync(join(stateRoot, 'pressure-b-state.json'), 'utf8'));
    assert.equal(state.stage, 'v11-claimed');
    assertNoPressureBLockResidue(stateRoot);
  });
});

test('pressure-B failed V11 and V5 states remain terminal with zero lock residue', async () => {
  await withPressureBChildFixture(async ({ stateRoot, start }) => {
    const v11Failed = await start('failed-v11', 'V11', 'complete-v11-failed').completed;
    assert.equal(v11Failed.code, 0, v11Failed.stderr);
    assert.equal(
      JSON.parse(readFileSync(join(stateRoot, 'pressure-b-state.json'), 'utf8')).stage,
      'v11-failed',
    );
    assert.equal(existsSync(join(stateRoot, 'pressure-b-state.json.lock')), false);
    assert.equal((await start('failed-v11', 'V5', 'claim').completed).code, 75);
    assert.equal((await start('failed-v11', 'V11', 'claim').completed).code, 75);

    const v5Root = join(stateRoot, 'v5-failure');
    const v11Succeeded = await start(
      'failed-v5',
      'V11',
      'complete-v11-success',
      '',
      v5Root,
    ).completed;
    assert.equal(v11Succeeded.code, 0, v11Succeeded.stderr);
    const v5Failed = await start(
      'failed-v5',
      'V5',
      'complete-v5-failed',
      '',
      v5Root,
    ).completed;
    assert.equal(v5Failed.code, 0, v5Failed.stderr);
    assert.equal(
      JSON.parse(readFileSync(join(v5Root, 'pressure-b-state.json'), 'utf8')).stage,
      'v5-failed',
    );
    assert.equal(existsSync(join(v5Root, 'pressure-b-state.json.lock')), false);
    assert.equal((await start('failed-v5', 'V5', 'claim', '', v5Root).completed).code, 75);
  });
});

test('pressure-B rejects tamper, plan, scope, task, order, reuse, parallel, and mixed-attempt variants', () => {
  withPressureBEnvironment(({ overridePath, plan }) => {
    const { baseline, current } = pressureBPreflight();
    const variants = [
      {
        name: 'tampered receipt hash',
        receipt: pressureBReceipt(),
        sha256: 'tampered-receipt-sha',
        task: 11,
      },
      {
        name: 'plan binding',
        receipt: pressureBReceipt((receipt) => ({ ...receipt, planSHA256: 'wrong-plan' })),
        task: 11,
      },
      {
        name: 'scope',
        receipt: pressureBReceipt((receipt) => ({ ...receipt, scope: 'plan-host-preflight-only' })),
        task: 11,
      },
      {
        name: 'task allowlist',
        receipt: pressureBReceipt(),
        task: 6,
      },
      {
        name: 'serial order',
        receipt: pressureBReceipt((receipt) => ({
          ...receipt,
          sequence: { ...receipt.sequence, firstTask: 5, secondTask: 11 },
        })),
        task: 11,
      },
      {
        name: 'reuse',
        receipt: pressureBReceipt((receipt) => ({ ...receipt, singleUse: false })),
        task: 11,
      },
      {
        name: 'parallel execution',
        receipt: pressureBReceipt((receipt) => ({
          ...receipt,
          taskExecution: { ...receipt.taskExecution, parallelAllowed: true },
        })),
        task: 11,
      },
      {
        name: 'mixed attempt execution',
        receipt: pressureBReceipt((receipt) => ({
          ...receipt,
          taskExecution: { ...receipt.taskExecution, mixedAttemptsAllowed: true },
        })),
        task: 11,
      },
      {
        name: 'container resource limit',
        receipt: pressureBReceipt((receipt) => ({
          ...receipt,
          resourceLimits: { ...receipt.resourceLimits, pidsLimit: 257 },
        })),
        task: 11,
      },
      {
        name: 'hard Docker failure',
        receipt: pressureBReceipt(),
        task: 11,
        failures: ['DOCKER_UNHEALTHY'],
      },
    ];
    for (const variant of variants) {
      const verifyOverride = hostPressureOverrideFunction({
        overridePath,
        receipt: variant.receipt,
        sha256: variant.sha256 ?? '41c14d9181fcac1e25296b7d363a54df974f833df03894e2e33a11e9a58b355c',
      });
      assert.throws(
        () => verifyOverride(
          repoRoot,
          plan,
          variant.task,
          variant.failures ?? ['NODE_MCP_PROCESS_PROLIFERATION'],
          current,
          baseline,
        ),
        (error) => error.code === 'HOST_PRESSURE_OVERRIDE_INVALID',
        variant.name,
      );
    }
  });
});

test('ordinary no-override host pressure remains fail-closed', () => {
  const previousReceipt = process.env.V1_HOST_PRESSURE_OVERRIDE_RECEIPT;
  delete process.env.V1_HOST_PRESSURE_OVERRIDE_RECEIPT;
  try {
    const verifyOverride = hostPressureOverrideFunction();
    assert.equal(
      verifyOverride(repoRoot, { rawSHA: 'raw', normalizedSHA: 'normalized' }, 11, [
        'NODE_MCP_PROCESS_PROLIFERATION',
      ]),
      null,
    );
  } finally {
    if (previousReceipt === undefined) {
      delete process.env.V1_HOST_PRESSURE_OVERRIDE_RECEIPT;
    } else {
      process.env.V1_HOST_PRESSURE_OVERRIDE_RECEIPT = previousReceipt;
    }
  }
});

test('legacy Task1 host pressure override remains accepted', () => {
  const previousReceipt = process.env.V1_HOST_PRESSURE_OVERRIDE_RECEIPT;
  const previousSession = process.env.V1_VERIFICATION_SESSION_ID;
  process.env.V1_HOST_PRESSURE_OVERRIDE_RECEIPT = resolve(
    repoRoot,
    '.omo/start-work/host-pressure-override-task-1.json',
  );
  process.env.V1_VERIFICATION_SESSION_ID =
    'codex:019fa9b3-efe1-75e0-811d-d2d03b08f027';
  try {
    const verifyOverride = hostPressureOverrideFunction({
      sha256: '2042407ad7b8f634f118d4ee9f0154ad1503564ceeac5874c6681f458e8c16da',
      receipt: {
        schemaVersion: 1,
        plan: '.omo/plans/teameet-team-tournament-operations-v1.md',
        planSHA256: 'legacy-plan-sha',
        task: 1,
        sessionId: 'codex:019fa9b3-efe1-75e0-811d-d2d03b08f027',
        authorizationSource: 'user-message',
        scope: 'host-preflight-only',
      },
    });
    const result = verifyOverride(
      repoRoot,
      { rawSHA: 'legacy-plan-sha', normalizedSHA: 'normalized' },
      1,
      ['NODE_MCP_PROCESS_PROLIFERATION'],
    );
    assert.equal(result.applied, true);
    assert.deepEqual(result.observedFailures, ['NODE_MCP_PROCESS_PROLIFERATION']);
  } finally {
    if (previousReceipt === undefined) {
      delete process.env.V1_HOST_PRESSURE_OVERRIDE_RECEIPT;
    } else {
      process.env.V1_HOST_PRESSURE_OVERRIDE_RECEIPT = previousReceipt;
    }
    if (previousSession === undefined) {
      delete process.env.V1_VERIFICATION_SESSION_ID;
    } else {
      process.env.V1_VERIFICATION_SESSION_ID = previousSession;
    }
  }
});

function cleanRestartFixture() {
  const temporaryDirectory = mkdtempSync(
    '/private/tmp/teameet-v1-clean-restart-contract-',
  );
  const worktree = join(temporaryDirectory, 'worktree');
  mkdirSync(worktree);
  const archive = spawnSync(
    'git',
    ['archive', '--format=tar', 'a4823d2f575d9396323421024a81a63dacf0cf67'],
    {
      cwd: repoRoot,
      encoding: null,
      maxBuffer: 512 * 1024 * 1024,
    },
  );
  assert.equal(archive.status, 0, archive.stderr?.toString('utf8'));
  const extracted = spawnSync('tar', ['-xf', '-', '-C', worktree], {
    input: archive.stdout,
    encoding: 'utf8',
  });
  assert.equal(extracted.status, 0, extracted.stderr);
  const initialized = spawnSync('git', ['init', '--initial-branch=dev'], {
    cwd: worktree,
    encoding: 'utf8',
  });
  assert.equal(initialized.status, 0, initialized.stderr);
  const objectsInfo = join(worktree, '.git/objects/info');
  mkdirSync(objectsInfo, { recursive: true });
  writeFileSync(
    join(objectsInfo, 'alternates'),
    `${join(repoRoot, '.git/objects')}\n`,
  );
  writeFileSync(
    join(worktree, '.git/info/exclude'),
    `${readFileSync(join(repoRoot, '.git/info/exclude'), 'utf8')}\n.omo/\n`,
  );
  const head = spawnSync(
    'git',
    ['update-ref', 'refs/heads/dev', 'a4823d2f575d9396323421024a81a63dacf0cf67'],
    { cwd: worktree, encoding: 'utf8' },
  );
  assert.equal(head.status, 0, head.stderr);
  const index = spawnSync('git', ['read-tree', 'HEAD'], {
    cwd: worktree,
    encoding: 'utf8',
  });
  assert.equal(index.status, 0, index.stderr);
  const ledgerText = readFileSync(
    join(worktree, '.github/tasks/127-v1-team-tournament-operations-game-record.md'),
    'utf8',
  );
  const ledgerMatch = ledgerText.match(
    /<!-- TASK127_LEDGER_JSON_BEGIN -->\s*```json\n([\s\S]*?)\n```\s*<!-- TASK127_LEDGER_JSON_END -->/,
  );
  assert.ok(ledgerMatch);
  const ledger = JSON.parse(ledgerMatch[1]);
  const ownedPaths = ledger.ownership.find(({ todo }) => todo === 1).outputs;
  const fixtureOnlyPaths = [
    '.omo/plans/teameet-team-tournament-operations-v1.md',
    '.omo/evidence/approved-task-1-clean-restart-v0-dc4ecb2f.json',
    '.omo/evidence/task-1-task127-clean-restart-cursor-dc4ecb2f.json',
    '.omo/evidence/task-1-host-pressure-override-dc4ecb2f-r2.json',
    '.omo/evidence/task-1-v0-execution-consumption-dc4ecb2f.json',
    '.omo/evidence/task-1-rollback-a-recovered.json',
  ];
  for (const path of [
    ...ownedPaths,
    ...ledger.unrelatedDirty.paths.map((entry) => entry.path),
    ...fixtureOnlyPaths,
  ]) {
    const source = join(repoRoot, path);
    const target = join(worktree, path);
    mkdirSync(dirname(target), { recursive: true });
    cpSync(source, target);
  }
  return {
    worktree: repoRoot,
    evidenceRoot: join(temporaryDirectory, 'evidence'),
    environment: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      LANG: 'C.UTF-8',
      TZ: 'UTC',
      GIT_DIR: join(worktree, '.git'),
      GIT_WORK_TREE: repoRoot,
      GIT_INDEX_FILE: join(worktree, '.git/index'),
      OMO_SELECTED_PLAN_SHA: planSHA,
    },
    cleanup: () => rmSync(temporaryDirectory, { recursive: true, force: true }),
  };
}

function docker(args, expectedStatus = 0) {
  const result = spawnSync('docker', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    timeout: 30_000,
  });
  assert.equal(
    result.status,
    expectedStatus,
    `docker ${args.join(' ')}\nstdout=${result.stdout}\nstderr=${result.stderr}`,
  );
  return result.stdout.trim();
}

function realDockerSupervisorProbe() {
  const attemptId = randomUUID();
  const suffix = attemptId.replaceAll('-', '').slice(0, 20);
  const containerName = `teameet-v1-t1-probe-${suffix}`;
  const networkName = `teameet-v1-t1-net-${suffix}`;
  const volumeName = `teameet-v1-t1-cache-${suffix}`;
  const label = `com.teameet.verification.attempt=${attemptId}`;
  let containerCreated = false;
  let networkCreated = false;
  let volumeCreated = false;
  try {
    docker(['network', 'create', '--label', `com.teameet.verification.workload=${workload}`, '--label', label, networkName]);
    networkCreated = true;
    docker(['volume', 'create', '--label', `com.teameet.verification.workload=${workload}`, '--label', label, volumeName]);
    volumeCreated = true;
    docker([
      'create',
      '--name',
      containerName,
      '--label',
      `com.teameet.verification.workload=${workload}`,
      '--label',
      label,
      '--cpus',
      '1',
      '--memory',
      '4g',
      '--pids-limit',
      '256',
      '--network',
      networkName,
      '--read-only',
      '--tmpfs',
      '/tmp:rw,noexec,nosuid,nodev,size=64m',
      '--mount',
      `type=volume,src=${volumeName},dst=/verification/cache`,
      '--entrypoint',
      'node',
      image,
      '-e',
      'process.on(\"SIGTERM\",()=>process.exit(0));setInterval(()=>{},1000)',
    ]);
    containerCreated = true;
    docker(['start', containerName]);
    const inspect = JSON.parse(docker(['inspect', containerName]))[0];
    assert.equal(inspect.HostConfig.NanoCpus, 1_000_000_000);
    assert.equal(inspect.HostConfig.Memory, 4_294_967_296);
    assert.equal(inspect.HostConfig.PidsLimit, 256);
    assert.equal(inspect.HostConfig.ReadonlyRootfs, true);
    assert.equal(inspect.HostConfig.Privileged, false);
    assert.equal(inspect.HostConfig.NetworkMode, networkName);
    assert.equal(
      inspect.Mounts.some((mount) => mount.Destination === '/var/run/docker.sock'),
      false,
    );
    docker(['kill', '--signal', 'TERM', containerName]);
    docker(['wait', containerName]);
  } finally {
    if (containerCreated) {
      spawnSync('docker', ['rm', '--force', containerName], { encoding: 'utf8' });
    }
    if (volumeCreated) {
      spawnSync('docker', ['volume', 'rm', '--force', volumeName], { encoding: 'utf8' });
    }
    if (networkCreated) {
      spawnSync('docker', ['network', 'rm', networkName], { encoding: 'utf8' });
    }
  }
  assert.equal(
    docker(['ps', '-aq', '--filter', `label=com.teameet.verification.attempt=${attemptId}`]),
    '',
  );
  assert.equal(
    docker(['network', 'ls', '-q', '--filter', `label=com.teameet.verification.attempt=${attemptId}`]),
    '',
  );
  assert.equal(
    docker(['volume', 'ls', '-q', '--filter', `label=com.teameet.verification.attempt=${attemptId}`]),
    '',
  );
  return attemptId;
}

test('current a482 bound-source validator contract', () => {
  const result = runNode([
    'scripts/qa/verify-team-tournament-bound-sources.mjs',
    '--pdf-sha',
    '1558110dc711d421f7c4eea5cd98accc528180e625e1980578f92e1256806d50',
    '--preview-sha',
    '7d8e101ad27a6a227f1a525a729888aa4286845b5a6819aaa034b57cc55ba9f1',
    '--design-commit',
    '71f67b0d24e272eecd216cebb31eefbd66c9ca02',
    '--design-sha',
    '3ee8aedd03c507a7b7540bc9134e52abf49e8210a30d338bca2a899beca0f8a2',
  ]);

  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.deepEqual(
    {
      code: output.code,
      pdf: output.pdf.sha256,
      preview: output.preview.sha256,
      design: output.design.sha256,
      designCommit: output.design.commit,
    },
    {
      code: 'BOUND_SOURCES_OK',
      pdf: '1558110dc711d421f7c4eea5cd98accc528180e625e1980578f92e1256806d50',
      preview: '7d8e101ad27a6a227f1a525a729888aa4286845b5a6819aaa034b57cc55ba9f1',
      design: '3ee8aedd03c507a7b7540bc9134e52abf49e8210a30d338bca2a899beca0f8a2',
      designCommit: '71f67b0d24e272eecd216cebb31eefbd66c9ca02',
    },
  );
});

test('plan-schema Task-1 candidate receipt binds the committed source manifest', () => {
  const fixture = candidateFixture();
  try {
    const result = runNode(
      candidateCommand(fixture),
      {
        cwd: fixture.worktree,
        env: fixture.environment,
        timeout: 120_000,
      },
    );

    assert.equal(result.status, 0, result.stderr);
    const receipt = JSON.parse(result.stdout);
    assert.equal(receipt.phase, 'candidate');
    assert.equal(receipt.candidateSHA, fixture.candidateSHA);
    assert.equal(receipt.liveHead, fixture.candidateSHA);
    assert.equal(receipt.sourceTreeSHA, fixture.sourceManifest.sourceTreeSHA);
    assert.equal(receipt.sourceManifestPath, fixture.sourceManifestPath);
    assert.equal(receipt.sourceManifestSHA, fixture.sourceManifestSHA);
    assert.equal(receipt.payloadExitCode, 0);
    assert.equal(receipt.verdict, 'accepted');
    assert.deepEqual(receipt.cleanup, {
      containers: 0,
      networks: 0,
      volumes: 0,
      overlays: 0,
      publishedPorts: 0,
      hostBrowserPids: 0,
      tempRoots: 0,
    });
  } finally {
    fixture.cleanup();
  }
});

test('Task-1 pressure override preserves non-waivable process growth gates', () => {
  const assertHostGates = taskOneHostGateFunction();
  const chain = {
    consumption: {
      receipt: {
        hardGates: {
          nodeMcpCount: 230,
          browserCount: 41,
        },
      },
    },
    override: {
      receipt: {
        hardGrowthGates: {
          nodeMcpGrowthAtLeast: 50,
          swapGrowthBytesAtLeast: 2_147_483_648,
        },
      },
    },
  };
  const healthy = {
    logicalCores: 12,
    loadAverage: [1, 1, 1],
    docker: { state: 'available' },
    nodeMcpCount: 279,
    browserCount: 60,
    targetPorts: { 3013: [], 8121: [] },
  };
  const nodeMcpReceipt = {
    sha256: nodeMcpOverrideSHA,
    waivers: {
      nodeMcpGrowth: true,
      browserRelativeGrowth: false,
    },
  };

  assert.doesNotThrow(() => assertHostGates(healthy, chain));
  assert.throws(
    () => assertHostGates({ ...healthy, nodeMcpCount: 280 }, chain),
    (error) =>
      error.code === 'HOST_PREFLIGHT_BLOCKED' &&
      error.message.includes('NODE_MCP_GROWTH'),
  );
  assert.doesNotThrow(() =>
    assertHostGates({ ...healthy, nodeMcpCount: 280 }, chain, nodeMcpReceipt),
  );
  assert.throws(
    () =>
      assertHostGates(
        { ...healthy, nodeMcpCount: 280, browserCount: 61 },
        chain,
        nodeMcpReceipt,
      ),
    (error) =>
      error.code === 'HOST_PREFLIGHT_BLOCKED' &&
      error.message.includes('BROWSER_GROWTH'),
  );
  assert.throws(
    () =>
      assertHostGates(
        { ...healthy, nodeMcpCount: 280, browserCount: 201 },
        chain,
        nodeMcpReceipt,
      ),
    (error) =>
      error.code === 'HOST_PREFLIGHT_BLOCKED' &&
      error.message.includes('BROWSER_GROWTH'),
  );
  assert.throws(
    () =>
      assertHostGates(
        { ...healthy, nodeMcpCount: 280, loadAverage: [25, 1, 1] },
        chain,
        nodeMcpReceipt,
      ),
    (error) =>
      error.code === 'HOST_PREFLIGHT_BLOCKED' &&
      error.message.includes('LOAD_PER_CORE_PRESSURE'),
  );
  assert.throws(
    () =>
      assertHostGates(
        { ...healthy, nodeMcpCount: 280, docker: { state: 'unavailable' } },
        chain,
        nodeMcpReceipt,
      ),
    (error) =>
      error.code === 'HOST_PREFLIGHT_BLOCKED' &&
      error.message.includes('DOCKER_UNHEALTHY'),
  );
  const portError = Object.assign(new Error('occupied'), {
    code: 'FOREIGN_PORT_OWNER',
  });
  const assertPortGate = taskOneHostGateFunction(() => {
    throw portError;
  });
  assert.throws(
    () =>
      assertPortGate(
        { ...healthy, nodeMcpCount: 280 },
        chain,
        nodeMcpReceipt,
      ),
    (error) => error.code === 'FOREIGN_PORT_OWNER',
  );
});

test('Task-1 relative-growth continuation accepts only preflight relative growth', () => {
  const assertHostGates = taskOneHostGateFunction();
  const receipt = relativeGrowthReceiptDescriptor();
  const chain = {
    consumption: {
      receipt: {
        hardGates: {
          nodeMcpCount: 230,
          browserCount: 41,
        },
      },
    },
    override: {
      receipt: {
        hardGrowthGates: {
          nodeMcpGrowthAtLeast: 50,
          swapGrowthBytesAtLeast: 2_147_483_648,
        },
      },
    },
  };
  const currentHost = {
    logicalCores: 12,
    loadAverage: [4, 4, 4],
    docker: { state: 'available' },
    nodeMcpCount: 567,
    browserCount: 75,
    targetPorts: { 3013: [], 8121: [] },
  };

  assert.doesNotThrow(() => assertHostGates(currentHost, chain, receipt));
  assert.throws(
    () => assertHostGates({ ...currentHost, browserCount: 201 }, chain, receipt),
    (error) =>
      error.code === 'HOST_PREFLIGHT_BLOCKED' &&
      error.message.includes('BROWSER_PROCESS_PROLIFERATION'),
  );
  assert.throws(
    () => assertHostGates({ ...currentHost, loadAverage: [25, 4, 4] }, chain, receipt),
    (error) =>
      error.code === 'HOST_PREFLIGHT_BLOCKED' &&
      error.message.includes('LOAD_PER_CORE_PRESSURE'),
  );
  assert.throws(
    () => assertHostGates({ ...currentHost, docker: { state: 'unavailable' } }, chain, receipt),
    (error) =>
      error.code === 'HOST_PREFLIGHT_BLOCKED' &&
      error.message.includes('DOCKER_UNHEALTHY'),
  );
});

for (const inRunGrowth of [
  {
    name: 'Node/MCP',
    start: { nodeMcpCount: 0, browserCount: 0 },
    end: { nodeMcpCount: 50, browserCount: 0 },
  },
  {
    name: 'browser',
    start: { nodeMcpCount: 0, browserCount: 0 },
    end: { nodeMcpCount: 0, browserCount: 20 },
  },
]) {
  test(`Task-1 continuation PIN keeps in-run ${inRunGrowth.name} growth hard`, () => {
    const fixture = candidateFixture({
      processSnapshots: [inRunGrowth.start, inRunGrowth.end],
    });
    try {
      const result = runNode(candidateCommand(fixture), {
        cwd: fixture.worktree,
        env: fixture.environment,
        timeout: 120_000,
      });
      assert.equal(result.status, 79, result.stderr);
      assert.match(result.stderr, /HOST_GROWTH_HARD_GATE/);
      const attempts = readdirSync(fixture.evidenceRoot, { recursive: true })
        .filter((entry) => entry.endsWith('cleanup-journal.json'));
      assert.equal(attempts.length, 1);
    } finally {
      fixture.cleanup();
    }
  });
}

test('Task-1 exact relative-growth receipt waives preflight Node and browser relative growth', () => {
  const fixture = candidateFixture({
    nodeMcpCount: 567,
    browserCount: 75,
  });
  try {
    const result = runNode(
      candidateCommand(fixture, {
        relativeGrowthOverride: {
          path: resolve(fixture.worktree, relativeGrowthOverridePath),
          sha256: relativeGrowthOverrideSHA,
        },
      }),
      {
        cwd: fixture.worktree,
        env: fixture.environment,
        timeout: 120_000,
      },
    );
    assert.equal(result.status, 0, result.stderr);
    const receipt = JSON.parse(result.stdout);
    assert.equal(receipt.verdict, 'accepted');
    assert.equal(
      receipt.relativeGrowthOverrideReceiptSHA,
      relativeGrowthOverrideSHA,
    );
    assert.equal(receipt.hostMetrics.before.nodeMcpCount, 567);
    assert.equal(receipt.hostMetrics.before.browserCount, 75);
    assert.deepEqual(receipt.hostMetrics.before.targetPorts, {
      3013: [],
      8121: [],
    });
  } finally {
    fixture.cleanup();
  }
});

function replaceRelativeGrowthOverride(fixture, bytes) {
  const receiptPath = resolve(fixture.worktree, relativeGrowthOverridePath);
  chmodSync(receiptPath, 0o644);
  rmSync(receiptPath);
  return immutableBytesAt(receiptPath, bytes);
}

test('Task-1 relative-growth override rejects malformed, stale, mutable, and overbroad receipts', () => {
  const canonicalReceipt = JSON.parse(
    readFileSync(resolve(repoRoot, relativeGrowthOverridePath), 'utf8'),
  );
  const canonicalBytes = Buffer.from(JSON.stringify(stable(canonicalReceipt)));
  const cases = [
    {
      name: 'missing SHA pair',
      prepare: (fixture) => ({
        path: resolve(fixture.worktree, relativeGrowthOverridePath),
      }),
    },
    {
      name: 'missing path pair',
      prepare: () => ({ sha256: relativeGrowthOverrideSHA }),
    },
    {
      name: 'wrong path',
      prepare: (fixture) => {
        const targetPath = resolve(
          fixture.worktree,
          '.omo/evidence/task-1-relative-growth-override-wrong-path.json',
        );
        const target = immutableBytesAt(targetPath, canonicalBytes);
        return { path: target.path, sha256: target.sha256 };
      },
    },
    {
      name: 'wrong SHA',
      prepare: (fixture) => ({
        path: resolve(fixture.worktree, relativeGrowthOverridePath),
        sha256: '0'.repeat(64),
      }),
    },
    {
      name: 'symlinked',
      prepare: (fixture) => {
        const receiptPath = resolve(fixture.worktree, relativeGrowthOverridePath);
        const targetPath = resolve(
          fixture.worktree,
          '.omo/evidence/task-1-relative-growth-override-target.json',
        );
        const target = immutableBytesAt(targetPath, canonicalBytes);
        chmodSync(receiptPath, 0o644);
        rmSync(receiptPath);
        symlinkSync(targetPath, receiptPath);
        return { path: receiptPath, sha256: target.sha256 };
      },
    },
    {
      name: 'mutable mode',
      prepare: (fixture) => {
        const receiptPath = resolve(fixture.worktree, relativeGrowthOverridePath);
        chmodSync(receiptPath, 0o644);
        return { path: receiptPath, sha256: relativeGrowthOverrideSHA };
      },
    },
    {
      name: 'hard linked',
      prepare: (fixture) => {
        const receiptPath = resolve(fixture.worktree, relativeGrowthOverridePath);
        linkSync(
          receiptPath,
          resolve(
            fixture.worktree,
            '.omo/evidence/task-1-relative-growth-override-hardlink.json',
          ),
        );
        return { path: receiptPath, sha256: relativeGrowthOverrideSHA };
      },
    },
    {
      name: 'duplicate key',
      prepare: (fixture) =>
        replaceRelativeGrowthOverride(
          fixture,
          Buffer.from(`{"schemaVersion":1,${canonicalBytes.toString('utf8').slice(1)}`),
        ),
    },
    {
      name: 'trailing byte',
      prepare: (fixture) =>
        replaceRelativeGrowthOverride(
          fixture,
          Buffer.concat([canonicalBytes, Buffer.from('\n')]),
        ),
    },
    {
      name: 'noncanonical JSON',
      prepare: (fixture) =>
        replaceRelativeGrowthOverride(
          fixture,
          Buffer.from(JSON.stringify(canonicalReceipt, null, 2)),
        ),
    },
    {
      name: 'stale plan',
      prepare: (fixture) =>
        replaceRelativeGrowthOverride(
          fixture,
          Buffer.from(
            JSON.stringify(stable({ ...canonicalReceipt, planSHA256: '0'.repeat(64) })),
          ),
        ),
    },
    {
      name: 'wrong session',
      prepare: (fixture) =>
        replaceRelativeGrowthOverride(
          fixture,
          Buffer.from(
            JSON.stringify(stable({ ...canonicalReceipt, sessionId: 'codex:wrong-session' })),
          ),
        ),
    },
    {
      name: 'wrong predecessor',
      prepare: (fixture) =>
        replaceRelativeGrowthOverride(
          fixture,
          Buffer.from(
            JSON.stringify(stable({
              ...canonicalReceipt,
              supersedesReceipt: {
                ...canonicalReceipt.supersedesReceipt,
                sha256: '0'.repeat(64),
              },
            })),
          ),
        ),
    },
    {
      name: 'overbroad scope',
      prepare: (fixture) =>
        replaceRelativeGrowthOverride(
          fixture,
          Buffer.from(
            JSON.stringify(stable({
              ...canonicalReceipt,
              scope: 'all-host-and-runtime-gates',
              waivedPreflightFailures: ['HOST_PREFLIGHT_BLOCKED'],
            })),
          ),
        ),
    },
    {
      name: 'omitted preserved gate',
      prepare: (fixture) =>
        replaceRelativeGrowthOverride(
          fixture,
          Buffer.from(
            JSON.stringify(stable({
              ...canonicalReceipt,
              preservedFailures: canonicalReceipt.preservedFailures.filter(
                (failure) => failure !== 'BROWSER_PROCESS_PROLIFERATION',
              ),
            })),
          ),
        ),
    },
    {
      name: 'altered user text',
      prepare: (fixture) => {
        const alteredText = `${canonicalReceipt.userAuthorizations[1].text} altered`;
        return replaceRelativeGrowthOverride(
          fixture,
          Buffer.from(
            JSON.stringify(stable({
              ...canonicalReceipt,
              userAuthorizations: [
                canonicalReceipt.userAuthorizations[0],
                {
                  ...canonicalReceipt.userAuthorizations[1],
                  text: alteredText,
                  sha256: sha256(alteredText),
                },
              ],
            })),
          ),
        );
      },
    },
  ];

  for (const receiptCase of cases) {
    const fixture = candidateFixture({
      nodeMcpCount: 567,
      browserCount: 75,
    });
    try {
      const relativeGrowthOverride = receiptCase.prepare(fixture);
      const result = runNode(
        candidateCommand(fixture, { relativeGrowthOverride }),
        {
          cwd: fixture.worktree,
          env: fixture.environment,
          timeout: 120_000,
        },
      );
      assert.equal(result.status, 75, `${receiptCase.name}: ${result.stderr}`);
      assert.match(
        result.stderr,
        /RELATIVE_GROWTH_OVERRIDE_INVALID/,
        receiptCase.name,
      );
    } finally {
      fixture.cleanup();
    }
  }
});

test('Task-1 exact user receipt waives only NODE_MCP_GROWTH', () => {
  const fixture = candidateFixture({ nodeMcpCount: 337 });
  try {
    const result = runNode(
      candidateCommand(fixture, {
        nodeMcpOverride: {
          path: resolve(fixture.worktree, nodeMcpOverridePath),
          sha256: nodeMcpOverrideSHA,
        },
      }),
      {
        cwd: fixture.worktree,
        env: fixture.environment,
        timeout: 120_000,
      },
    );
    assert.equal(result.status, 0, result.stderr);
    const receipt = JSON.parse(result.stdout);
    assert.equal(receipt.verdict, 'accepted');
    assert.equal(receipt.nodeMcpOverrideReceiptSHA, nodeMcpOverrideSHA);
    assert.deepEqual(receipt.hostMetrics.before.targetPorts, {
      3013: [],
      8121: [],
    });
  } finally {
    fixture.cleanup();
  }
});

function replaceNodeMcpOverride(fixture, bytes) {
  const receiptPath = resolve(fixture.worktree, nodeMcpOverridePath);
  chmodSync(receiptPath, 0o644);
  rmSync(receiptPath);
  return immutableBytesAt(receiptPath, bytes);
}

test('Task-1 node override rejects missing, malformed, symlinked, stale, mutable, and overbroad receipts', () => {
  const canonicalReceipt = JSON.parse(
    readFileSync(resolve(repoRoot, nodeMcpOverridePath), 'utf8'),
  );
  const cases = [
    {
      name: 'missing',
      prepare: () => null,
    },
    {
      name: 'malformed JSON',
      prepare: (fixture) =>
        replaceNodeMcpOverride(fixture, Buffer.from('{"schemaVersion":')),
    },
    {
      name: 'symlinked',
      prepare: (fixture) => {
        const receiptPath = resolve(fixture.worktree, nodeMcpOverridePath);
        const targetPath = resolve(
          fixture.worktree,
          '.omo/evidence/task-1-node-mcp-growth-override-target.json',
        );
        const target = immutableReceiptAt(targetPath, canonicalReceipt);
        chmodSync(receiptPath, 0o644);
        rmSync(receiptPath);
        symlinkSync(targetPath, receiptPath);
        return { path: receiptPath, sha256: target.sha256 };
      },
    },
    {
      name: 'stale plan',
      prepare: (fixture) =>
        replaceNodeMcpOverride(
          fixture,
          Buffer.from(
            JSON.stringify(stable({ ...canonicalReceipt, planSHA256: '0'.repeat(64) })),
          ),
        ),
    },
    {
      name: 'wrong session',
      prepare: (fixture) =>
        replaceNodeMcpOverride(
          fixture,
          Buffer.from(
            JSON.stringify(stable({ ...canonicalReceipt, sessionId: 'codex:wrong-session' })),
          ),
        ),
    },
    {
      name: 'trailing byte',
      prepare: (fixture) =>
        replaceNodeMcpOverride(
          fixture,
          Buffer.concat([
            Buffer.from(JSON.stringify(stable(canonicalReceipt))),
            Buffer.from('\n'),
          ]),
        ),
    },
    {
      name: 'mutable mode',
      prepare: (fixture) => {
        const receiptPath = resolve(fixture.worktree, nodeMcpOverridePath);
        chmodSync(receiptPath, 0o644);
        return { path: receiptPath, sha256: nodeMcpOverrideSHA };
      },
    },
    {
      name: 'overbroad waiver',
      prepare: (fixture) =>
        replaceNodeMcpOverride(
          fixture,
          Buffer.from(
            JSON.stringify(
              stable({
                ...canonicalReceipt,
                scope: 'all-host-gates',
                waivedFailure: 'HOST_PREFLIGHT_BLOCKED',
              }),
            ),
          ),
        ),
    },
  ];

  for (const receiptCase of cases) {
    const fixture = candidateFixture({ nodeMcpCount: 337 });
    try {
      const nodeMcpOverride = receiptCase.prepare(fixture);
      const result = runNode(
        candidateCommand(fixture, { nodeMcpOverride }),
        {
          cwd: fixture.worktree,
          env: fixture.environment,
          timeout: 120_000,
        },
      );
      assert.equal(result.status, 75, `${receiptCase.name}: ${result.stderr}`);
      assert.match(
        result.stderr,
        /NODE_MCP_OVERRIDE_INVALID/,
        receiptCase.name,
      );
    } finally {
      fixture.cleanup();
    }
  }
});

const candidateNegativeCases = [
  {
    name: 'wrong live HEAD',
    mutateCandidate: (value) => ({ ...value, candidateSHA: '0'.repeat(40) }),
  },
  {
    name: 'wrong owned blob',
    mutateCandidate: (value) => ({
      ...value,
      ownedPathBlobs: value.ownedPathBlobs.map((entry, index) =>
        index === 0 ? { ...entry, blobSHA: '0'.repeat(40) } : entry),
    }),
  },
  {
    name: 'wrong owned mode',
    mutateCandidate: (value) => ({
      ...value,
      ownedPathBlobs: value.ownedPathBlobs.map((entry, index) =>
        index === 0 ? { ...entry, mode: '100755' } : entry),
    }),
  },
  {
    name: 'wrong authority receipt',
    mutateCandidate: (value) => ({
      ...value,
      approvalReceipt: { ...value.approvalReceipt, sha256: '0'.repeat(64) },
    }),
  },
  {
    name: 'wrong source manifest',
    mutateCandidate: (value) => ({
      ...value,
      sourceManifestSHA: '0'.repeat(64),
    }),
  },
  {
    name: 'dirty owned path',
    mutateWorktree: ({ worktree, ledger }) => {
      const owned = ledger.ownership.find(({ todo }) => todo === 1).outputs[0];
      const target = join(worktree, owned);
      writeFileSync(target, `${readFileSync(target, 'utf8')}\nfixture-owned-drift\n`);
    },
  },
  {
    name: 'unrelated fingerprint drift',
    expectedError: 'UNRELATED_DIRTY_FINGERPRINT_DRIFT',
    mutateWorktree: ({ worktree, ledger }) => {
      const unrelated = ledger.unrelatedDirty.paths[0].path;
      const target = join(worktree, unrelated);
      writeFileSync(target, `${readFileSync(target, 'utf8')}\nfixture-unrelated-drift\n`);
    },
  },
];

for (const fixtureCase of candidateNegativeCases) {
  test(`Task-1 candidate rejects ${fixtureCase.name}`, () => {
    const fixture = candidateFixture(fixtureCase);
    try {
      const result = runNode(candidateCommand(fixture), {
        cwd: fixture.worktree,
        env: fixture.environment,
        timeout: 30_000,
      });
      assert.equal(result.status, 68, result.stdout);
      assert.match(
        result.stderr,
        new RegExp(fixtureCase.expectedError ?? 'CANDIDATE_BINDING_MISMATCH'),
      );
    } finally {
      fixture.cleanup();
    }
  });
}

test('trusted host supervisor contract', () => {
  const probeAttemptId = realDockerSupervisorProbe();
  const restart = cleanRestartFixture();
  const temporaryDirectory = mkdtempSync(
    '/private/tmp/teameet-v1-supervisor-contract-',
  );
  try {
    const dockerInfo = JSON.parse(docker(['info', '--format', '{{json .}}']));
    const supervisorValue = {
      schemaVersion: 1,
      receiptType: 'task-1-host-supervisor-gate',
      gateId: 'HOST-SUPERVISOR',
      taskId: 1,
      workloadId: workload,
      planSHA,
      approvalReceipt: {
        path: '.omo/evidence/approved-task-1-clean-restart-v0-dc4ecb2f.json',
        sha256: 'd30d3688ef97b0cefabfad3e6deb8343bb9e8b8f017bae0ff91572be901527ae',
      },
      task127CursorReceipt: {
        path: '.omo/evidence/task-1-task127-clean-restart-cursor-dc4ecb2f.json',
        sha256: '0946bd0170f9034fdc4c5d99803e2b0ecf7afb46344988e9903933bcee55d9a7',
      },
      overrideReceipt: {
        path: '.omo/evidence/task-1-host-pressure-override-dc4ecb2f-r2.json',
        sha256: '84ab59119f5f83bcffed1478faa50b185b0c02bbb3ca5ecc37822a3c49e92748',
      },
      consumptionReceipt: {
        path: '.omo/evidence/task-1-v0-execution-consumption-dc4ecb2f.json',
        sha256: '6cfd41dcbb56bbb07fe3dfb5eb208f2449b8dbb90cef6742618b75481d8ecac4',
      },
      docker: {
        context: docker(['context', 'show']),
        serverId: dockerInfo.ID,
        serverVersion: dockerInfo.ServerVersion,
        operatingSystem: dockerInfo.OperatingSystem,
        ostype: dockerInfo.OSType,
      },
      probes: {
        attemptId: probeAttemptId,
        create: true,
        start: true,
        inspect: true,
        interrupt: true,
        stop: true,
        remove: true,
      },
      cleanup: {
        containers: 0,
        networks: 0,
        volumes: 0,
        overlays: 0,
        publishedPorts: 0,
        hostBrowserPids: 0,
        tempRoots: 0,
      },
      createdAt: new Date().toISOString(),
      verdict: 'APPROVE',
    };
    const supervisor = immutableReceipt(temporaryDirectory, supervisorValue);
    const trailingSupervisor = immutableBytesAt(
      join(temporaryDirectory, 'host-supervisor-trailing.json'),
      Buffer.from(`${JSON.stringify(stable(supervisorValue))}\n`),
    );
    const hostilePayload = [
      'const fs=require("node:fs");',
      'if(process.getuid?.()===0)process.exit(31);',
      'if(fs.existsSync("/var/run/docker.sock"))process.exit(32);',
      'if(Object.keys(process.env).some(k=>/(TOKEN|SECRET|PASSWORD|SSH|AWS|GOOGLE|AZURE)/i.test(k)))process.exit(35);',
      'try{fs.writeFileSync("/verification/source/.task1-readonly-probe","x");process.exit(33)}catch{}',
      'if(!fs.existsSync("/verification/source/.github/tasks/127-v1-team-tournament-operations-game-record.md"))process.exit(34);',
      'process.stdout.write(JSON.stringify({contained:true,dockerSocket:false,sourceReadonly:true}))',
    ].join('');
    const wrapperArguments = (payloadScript, hostReceipt = supervisor) => [
        resolve(repoRoot, 'scripts/qa/run-v1-task-verification.mjs'),
        '--task',
        '1',
        '--phase',
        'clean-restart',
        '--plan-sha',
        planSHA,
        '--baseline-sha',
        '71f67b0d24e272eecd216cebb31eefbd66c9ca02',
        '--restart-head-sha',
        'a4823d2f575d9396323421024a81a63dacf0cf67',
        '--predecessor-chain',
        '71f67b0d24e272eecd216cebb31eefbd66c9ca02,a84a6e5277c4d29f9281140dca6a630fb5a2ca15,d444649adaf1ba88c3dddd755f6728135d8476b4,a4823d2f575d9396323421024a81a63dacf0cf67',
        '--candidate-sha',
        'null',
        '--require-task127-cursor-mode',
        'clean-restart-initial',
        '--require-task127-cursor-receipt',
        '.omo/evidence/task-1-task127-clean-restart-cursor-dc4ecb2f.json',
        '--require-task127-cursor-receipt-sha',
        '0946bd0170f9034fdc4c5d99803e2b0ecf7afb46344988e9903933bcee55d9a7',
        '--require-host-supervisor-receipt',
        hostReceipt.path,
        '--require-host-supervisor-receipt-sha',
        hostReceipt.sha256,
        '--hostile-no-docker-control',
        '--evidence-root',
        restart.evidenceRoot,
        '--',
        'node',
        '-e',
        payloadScript,
      ];
    const wrapperEnvironment = {
          ...restart.environment,
          OMO_REVIEW_RECEIPT_PATH:
            '.omo/evidence/approved-task-1-clean-restart-v0-dc4ecb2f.json',
          OMO_REVIEW_RECEIPT_SHA:
            'd30d3688ef97b0cefabfad3e6deb8343bb9e8b8f017bae0ff91572be901527ae',
          V1_TASK127_CURSOR_RECEIPT_PATH:
            '.omo/evidence/task-1-task127-clean-restart-cursor-dc4ecb2f.json',
          V1_TASK127_CURSOR_RECEIPT_SHA:
            '0946bd0170f9034fdc4c5d99803e2b0ecf7afb46344988e9903933bcee55d9a7',
          V1_HOST_PRESSURE_OVERRIDE_RECEIPT_PATH:
            '.omo/evidence/task-1-host-pressure-override-dc4ecb2f-r2.json',
          V1_HOST_PRESSURE_OVERRIDE_RECEIPT_SHA:
            '84ab59119f5f83bcffed1478faa50b185b0c02bbb3ca5ecc37822a3c49e92748',
          V1_V0_CONSUMPTION_RECEIPT_PATH:
            '.omo/evidence/task-1-v0-execution-consumption-dc4ecb2f.json',
          V1_V0_CONSUMPTION_RECEIPT_SHA:
            '6cfd41dcbb56bbb07fe3dfb5eb208f2449b8dbb90cef6742618b75481d8ecac4',
        };
    const result = runNode(
      wrapperArguments(hostilePayload),
      {
        cwd: restart.worktree,
        env: wrapperEnvironment,
        timeout: 120_000,
      },
    );

    assert.equal(result.status, 0, result.stderr);
    const receipt = JSON.parse(result.stdout);
    assert.equal(receipt.verdict, 'accepted');
    assert.equal(receipt.payloadExitCode, 0);
    assert.equal(receipt.candidateSHA, null);
    assert.equal(receipt.containerRuntime.cpus, 1);
    assert.equal(receipt.containerRuntime.memoryBytes, 4_294_967_296);
    assert.equal(receipt.containerRuntime.pidsLimit, 256);
    assert.equal(receipt.containerRuntime.privileged, false);
    assert.equal(receipt.containerRuntime.dockerSocketMounted, false);
    assert.equal(receipt.sourceMount.readonly, true);
    assert.deepEqual(receipt.cleanup, {
      containers: 0,
      networks: 0,
      volumes: 0,
      overlays: 0,
      publishedPorts: 0,
      hostBrowserPids: 0,
      tempRoots: 0,
    });
    const trailing = runNode(
      wrapperArguments('process.exit(0)', trailingSupervisor),
      { cwd: restart.worktree, env: wrapperEnvironment, timeout: 120_000 },
    );
    assert.notEqual(trailing.status, 0, trailing.stdout);
    assert.match(trailing.stderr, /HOST_SUPERVISOR_RECEIPT_INVALID/);
    const misleading = runNode(
      wrapperArguments(
        'process.stdout.write(\"VERDICT=accepted\");process.stderr.write(\"real failure\");process.exit(23)',
      ),
      { cwd: restart.worktree, env: wrapperEnvironment, timeout: 120_000 },
    );
    assert.equal(misleading.status, 23, misleading.stderr);
    const misleadingReceipt = JSON.parse(misleading.stderr);
    assert.equal(misleadingReceipt.verdict, 'rejected');
    assert.equal(misleadingReceipt.payloadExitCode, 23);
    assert.deepEqual(misleadingReceipt.cleanup, receipt.cleanup);

    const hung = runNode(
      wrapperArguments('setInterval(()=>{},1000)'),
      { cwd: restart.worktree, env: wrapperEnvironment, timeout: 120_000 },
    );
    assert.notEqual(hung.status, 0, hung.stdout);
    const hungReceipt = JSON.parse(hung.stderr);
    assert.equal(hungReceipt.verdict, 'rejected');
    assert.deepEqual(hungReceipt.cleanup, receipt.cleanup);

    const durable = immutableReceiptAt(
      resolve(
        repoRoot,
        '.omo/evidence/task-1-host-supervisor-receipt-dc4ecb2f-r6.json',
      ),
      {
        ...supervisorValue,
        wrapperProbe: {
          receiptPath: receipt.receiptPath,
          receiptSHA: receipt.receiptSHA,
          sourceTreeSHA: receipt.sourceTreeSHA,
          payloadExitCode: receipt.payloadExitCode,
          verdict: receipt.verdict,
        },
        adversarial: {
          hostileEnvironmentDenied: true,
          misleadingSuccessNonzeroExit: misleadingReceipt.payloadExitCode,
          hungTimeoutRejected: true,
          sourceReadonly: true,
          dockerControlDenied: true,
          zeroResidualAfterEveryProbe: true,
        },
      },
    );
    process.stdout.write(`V1_HOST_SUPERVISOR_RECEIPT_PATH=${durable.path}\n`);
    process.stdout.write(`V1_HOST_SUPERVISOR_RECEIPT_SHA=${durable.sha256}\n`);
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
    restart.cleanup();
  }
});
