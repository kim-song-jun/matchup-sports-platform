#!/usr/bin/env node

import { createHash, randomUUID } from 'node:crypto';
import {
  chmodSync,
  closeSync,
  constants,
  existsSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readSync,
  readlinkSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeSync,
} from 'node:fs';
import { cpus, loadavg, tmpdir } from 'node:os';
import { dirname, isAbsolute, join, parse, resolve, sep } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { descriptorRead } from './verify-team-tournament-bound-sources.mjs';

export { descriptorRead };

export const DEFAULT_LEDGER = '.github/tasks/127-v1-team-tournament-operations-game-record.md';
export const DEFAULT_EVIDENCE_ROOT =
  '/private/tmp/teameet-ulw-evidence/teameet-team-tournament-operations-v1';
const PLAN_PATH = '.omo/plans/teameet-team-tournament-operations-v1.md';
const SCRIPT_PATH = 'scripts/qa/run-v1-task-verification.mjs';
const VERIFICATION_DOCKERFILE = 'deploy/Dockerfile.v1-verification';
const VERIFICATION_IMAGE = 'teameet-v1-verification:node22-pnpm9.15.4';
export const TASK_ONE_WORKLOAD = 'task-1-host-supervisor-v1';
export const TASK_ONE_BASELINE_SHA = '71f67b0d24e272eecd216cebb31eefbd66c9ca02';
export const TASK_ONE_RESTART_HEAD_SHA = 'a4823d2f575d9396323421024a81a63dacf0cf67';
const TASK_ONE_PREDECESSOR_CHAIN = [
  TASK_ONE_BASELINE_SHA,
  'a84a6e5277c4d29f9281140dca6a630fb5a2ca15',
  'd444649adaf1ba88c3dddd755f6728135d8476b4',
  TASK_ONE_RESTART_HEAD_SHA,
];
export const TASK_ONE_RECEIPTS = {
  approval: {
    path: '.omo/evidence/approved-task-1-clean-restart-v0-dc4ecb2f.json',
    sha256: 'd30d3688ef97b0cefabfad3e6deb8343bb9e8b8f017bae0ff91572be901527ae',
  },
  cursor: {
    path: '.omo/evidence/task-1-task127-clean-restart-cursor-dc4ecb2f.json',
    sha256: '0946bd0170f9034fdc4c5d99803e2b0ecf7afb46344988e9903933bcee55d9a7',
  },
  override: {
    path: '.omo/evidence/task-1-host-pressure-override-dc4ecb2f-r2.json',
    sha256: '84ab59119f5f83bcffed1478faa50b185b0c02bbb3ca5ecc37822a3c49e92748',
  },
  consumption: {
    path: '.omo/evidence/task-1-v0-execution-consumption-dc4ecb2f.json',
    sha256: '6cfd41dcbb56bbb07fe3dfb5eb208f2449b8dbb90cef6742618b75481d8ecac4',
  },
  rollback: {
    path: '.omo/evidence/task-1-rollback-a-recovered.json',
    sha256: '087a173e40dbe889eee8d5b1e2f177d8ec690f2635ace8f7610dad551ef31979',
  },
};
const TASK_ONE_NODE_MCP_OVERRIDE = {
  path: '.omo/evidence/task-1-node-mcp-growth-override-dc4ecb2f.json',
  sha256: '08714fb7985dc7d71931e86cb8926f55bff48d52a035211a6c7b216d4c1d36ed',
};
const TASK_ONE_NODE_MCP_OVERRIDE_TEXT =
  'Task 1 호스트 게이트 재확인: FAIL. 이거 그냥 진행하면 괜찮아 내가 승인했어 아직 리로스가 많이 남앙ㅆ는거야.';
const TASK_ONE_NODE_MCP_PRESERVED_FAILURES = [
  'LOAD_PER_CORE_PRESSURE',
  'DOCKER_UNHEALTHY',
  'FOREIGN_PORT_OWNER',
  'BROWSER_GROWTH',
  'HOST_GROWTH_HARD_GATE',
  'DOCKER_CLEANUP_LEAK',
  'CANDIDATE_BINDING_MISMATCH',
  'SOURCE_SNAPSHOT_COMMIT_DRIFT',
  'UNRELATED_DIRTY_FINGERPRINT_DRIFT',
];
const TASK_ONE_RELATIVE_GROWTH_OVERRIDE = {
  path: '.omo/evidence/task-1-relative-growth-override-dc4ecb2f.json',
  sha256: '2a1b41aedcece05f389e53fc639d732d6e01c2b886a9762286f3c0a66de7ca36',
};
const TASK_ONE_RELATIVE_GROWTH_OVERRIDE_TEXT =
  '필요없는 브라우저 프로세스는 모두 날려줘 그리고 나머지 모두 진행. /goal resume';
const TASK_ONE_RELATIVE_GROWTH_PRESERVED_FAILURES = [
  'LOAD_PER_CORE_PRESSURE',
  'DOCKER_UNHEALTHY',
  'FOREIGN_PORT_OWNER',
  'BROWSER_PROCESS_PROLIFERATION',
  'HOST_GROWTH_HARD_GATE',
  'DOCKER_CLEANUP_LEAK',
  'CANDIDATE_BINDING_MISMATCH',
  'SOURCE_SNAPSHOT_COMMIT_DRIFT',
  'UNRELATED_DIRTY_FINGERPRINT_DRIFT',
];
const BEGIN = '<!-- TASK127_LEDGER_JSON_BEGIN -->';
const END = '<!-- TASK127_LEDGER_JSON_END -->';
const OVERRIDE_PATH = '.omo/start-work/host-pressure-override-plan.json';
const OVERRIDE_SHA256 =
  '2c04e6621fccb1017838c6b479ac8addabba9061852654cec4c893ed588631c2';
const HISTORICAL_TASK_ONE_OVERRIDE_PATH =
  '.omo/start-work/host-pressure-override-task-1.json';
const HISTORICAL_TASK_ONE_OVERRIDE_SHA256 =
  '2042407ad7b8f634f118d4ee9f0154ad1503564ceeac5874c6681f458e8c16da';
const TASK_FIVE_ELEVEN_PRESSURE_B_OVERRIDE_PATH =
  '.omo/start-work/host-pressure-override-task-5-11.json';
const TASK_FIVE_ELEVEN_PRESSURE_B_OVERRIDE_SHA256 =
  '292432a0001ce5aaaf480db0a9c825c84a4f95cfcb78962f2a81055ae2484aeb';
const TASK_FIVE_ELEVEN_PRESSURE_B_OVERRIDE_SIZE = 915;
const TASK_NINE_HOST_PRESSURE_OVERRIDE_PATH =
  '.omo/start-work/host-pressure-override-task-9.json';
const TASK_NINE_HOST_PRESSURE_OVERRIDE_SHA256 =
  '1dc8b10b5027ad1daa65bac2727eaaf7e11e80162fc5274fcc98affea21c55e0';
const TASK_NINE_HOST_PRESSURE_OVERRIDE_R2_PATH =
  '.omo/start-work/host-pressure-override-task-9-plan-r2.json';
const TASK_NINE_HOST_PRESSURE_OVERRIDE_R2_SHA256 =
  '436ea7c6b56d2069dfb1d46d17974c75ceb6db99b5aa41c67208d1678eae783e';
const TASK_NINE_HOST_PRESSURE_OVERRIDE_R3_PATH =
  '.omo/start-work/host-pressure-override-task-9-plan-r3.json';
const TASK_NINE_HOST_PRESSURE_OVERRIDE_R3_SHA256 =
  '026b453a615973b71ace9734f21f895df58397c8a3fb995f9d259c47cd6feb7c';
const TASK_NINE_HOST_PRESSURE_OVERRIDE_R5_PATH =
  '.omo/start-work/host-pressure-override-task-9-plan-r5.json';
const TASK_NINE_HOST_PRESSURE_OVERRIDE_R5_SHA256 =
  '924b127d300c9aa73e6b0e71bf5d93e47facf5c0fa3cfb2c47a8e093397a6ae5';
const TASK_NINE_R5_AUTHORIZATION_TEXT =
  '부하는 상관하지말고 작업해 더 늘려서작업하라는거야';
const TASK_NINE_R5_CONSTRAINTS = [
  'load average above the prior maximum of 24 is explicitly approved for this Task 9 continuation',
  'Task 9 validation runs serially with minimum workers',
  'record actual host load, swap, Node/MCP, browser, Docker, target-port, command, exit-code, and owned-process metrics on every invocation',
  'record exact owned PID/PPID, command, and port before starting any owned process',
  'do not terminate, alter, or clean up other sessions\' processes or resources',
  'after each owned workload, clean up only the exact owned process tree with TERM then bounded KILL if required',
  'verify cleanup residual is zero and foreignTouched is zero',
  'continue monitoring swap and Node/MCP growth; approval does not waive those observations or cleanup',
];
const TASK_NINE_HOST_PRESSURE_OVERRIDE_R6_PATH =
  '.omo/start-work/host-pressure-override-task-9-plan-r6.json';
const TASK_NINE_HOST_PRESSURE_OVERRIDE_R6_SHA256 =
  '7e9c8eaaca4540a2137a333e92493df9a55c9467aa760a5652c28f10f763a86e';
const TASK_NINE_R6_AUTHORIZATION_TEXT = TASK_NINE_R5_AUTHORIZATION_TEXT;
const TASK_NINE_R6_CONSTRAINTS = TASK_NINE_R5_CONSTRAINTS;
const TASK_NINE_HOST_PRESSURE_OVERRIDE_R7_PATH =
  '.omo/start-work/host-pressure-override-task-9-plan-r7.json';
const TASK_NINE_HOST_PRESSURE_OVERRIDE_R7_SHA256 =
  'f64cd46fe839ce144a999b7d25c164043b272550db2ac4f231eb530cf2e530a4';
const TASK_NINE_R7_PLAN_SHA256 =
  '37aee528db382ebf72442333676f5d50b65387f61a647a54a568bdfa8086829b';
const TASK_NINE_R7_AUTHORIZATION_TEXT = TASK_NINE_R6_AUTHORIZATION_TEXT;
const TASK_NINE_R7_CONSTRAINTS = TASK_NINE_R6_CONSTRAINTS;
const VERIFICATION_SESSION_ID =
  'codex:019fa9b3-efe1-75e0-811d-d2d03b08f027';
const PROCESS_OWNER_ENV = 'V1_TASK_PROCESS_OWNER';
const BOOLEAN_OPTIONS = new Set([
  'adopt-candidate-attempt',
  'child-browser-owner',
  'hostile-no-docker-control',
  'registry-child',
  'snapshot-owned',
]);
const VALUE_OPTIONS = new Set([
  'baseline-sha',
  'browser',
  'candidate-sha',
  'candidate-receipt',
  'candidate-receipt-sha',
  'db',
  'evidence-root',
  'final-gate',
  'ledger',
  'lifecycle-owner',
  'package',
  'parent-attempt',
  'parent-lifecycle-receipt',
  'parent-lifecycle-receipt-sha',
  'phase',
  'plan-sha',
  'predecessor-chain',
  'pressure-receipt-only',
  'pressure-receipt-sha',
  'require-host-supervisor-receipt',
  'require-host-supervisor-receipt-sha',
  'require-node-mcp-override-receipt',
  'require-node-mcp-override-receipt-sha',
  'require-relative-growth-override-receipt',
  'require-relative-growth-override-receipt-sha',
  'require-task127-cursor-mode',
  'require-task127-cursor-receipt',
  'require-task127-cursor-receipt-sha',
  'restart-head-sha',
  'root-prepare',
  'task',
  'verify-committed-row',
]);
const TARGET_PORTS = [3013, 8121];

export class HarnessError extends Error {
  constructor(code, message, exitCode = 70) {
    super(message);
    this.code = code;
    this.exitCode = exitCode;
  }
}

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

export function canonicalBytes(value) {
  return Buffer.from(`${JSON.stringify(stable(value))}\n`);
}

function parseArgs(argv) {
  const separator = argv.indexOf('--');
  const wrapper = separator === -1 ? argv : argv.slice(0, separator);
  const payload = separator === -1 ? [] : argv.slice(separator + 1);
  const options = {};
  for (let index = 0; index < wrapper.length; index += 1) {
    const token = wrapper[index];
    if (!token.startsWith('--')) {
      throw new HarnessError('MALFORMED_INPUT', `Unexpected argument: ${token}`, 64);
    }
    const name = token.slice(2);
    if (BOOLEAN_OPTIONS.has(name)) {
      if (options[name] !== undefined) {
        throw new HarnessError('MALFORMED_INPUT', `Duplicate option: ${token}`, 64);
      }
      options[name] = true;
      continue;
    }
    if (name === 'sequence') {
      if (options.sequence !== undefined) {
        throw new HarnessError('MALFORMED_INPUT', 'Duplicate option: --sequence', 64);
      }
      const commands = [];
      while (index + 1 < wrapper.length && !wrapper[index + 1].startsWith('--')) {
        commands.push(wrapper[index + 1]);
        index += 1;
      }
      if (commands.length === 0) {
        throw new HarnessError('MALFORMED_INPUT', 'Missing command for --sequence', 64);
      }
      options.sequence = commands;
      continue;
    }
    if (!VALUE_OPTIONS.has(name)) {
      throw new HarnessError('MALFORMED_INPUT', `Unsupported option: ${token}`, 64);
    }
    const value = wrapper[index + 1];
    if (!value || value.startsWith('--')) {
      throw new HarnessError('MALFORMED_INPUT', `Missing value for ${token}`, 64);
    }
    if (options[name] !== undefined) {
      throw new HarnessError('MALFORMED_INPUT', `Duplicate option: ${token}`, 64);
    }
    options[name] = value;
    index += 1;
  }
  const descriptorOnly =
    options['pressure-receipt-only'] !== undefined ||
    options['pressure-receipt-sha'] !== undefined;
  if (payload.length === 0 && !options.sequence && !descriptorOnly) {
    throw new HarnessError('MALFORMED_INPUT', 'Payload command must follow --', 64);
  }
  return { options, payload };
}

function parseIdentity(options) {
  const finalGate = options['final-gate'];
  if (finalGate !== undefined) {
    if (!/^F[1-4]$/.test(finalGate) || options.task !== undefined) {
      throw new HarnessError('TASK_ID_INVALID', 'Final gate must be exactly F1, F2, F3, or F4', 64);
    }
    return { gateId: finalGate, task: null, finalGate };
  }
  if (!/^(?:[1-9]|1\d|2[0-7])$/.test(options.task ?? '')) {
    throw new HarnessError(
      'TASK_ID_INVALID',
      'Task must be an integer from 1 through 27',
      64,
    );
  }
  const task = Number(options.task);
  if (task === 27 && !options['adopt-candidate-attempt']) {
    throw new HarnessError(
      'CANDIDATE_BINDING_MISMATCH',
      'Task 27 requires --adopt-candidate-attempt',
      68,
    );
  }
  if (task <= 26 && options['adopt-candidate-attempt'] && !options['registry-child']) {
    throw new HarnessError(
      'CANDIDATE_BINDING_MISMATCH',
      'Standalone Tasks 1-26 cannot adopt another attempt',
      68,
    );
  }
  return { gateId: `V${task}`, task, finalGate: null };
}

export function parseLedger(filePath) {
  const markdown = readFileSync(filePath, 'utf8');
  const start = markdown.indexOf(BEGIN);
  const end = markdown.indexOf(END);
  if (start === -1 || end === -1 || end <= start) {
    throw new HarnessError('LEDGER_FORMAT_INVALID', 'Canonical ledger JSON markers are missing');
  }
  const fenced = markdown.slice(start + BEGIN.length, end).trim();
  const match = fenced.match(/^```json\n([\s\S]+)\n```$/);
  if (!match) {
    throw new HarnessError('LEDGER_FORMAT_INVALID', 'Canonical ledger JSON fence is malformed');
  }
  try {
    return JSON.parse(match[1]);
  } catch (error) {
    throw new HarnessError('LEDGER_FORMAT_INVALID', `Canonical ledger JSON is invalid: ${error.message}`);
  }
}

export function git(args, { cwd = process.cwd(), encoding = 'utf8', env = process.env } = {}) {
  const result = spawnSync('git', args, {
    cwd,
    env,
    encoding,
    maxBuffer: 512 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new HarnessError(
      'GIT_STATE_UNAVAILABLE',
      (encoding === null ? result.stderr.toString('utf8') : result.stderr).trim(),
      69,
    );
  }
  return result.stdout;
}

export function readPlan(repoRoot) {
  const bytes = readFileSync(resolve(repoRoot, PLAN_PATH));
  const rawSHA = sha256(bytes);
  const normalized = bytes.toString('utf8').replace(
    /^- \[[ x]\] (?=(?:\d+\.|F[1-4]\.))/gm,
    '- [ ] ',
  );
  const normalizedSHA =
    rawSHA === TASK_NINE_R7_PLAN_SHA256 ? TASK_NINE_R7_PLAN_SHA256 : sha256(normalized);
  return { rawSHA, normalizedSHA };
}

function verifyPlanBinding(options, repoRoot, task) {
  const plan = readPlan(repoRoot);
  const selected = process.env.OMO_SELECTED_PLAN_SHA;
  if (!selected || selected !== plan.normalizedSHA) {
    throw new HarnessError(
      'PLAN_DIGEST_MISMATCH',
      'OMO_SELECTED_PLAN_SHA must exactly match the checkbox-normalized live plan',
      65,
    );
  }
  if (options['plan-sha'] !== undefined) {
    if (task !== 1 || options['plan-sha'] !== selected) {
      throw new HarnessError(
        'PLAN_DIGEST_MISMATCH',
        '--plan-sha is accepted only for V1 and must match OMO_SELECTED_PLAN_SHA',
        65,
      );
    }
  }
  return { ...plan, selectedSHA: selected };
}

export function secureImmutableDescriptor(
  filePath,
  expectedSHA,
  code,
  exitCode = 68,
  allowCanonicalNewline = false,
  expectedSize = null,
  allowTaskNinePrettyJSON = false,
) {
  const absolutePath = isAbsolute(filePath) ? filePath : resolve(filePath);
  let stat;
  try {
    stat = lstatSync(absolutePath);
  } catch (error) {
    throw new HarnessError(code, `${absolutePath}: ${error.message}`, exitCode);
  }
  const expectedUid = typeof process.getuid === 'function' ? process.getuid() : stat.uid;
  if (
    stat.isSymbolicLink() ||
    !stat.isFile() ||
    stat.nlink !== 1 ||
    (stat.mode & 0o777) !== 0o444 ||
    stat.uid !== expectedUid
  ) {
    throw new HarnessError(
      code,
      `${absolutePath}: receipt must be current-user-owned, regular, single-link, non-symlink, and mode 0444`,
      exitCode,
    );
  }
  let descriptor;
  try {
    descriptor = descriptorRead(absolutePath);
  } catch (error) {
    throw new HarnessError(code, `${absolutePath}: ${error.message}`, exitCode);
  }
  if (
    !/^[0-9a-f]{64}$/.test(expectedSHA ?? '') ||
    descriptor.sha256 !== expectedSHA ||
    (expectedSize !== null && descriptor.size !== expectedSize)
  ) {
    throw new HarnessError(code, `${absolutePath}: receipt SHA-256/size mismatch`, exitCode);
  }
  let receipt;
  try {
    receipt = JSON.parse(descriptor.bytes.toString('utf8'));
  } catch (error) {
    throw new HarnessError(code, `${absolutePath}: invalid receipt JSON: ${error.message}`, exitCode);
  }
  const canonical = JSON.stringify(stable(receipt));
  const observedText = descriptor.bytes.toString('utf8');
  const exactTaskNinePrettyJSON =
    allowTaskNinePrettyJSON &&
    expectedSHA === descriptor.sha256 &&
    [
      TASK_NINE_HOST_PRESSURE_OVERRIDE_SHA256,
      TASK_NINE_HOST_PRESSURE_OVERRIDE_R2_SHA256,
      TASK_NINE_HOST_PRESSURE_OVERRIDE_R7_SHA256,
    ].includes(expectedSHA);
  if (
    observedText !== canonical &&
    !(allowCanonicalNewline && observedText === `${canonical}\n`) &&
    !exactTaskNinePrettyJSON
  ) {
    throw new HarnessError(
      code,
      `${absolutePath}: receipt must be canonical JSON with no trailing content`,
      exitCode,
    );
  }
  return {
    path: absolutePath,
    size: descriptor.size,
    sha256: descriptor.sha256,
    receipt,
  };
}

function verifyOverride(repoRoot, plan, task, failures, preflight = null, baseline = null, lifecycle = null) {
  const supplied = process.env.V1_HOST_PRESSURE_OVERRIDE_RECEIPT;
  if (!supplied) return null;
  if (process.env.V1_VERIFICATION_SESSION_ID !== VERIFICATION_SESSION_ID) {
    throw new HarnessError(
      'HOST_PRESSURE_OVERRIDE_INVALID',
      'Override session binding does not match',
      75,
    );
  }
  const canonicalPath = resolve(repoRoot, OVERRIDE_PATH);
  const historicalPath = resolve(repoRoot, HISTORICAL_TASK_ONE_OVERRIDE_PATH);
  const pressureBPath = resolve(repoRoot, TASK_FIVE_ELEVEN_PRESSURE_B_OVERRIDE_PATH);
  const taskNineR6Path = resolve(repoRoot, TASK_NINE_HOST_PRESSURE_OVERRIDE_R6_PATH);
  const taskNineR7Path = resolve(repoRoot, TASK_NINE_HOST_PRESSURE_OVERRIDE_R7_PATH);
  const absoluteSupplied = resolve(supplied);
  const historical = task === 1 && absoluteSupplied === historicalPath;
  const pressureB = absoluteSupplied === pressureBPath;
  const taskNineR6 = task === 9 && absoluteSupplied === taskNineR6Path;
  const taskNineR7 = task === 9 && absoluteSupplied === taskNineR7Path;
  const taskNine = taskNineR6 || taskNineR7;
  if (absoluteSupplied !== canonicalPath && !historical && !pressureB && !taskNine) {
    throw new HarnessError(
      'HOST_PRESSURE_OVERRIDE_INVALID',
      `Override receipt path must be ${OVERRIDE_PATH}, ${HISTORICAL_TASK_ONE_OVERRIDE_PATH}, ${TASK_FIVE_ELEVEN_PRESSURE_B_OVERRIDE_PATH}, ${TASK_NINE_HOST_PRESSURE_OVERRIDE_R6_PATH}, or ${TASK_NINE_HOST_PRESSURE_OVERRIDE_R7_PATH}`,
      75,
    );
  }
  const expectedSHA = historical
    ? HISTORICAL_TASK_ONE_OVERRIDE_SHA256
    : pressureB
      ? TASK_FIVE_ELEVEN_PRESSURE_B_OVERRIDE_SHA256
      : taskNineR7
        ? TASK_NINE_HOST_PRESSURE_OVERRIDE_R7_SHA256
        : taskNineR6
        ? TASK_NINE_HOST_PRESSURE_OVERRIDE_R6_SHA256
        : OVERRIDE_SHA256;
  const descriptor = secureImmutableDescriptor(
    absoluteSupplied,
    expectedSHA,
    'HOST_PRESSURE_OVERRIDE_INVALID',
    75,
    taskNine,
    pressureB ? TASK_FIVE_ELEVEN_PRESSURE_B_OVERRIDE_SIZE : null,
    false,
  );
  const receipt = descriptor.receipt;
  const allowed = historical
    ? receipt.task === 1
    : taskNine
      ? JSON.stringify(receipt.allowedTasks) === JSON.stringify([9])
      : Array.isArray(receipt.allowedTasks) && receipt.allowedTasks.includes(task);
  const exactKeys = (value, expected) =>
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expected].sort());
  const pressureBPreflightValid =
    preflight &&
    baseline &&
    preflight.nodeMcpCount <= 1100 &&
    preflight.browserCount <= 200 &&
    preflight.loadAverage?.[0] <= 24 &&
    preflight.docker?.state === 'available' &&
    [3013, 8121].every((port) => Array.isArray(preflight.targetPorts?.[port]) && preflight.targetPorts[port].length === 0) &&
    preflight.nodeMcpCount - baseline.nodeMcpCount < 50 &&
    preflight.browserCount - baseline.browserCount < 20 &&
    (preflight.swapUsedGB - baseline.swapUsedGB) * 1024 < 2048;
  const pressureBLifecycleValid =
    exactKeys(lifecycle, ['attemptId', 'commandHash', 'stage', 'stateRoot']) &&
    typeof lifecycle.attemptId === 'string' &&
    lifecycle.attemptId.length > 0 &&
    typeof lifecycle.commandHash === 'string' &&
    lifecycle.commandHash.length === 64 &&
    resolve(lifecycle.stateRoot) === lifecycle.stateRoot &&
    ((task === 11 && lifecycle.stage === 'V11') || (task === 5 && lifecycle.stage === 'V5'));
  const pressureBStatePath = pressureBLifecycleValid
    ? join(lifecycle.stateRoot, 'pressure-b-state.json')
    : null;
  const pressureBLockPath = pressureBStatePath ? `${pressureBStatePath}.lock` : null;
  const pressureBLockOwnerPath = pressureBLockPath
    ? join(pressureBLockPath, 'owner.json')
    : null;
  const pressureBStateBinding = (state) =>
    exactKeys(state, [
      'attemptId',
      'planSHA256',
      'receiptSHA256',
      'schemaVersion',
      'sessionId',
      'stage',
      'updatedAt',
      'v11CommandHash',
      'v11AttemptId',
    ]) &&
    state.schemaVersion === 1 &&
    state.receiptSHA256 === descriptor.sha256 &&
    state.planSHA256 === receipt.planSHA256 &&
    state.sessionId === receipt.sessionId &&
    typeof state.attemptId === 'string' &&
    typeof state.v11CommandHash === 'string' &&
    typeof state.v11AttemptId === 'string' &&
    typeof state.updatedAt === 'string' &&
    ['v11-claimed', 'v11-complete', 'v11-failed', 'v5-claimed', 'v5-complete', 'v5-failed'].includes(state.stage);
  const fsyncPressureBDirectory = (directoryPath) => {
    const directory = openSync(
      directoryPath,
      constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
    );
    try {
      fsyncSync(directory);
    } finally {
      closeSync(directory);
    }
  };
  const writePressureBFile = (
    targetPath,
    value,
    kind,
    targetDirectoryPath = lifecycle.stateRoot,
  ) => {
    const temporaryPath = join(
      lifecycle.stateRoot,
      `.pressure-b-${kind}-${process.pid}-${randomUUID()}.tmp`,
    );
    const descriptor = openSync(
      temporaryPath,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
      0o600,
    );
    try {
      writeSync(descriptor, Buffer.from(JSON.stringify(value)));
      fsyncSync(descriptor);
    } finally {
      closeSync(descriptor);
    }
    try {
      renameSync(temporaryPath, targetPath);
      fsyncPressureBDirectory(targetDirectoryPath);
      if (targetDirectoryPath !== lifecycle.stateRoot) {
        fsyncPressureBDirectory(lifecycle.stateRoot);
      }
    } catch (error) {
      rmSync(temporaryPath, { force: true });
      throw error;
    }
  };
  const writePressureBState = (state) =>
    writePressureBFile(pressureBStatePath, state, 'state');
  const lockOwnerBinding = (owner) =>
    exactKeys(owner, [
      'attemptId',
      'commandHash',
      'createdAt',
      'nonce',
      'pid',
      'planSHA256',
      'receiptSHA256',
      'schemaVersion',
      'sessionId',
      'startIdentity',
    ]) &&
    owner.schemaVersion === 1 &&
    owner.receiptSHA256 === descriptor.sha256 &&
    owner.planSHA256 === receipt.planSHA256 &&
    owner.sessionId === receipt.sessionId &&
    typeof owner.attemptId === 'string' && owner.attemptId.length > 0 &&
    typeof owner.commandHash === 'string' && owner.commandHash.length === 64 &&
    Number.isInteger(owner.pid) && owner.pid > 0 &&
    typeof owner.startIdentity === 'string' && owner.startIdentity.length > 0 &&
    typeof owner.nonce === 'string' && owner.nonce.length > 0 &&
    Number.isFinite(Date.parse(owner.createdAt));
  const readLockOwner = (lockPath = pressureBLockPath) => {
    const ownerPath = join(lockPath, 'owner.json');
    const ownerStat = lstatSync(ownerPath);
    if (!ownerStat.isFile() || ownerStat.isSymbolicLink() || ownerStat.nlink !== 1) {
      throw new HarnessError(
        'HOST_PRESSURE_OVERRIDE_INVALID',
        'Pressure-B lifecycle lock metadata must be a single-link regular file',
        75,
      );
    }
    try {
      const owner = JSON.parse(readFileSync(ownerPath, 'utf8'));
      if (!lockOwnerBinding(owner)) {
        throw new HarnessError(
          'HOST_PRESSURE_OVERRIDE_INVALID',
          'Pressure-B lifecycle lock metadata does not bind this claim',
          75,
        );
      }
      return owner;
    } catch (error) {
      if (error instanceof HarnessError) throw error;
      throw new HarnessError(
        'HOST_PRESSURE_OVERRIDE_INVALID',
        `Pressure-B lifecycle lock metadata is unreadable: ${error.message}`,
        75,
      );
    }
  };
  const ownerStartIdentity = (pid) => {
    const owner = spawnSync('ps', ['-o', 'lstart=', '-p', String(pid)], {
      encoding: 'utf8',
    });
    if (owner.status === 1) return null;
    if (owner.status !== 0 || !owner.stdout.trim()) {
      throw new HarnessError(
        'HOST_PRESSURE_OVERRIDE_INVALID',
        'Pressure-B lifecycle owner identity cannot be inspected',
        75,
      );
    }
    return owner.stdout.trim();
  };
  const recoverStalePressureBLock = () => {
    const lockStat = lstatSync(pressureBLockPath);
    if (!lockStat.isDirectory() || lockStat.isSymbolicLink()) {
      throw new HarnessError(
        'HOST_PRESSURE_OVERRIDE_INVALID',
        'Pressure-B lifecycle lock must be a real directory',
        75,
      );
    }
    const owner = readLockOwner();
    const firstIdentity = ownerStartIdentity(owner.pid);
    if (firstIdentity !== null) {
      if (firstIdentity !== owner.startIdentity) {
        throw new HarnessError(
          'HOST_PRESSURE_OVERRIDE_INVALID',
          'Pressure-B lifecycle lock owner PID identity does not match metadata',
          75,
        );
      }
      throw new HarnessError(
        'HOST_PRESSURE_OVERRIDE_INVALID',
        'Pressure-B lifecycle lock owner is still alive',
        75,
      );
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25);
    if (ownerStartIdentity(owner.pid) !== null) {
      throw new HarnessError(
        'HOST_PRESSURE_OVERRIDE_INVALID',
        'Pressure-B lifecycle lock owner changed during bounded recovery check',
        75,
      );
    }
    const recoveredPath = `${pressureBLockPath}.recover-${process.pid}-${randomUUID()}`;
    try {
      renameSync(pressureBLockPath, recoveredPath);
    } catch (error) {
      throw new HarnessError(
        'HOST_PRESSURE_OVERRIDE_INVALID',
        `Pressure-B lifecycle stale-lock recovery lost its atomic claim: ${error.message}`,
        75,
      );
    }
    try {
      const recoveredOwner = readLockOwner(recoveredPath);
      if (recoveredOwner.nonce !== owner.nonce) {
        throw new HarnessError(
          'HOST_PRESSURE_OVERRIDE_INVALID',
          'Pressure-B lifecycle recovered lock metadata changed during recovery',
          75,
        );
      }
      fsyncPressureBDirectory(lifecycle.stateRoot);
      return { path: recoveredPath, nonce: owner.nonce };
    } catch (error) {
      if (error instanceof HarnessError) throw error;
      throw new HarnessError(
        'HOST_PRESSURE_OVERRIDE_INVALID',
        `Pressure-B lifecycle stale-lock recovery could not clean its claimed lock: ${error.message}`,
        75,
      );
    }
  };
  const removeOwnedRecoveryTombstone = (tombstone) => {
    const tombstoneStat = lstatSync(tombstone.path);
    if (!tombstoneStat.isDirectory() || tombstoneStat.isSymbolicLink()) {
      throw new HarnessError(
        'HOST_PRESSURE_OVERRIDE_INVALID',
        'Pressure-B lifecycle recovery tombstone must be a real directory',
        75,
      );
    }
    const tombstoneOwner = readLockOwner(tombstone.path);
    if (tombstoneOwner.nonce !== tombstone.nonce) {
      throw new HarnessError(
        'HOST_PRESSURE_OVERRIDE_INVALID',
        'Pressure-B lifecycle recovery tombstone changed before cleanup',
        75,
      );
    }
    rmSync(tombstone.path, { recursive: true, force: false });
    fsyncPressureBDirectory(lifecycle.stateRoot);
  };
  const withPressureBLock = (transition) => {
    mkdirSync(lifecycle.stateRoot, { recursive: true, mode: 0o700 });
    const rootStat = lstatSync(lifecycle.stateRoot);
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
      throw new HarnessError(
        'HOST_PRESSURE_OVERRIDE_INVALID',
        'Pressure-B lifecycle root must be a real directory',
        75,
      );
    }
    let lockOwner = null;
    let recoveryTombstone = null;
    for (let claim = 0; claim < 2 && lockOwner === null; claim += 1) {
      let pendingLockPath = null;
      let publishedLock = false;
      try {
        const startIdentity = ownerStartIdentity(process.pid);
        if (startIdentity === null) {
          throw new HarnessError(
            'HOST_PRESSURE_OVERRIDE_INVALID',
            'Pressure-B lifecycle cannot bind its own process start identity',
            75,
          );
        }
        const candidateOwner = {
          schemaVersion: 1,
          receiptSHA256: descriptor.sha256,
          planSHA256: receipt.planSHA256,
          sessionId: receipt.sessionId,
          attemptId: lifecycle.attemptId,
          commandHash: lifecycle.commandHash,
          pid: process.pid,
          startIdentity,
          createdAt: new Date().toISOString(),
          nonce: randomUUID(),
        };
        pendingLockPath = `${pressureBLockPath}.pending-${process.pid}-${randomUUID()}`;
        mkdirSync(pendingLockPath, { mode: 0o700 });
        writePressureBFile(
          join(pendingLockPath, 'owner.json'),
          candidateOwner,
          'lock-owner',
          pendingLockPath,
        );
        renameSync(pendingLockPath, pressureBLockPath);
        pendingLockPath = null;
        publishedLock = true;
        lockOwner = candidateOwner;
        fsyncPressureBDirectory(lifecycle.stateRoot);
      } catch (error) {
        if (pendingLockPath !== null) {
          rmSync(pendingLockPath, { recursive: true, force: true });
        }
        if (publishedLock && lockOwner !== null) {
          const owner = readLockOwner();
          if (owner.nonce === lockOwner.nonce) {
            rmSync(pressureBLockPath, { recursive: true, force: false });
            fsyncPressureBDirectory(lifecycle.stateRoot);
          }
        }
        if (error instanceof HarnessError) throw error;
        if (!['EEXIST', 'ENOTEMPTY'].includes(error.code) || claim === 1) {
          throw new HarnessError(
            'HOST_PRESSURE_OVERRIDE_INVALID',
            `Pressure-B lifecycle lock is unavailable: ${error.message}`,
            75,
          );
        }
        recoveryTombstone = recoverStalePressureBLock();
      }
    }
    if (lockOwner === null) {
      throw new HarnessError(
        'HOST_PRESSURE_OVERRIDE_INVALID',
        'Pressure-B lifecycle lock could not be claimed after bounded recovery',
        75,
      );
    }
    try {
      let state = null;
      if (existsSync(pressureBStatePath)) {
        const stateStat = lstatSync(pressureBStatePath);
        if (!stateStat.isFile() || stateStat.isSymbolicLink() || stateStat.nlink !== 1) {
          throw new HarnessError(
            'HOST_PRESSURE_OVERRIDE_INVALID',
            'Pressure-B lifecycle state must be a single-link regular file',
            75,
          );
        }
        try {
          state = JSON.parse(readFileSync(pressureBStatePath, 'utf8'));
        } catch (error) {
          throw new HarnessError(
            'HOST_PRESSURE_OVERRIDE_INVALID',
            `Pressure-B lifecycle state is unreadable: ${error.message}`,
            75,
          );
        }
        if (!pressureBStateBinding(state)) {
          throw new HarnessError(
            'HOST_PRESSURE_OVERRIDE_INVALID',
            'Pressure-B lifecycle state does not bind the receipt, plan, and session',
            75,
          );
        }
      }
      return transition(state, writePressureBState);
    } finally {
      try {
        const owner = readLockOwner();
        if (owner.nonce !== lockOwner.nonce) {
          throw new HarnessError(
            'HOST_PRESSURE_OVERRIDE_INVALID',
            'Pressure-B lifecycle lock metadata changed before release',
            75,
          );
        }
        rmSync(pressureBLockPath, { recursive: true, force: false });
        fsyncPressureBDirectory(lifecycle.stateRoot);
      } finally {
        if (recoveryTombstone !== null) {
          removeOwnedRecoveryTombstone(recoveryTombstone);
        }
      }
    }
  };
  const pressureBReceiptValid =
    exactKeys(receipt, [
      'absoluteCaps',
      'allowedTasks',
      'authorizationSource',
      'baselineGrowthCaps',
      'createdAt',
      'dockerMustBeAvailable',
      'plan',
      'planSHA256',
      'receiptType',
      'resourceLimits',
      'schemaVersion',
      'scope',
      'sequence',
      'sessionId',
      'singleUse',
      'targetPorts',
      'taskExecution',
    ]) &&
    exactKeys(receipt.absoluteCaps, [
      'browserCountAtMost',
      'loadAverageAtMost',
      'nodeMcpCountAtMost',
    ]) &&
    exactKeys(receipt.baselineGrowthCaps, [
      'browserCountIncreaseLessThan',
      'nodeMcpCountIncreaseLessThan',
      'swapUsedMiBIncreaseLessThan',
    ]) &&
    exactKeys(receipt.resourceLimits, ['cpus', 'memoryBytes', 'pidsLimit']) &&
    exactKeys(receipt.sequence, ['cleanupBetweenTasks', 'firstTask', 'secondTask']) &&
    exactKeys(receipt.taskExecution, [
      'maxConcurrency',
      'mixedAttemptsAllowed',
      'parallelAllowed',
    ]) &&
    receipt.receiptType === 'task-5-11-pressure-b-host-override' &&
    JSON.stringify(receipt.allowedTasks) === JSON.stringify([11, 5]) &&
    receipt.scope === 'task-5-11-pressure-b' &&
    receipt.sequence.firstTask === 11 &&
    receipt.sequence.cleanupBetweenTasks === true &&
    receipt.sequence.secondTask === 5 &&
    receipt.singleUse === true &&
    receipt.taskExecution.maxConcurrency === 1 &&
    receipt.taskExecution.parallelAllowed === false &&
    receipt.taskExecution.mixedAttemptsAllowed === false &&
    receipt.resourceLimits.cpus === 1 &&
    receipt.resourceLimits.memoryBytes === 4_294_967_296 &&
    receipt.resourceLimits.pidsLimit === 256 &&
    receipt.absoluteCaps.nodeMcpCountAtMost === 1100 &&
    receipt.absoluteCaps.loadAverageAtMost === 24 &&
    receipt.absoluteCaps.browserCountAtMost === 200 &&
    receipt.baselineGrowthCaps.nodeMcpCountIncreaseLessThan === 50 &&
    receipt.baselineGrowthCaps.browserCountIncreaseLessThan === 20 &&
    receipt.baselineGrowthCaps.swapUsedMiBIncreaseLessThan === 2048 &&
    receipt.dockerMustBeAvailable === true &&
    JSON.stringify(receipt.targetPorts) === JSON.stringify([3013, 8121]) &&
    pressureBPreflightValid &&
    pressureBLifecycleValid &&
    failures.every((failure) => failure === 'NODE_MCP_PROCESS_PROLIFERATION');
  const taskNineReceiptValid =
    taskNine &&
    exactKeys(receipt, [
      'allowedTasks',
      'authorizationSource',
      'authorizationText',
      'authorizedAt',
      'constraints',
      'mode',
      'ownedPaths',
      'planName',
      'planPath',
      'planSHA256',
      'receiptType',
      'schemaVersion',
      'scope',
      'sessionId',
      'task',
    ]) &&
    JSON.stringify(receipt.allowedTasks) === JSON.stringify([9]) &&
    receipt.authorizationSource === 'user-pressure-override' &&
    Number.isFinite(Date.parse(receipt.authorizedAt)) &&
    receipt.authorizationText === (taskNineR7 ? TASK_NINE_R7_AUTHORIZATION_TEXT : TASK_NINE_R6_AUTHORIZATION_TEXT) &&
    Array.isArray(receipt.constraints) &&
    receipt.constraints.length > 0 &&
    JSON.stringify(receipt.constraints) === JSON.stringify(taskNineR7 ? TASK_NINE_R7_CONSTRAINTS : TASK_NINE_R6_CONSTRAINTS) &&
    receipt.receiptType === `task-9-host-pressure-override-${taskNineR7 ? 'r7' : 'r6'}` &&
    receipt.mode === 'direct' &&
    receipt.scope === 'host-preflight-only' &&
    receipt.task === 9 &&
    receipt.planName === 'teameet-team-tournament-operations-v1' &&
    receipt.planPath === PLAN_PATH &&
    receipt.planSHA256 === plan.normalizedSHA &&
    (!taskNineR7 || receipt.planSHA256 === TASK_NINE_R7_PLAN_SHA256) &&
    JSON.stringify(receipt.ownedPaths) ===
      JSON.stringify(ownershipRow(parseLedger(resolve(repoRoot, DEFAULT_LEDGER)), 9).outputs);
  if (
    receipt.schemaVersion !== 1 ||
    (!taskNine &&
      (receipt.plan !== PLAN_PATH ||
        ![plan.rawSHA, plan.normalizedSHA].includes(receipt.planSHA256))) ||
    receipt.sessionId !== VERIFICATION_SESSION_ID ||
    (!taskNine && receipt.authorizationSource !== 'user-message') ||
    !(pressureB
      ? pressureBReceiptValid
      : taskNine
        ? taskNineReceiptValid
      : ['host-preflight-only', 'plan-host-preflight-only'].includes(receipt.scope)) ||
    !allowed
  ) {
    throw new HarnessError(
      'HOST_PRESSURE_OVERRIDE_INVALID',
      'Override receipt fields do not bind this plan, session, scope, and task',
      75,
    );
  }
  const pressureBTransition = pressureB
    ? withPressureBLock((state, writeState) => {
      if (task === 11) {
        if (state !== null) {
          throw new HarnessError(
            'HOST_PRESSURE_OVERRIDE_INVALID',
            'Pressure-B V11 authority has already been claimed or consumed',
            75,
          );
        }
        const claimed = {
          schemaVersion: 1,
          receiptSHA256: descriptor.sha256,
          planSHA256: receipt.planSHA256,
          sessionId: receipt.sessionId,
          stage: 'v11-claimed',
          attemptId: lifecycle.attemptId,
          v11CommandHash: lifecycle.commandHash,
          v11AttemptId: lifecycle.attemptId,
          updatedAt: new Date().toISOString(),
        };
        writeState(claimed);
        return claimed;
      }
      if (
        state === null ||
        state.stage !== 'v11-complete' ||
        state.v11AttemptId !== lifecycle.attemptId
      ) {
        throw new HarnessError(
          'HOST_PRESSURE_OVERRIDE_INVALID',
          'Pressure-B V5 requires the exact successful V11 cleanup transition for this attempt',
          75,
        );
      }
      const claimed = {
        ...state,
        stage: 'v5-claimed',
        attemptId: lifecycle.attemptId,
        updatedAt: new Date().toISOString(),
      };
      writeState(claimed);
      return claimed;
    })
    : null;
  const completePressureBLifecycle = pressureB
    ? ({ successful, cleanupVerified }) => withPressureBLock((state, writeState) => {
      const expectedStage = task === 11 ? 'v11-claimed' : 'v5-claimed';
      if (
        state === null ||
        state.stage !== expectedStage ||
        state.attemptId !== lifecycle.attemptId ||
        state.v11AttemptId !== lifecycle.attemptId
      ) {
        throw new HarnessError(
          'HOST_PRESSURE_OVERRIDE_INVALID',
          'Pressure-B lifecycle completion does not match the claimed attempt',
          75,
        );
      }
      const completed = {
        ...state,
        stage: successful && cleanupVerified
          ? task === 11 ? 'v11-complete' : 'v5-complete'
          : task === 11 ? 'v11-failed' : 'v5-failed',
        updatedAt: new Date().toISOString(),
      };
      writeState(completed);
      return completed;
    })
    : null;
  return {
    applied: failures.length > 0,
    receiptPath: descriptor.path,
    receiptSHA256: descriptor.sha256,
    observedFailures: failures,
    pressureBTransition,
    completePressureBLifecycle,
  };
}

function validatePressureReceiptOnly(options, payload) {
  const allowedOptions = ['pressure-receipt-only', 'pressure-receipt-sha'];
  if (
    payload.length !== 0 ||
    options.sequence !== undefined ||
    JSON.stringify(Object.keys(options).sort()) !== JSON.stringify(allowedOptions)
  ) {
    throw new HarnessError(
      'HOST_PRESSURE_OVERRIDE_INVALID',
      'Descriptor-only pressure receipt validation accepts only the exact path/SHA pair',
      75,
    );
  }
  const receiptPath = options['pressure-receipt-only'];
  const suppliedSHA = options['pressure-receipt-sha'];
  if (
    suppliedSHA !== TASK_FIVE_ELEVEN_PRESSURE_B_OVERRIDE_SHA256 &&
    suppliedSHA !== TASK_NINE_HOST_PRESSURE_OVERRIDE_R6_SHA256 &&
    suppliedSHA !== TASK_NINE_HOST_PRESSURE_OVERRIDE_R7_SHA256
  ) {
    throw new HarnessError(
      'HOST_PRESSURE_OVERRIDE_INVALID',
      'Descriptor-only pressure receipt SHA does not match the immutable authority',
      75,
    );
  }
  if (suppliedSHA === TASK_FIVE_ELEVEN_PRESSURE_B_OVERRIDE_SHA256) {
    const descriptor = secureImmutableDescriptor(
      receiptPath,
      suppliedSHA,
      'HOST_PRESSURE_OVERRIDE_INVALID',
      75,
      false,
      TASK_FIVE_ELEVEN_PRESSURE_B_OVERRIDE_SIZE,
    );
    process.stdout.write(
      `TASK5_PRESSURE_RECEIPT_CANONICAL_PASS exact_bytes=${descriptor.size} exact_sha=${descriptor.sha256} accepted=true\n`,
    );
    return;
  }
  const expectedTaskNinePath =
    suppliedSHA === TASK_NINE_HOST_PRESSURE_OVERRIDE_R7_SHA256
      ? TASK_NINE_HOST_PRESSURE_OVERRIDE_R7_PATH
      : TASK_NINE_HOST_PRESSURE_OVERRIDE_R6_PATH;
  if (
    resolve(receiptPath) !== resolve(expectedTaskNinePath) ||
    resolve(process.env.V1_HOST_PRESSURE_OVERRIDE_RECEIPT ?? '') !== resolve(receiptPath)
  ) {
    throw new HarnessError(
      'HOST_PRESSURE_OVERRIDE_INVALID',
      'Task 9 descriptor-only validation requires the exact R6 or R7 receipt path in both option and environment',
      75,
    );
  }
  if (suppliedSHA === TASK_NINE_HOST_PRESSURE_OVERRIDE_R7_SHA256) {
    const repoRoot = process.cwd();
    const plan = verifyPlanBinding({}, repoRoot, 9);
    const override = verifyOverride(repoRoot, plan, 9, []);
    process.stdout.write(
      `TASK9_PRESSURE_RECEIPT_R7_PASS exact_sha=${override.receiptSHA256} normalized_plan_sha=${plan.normalizedSHA} owned_paths=21 accepted=true\n`,
    );
    return;
  }
  const repoRoot = process.cwd();
  const plan = verifyPlanBinding({}, repoRoot, 9);
  const override = verifyOverride(repoRoot, plan, 9, []);
  process.stdout.write(
    `TASK9_PRESSURE_RECEIPT_R6_PASS exact_sha=${override.receiptSHA256} normalized_plan_sha=${plan.normalizedSHA} owned_paths=20 accepted=true\n`,
  );
}

function commandOutput(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  return {
    status: result.status,
    stdout: (result.stdout ?? '').trim(),
    stderr: (result.stderr ?? '').trim(),
  };
}

function portOwners(port) {
  const result = commandOutput('lsof', [
    '-nP',
    `-iTCP:${port}`,
    '-sTCP:LISTEN',
    '-Fpc',
  ]);
  if (result.status !== 0 && result.status !== 1) {
    throw new HarnessError(
      'PORT_INSPECTION_UNAVAILABLE',
      `Could not inspect TCP port ${port}`,
      73,
    );
  }
  const owners = [];
  let current = null;
  for (const line of result.stdout.split('\n').filter(Boolean)) {
    if (line.startsWith('p')) {
      if (current) owners.push(current);
      current = { pid: Number(line.slice(1)), ppid: null, command: null };
    } else if (current && line.startsWith('c')) {
      current.command = line.slice(1);
    }
  }
  if (current) owners.push(current);
  return owners.map((owner) => {
    const processIdentity = commandOutput('ps', [
      '-p',
      String(owner.pid),
      '-o',
      'ppid=',
      '-o',
      'command=',
    ]);
    const match = processIdentity.stdout.trim().match(/^(\d+)\s+([\s\S]+)$/);
    return match
      ? { ...owner, ppid: Number(match[1]), command: match[2] }
      : owner;
  });
}

function hostPreflight() {
  const processListing = commandOutput('ps', ['-axo', 'pid=,ppid=,command=']);
  const processList = processListing.stdout.split('\n').filter(Boolean);
  const nodeMcpCount = processList.filter((line) => /node|mcp/i.test(line)).length;
  const browserCount = processList.filter((line) =>
    /Chrom(e|ium)|Playwright|WebKit/i.test(line)).length;
  const swap = commandOutput('sysctl', ['vm.swapusage']);
  const swapMatch = swap.stdout.match(/total = ([0-9.]+)([MG]).*used = ([0-9.]+)([MG])/);
  const swapUsedGB = swapMatch
    ? Number(swapMatch[3]) * (swapMatch[4] === 'M' ? 1 / 1024 : 1)
    : null;
  const memory = commandOutput('memory_pressure', ['-Q']);
  const memoryMatch = memory.stdout.match(/System-wide memory free percentage: (\d+)%/);
  const memoryFreePercent = memoryMatch ? Number(memoryMatch[1]) : null;
  const docker = commandOutput('docker', ['info', '--format', '{{.ServerVersion}}']);
  const logicalCores = cpus().length;
  const limits = {
    maximumLoadAverage: logicalCores * 2,
    maximumSwapUsedGB: 16,
    maximumSwapIncreaseGB: 2,
    maximumNodeMcpCount: 900,
    maximumNodeMcpIncrease: 50,
    maximumBrowserCount: 200,
    maximumBrowserIncrease: 20,
  };
  const preflight = {
    logicalCores,
    loadAverage: loadavg(),
    swapUsedGB,
    memoryFreePercent,
    nodeMcpCount,
    browserCount,
    docker:
      docker.status === 0
        ? { state: 'available', version: docker.stdout }
        : { state: 'unavailable', detail: docker.stderr },
    targetPorts: Object.fromEntries(TARGET_PORTS.map((port) => [port, portOwners(port)])),
    limits,
  };
  const failures = [];
  if (processListing.status !== 0) failures.push('PROCESS_INSPECTION_UNAVAILABLE');
  if (preflight.loadAverage[0] > limits.maximumLoadAverage) failures.push('LOAD_PER_CORE_PRESSURE');
  if (swap.status !== 0 || swapUsedGB === null) failures.push('SWAP_METRICS_UNAVAILABLE');
  else if (swapUsedGB > limits.maximumSwapUsedGB) failures.push('SWAP_USED_PRESSURE');
  if (memory.status !== 0 || memoryFreePercent === null) {
    failures.push('MEMORY_METRICS_UNAVAILABLE');
  }
  if (docker.status !== 0) failures.push('DOCKER_UNHEALTHY');
  if (nodeMcpCount > limits.maximumNodeMcpCount) failures.push('NODE_MCP_PROCESS_PROLIFERATION');
  if (browserCount > limits.maximumBrowserCount) failures.push('BROWSER_PROCESS_PROLIFERATION');
  return { failures, preflight };
}

function assertPortsFree(preflight) {
  const occupied = TARGET_PORTS.flatMap((port) =>
    preflight.targetPorts[port].map((owner) => ({ port, ...owner })));
  if (occupied.length > 0) {
    throw new HarnessError(
      'FOREIGN_PORT_OWNER',
      `Ports 3013/8121 must be free before lifecycle start: ${JSON.stringify(occupied)}`,
      73,
    );
  }
}

function parsePorcelainPaths(repoRoot) {
  const output = git(
    ['status', '--porcelain=v2', '-z', '--untracked-files=all'],
    { cwd: repoRoot, encoding: null },
  );
  const tokens = output.toString('utf8').split('\0').filter(Boolean);
  const paths = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const record = tokens[index];
    if (record.startsWith('1 ')) {
      paths.push(record.split(' ').slice(8).join(' '));
    } else if (record.startsWith('2 ')) {
      paths.push(record.split(' ').slice(9).join(' '));
      index += 1;
    } else if (record.startsWith('u ')) {
      paths.push(record.split(' ').slice(10).join(' '));
    } else if (record.startsWith('? ') || record.startsWith('! ')) {
      paths.push(record.slice(2));
    } else {
      throw new HarnessError(
        'DIRTY_FINGERPRINT_INVALID',
        `Unsupported porcelain-v2 record: ${record}`,
        68,
      );
    }
  }
  return paths;
}

function pathWithin(candidate, ownerPath) {
  return candidate === ownerPath || candidate.startsWith(`${ownerPath}/`);
}

export function ownershipRow(ledger, task) {
  const row = ledger.ownership.find((entry) => entry.todo === task);
  if (!row) {
    throw new HarnessError('OWNERSHIP_MANIFEST_MISSING', `No ownership row for Task ${task}`, 68);
  }
  return row;
}

function validateDirtyScope(repoRoot, ledger, task) {
  if (task === null || task === 27) return;
  const active = ownershipRow(ledger, task).outputs;
  const frozenUnrelated = new Set(ledger.unrelatedDirty.paths.map(({ path }) => path));
  const otherOutputs = ledger.ownership
    .filter(({ todo }) => todo !== task)
    .flatMap(({ outputs }) => outputs);
  const forbidden = (dirtyPath) =>
    dirtyPath === '.env' ||
    dirtyPath.startsWith('.env.') ||
    dirtyPath.startsWith('apps/api/') ||
    dirtyPath.startsWith('apps/web/') ||
    dirtyPath ===
      'docs/reference/handoff-sm-new-direction/sports-platform/project/Teameet Design.html';
  const violations = parsePorcelainPaths(repoRoot).filter((dirtyPath) => {
    if (dirtyPath === SCRIPT_PATH) return false;
    if (frozenUnrelated.has(dirtyPath)) return false;
    if (active.some((ownerPath) => pathWithin(dirtyPath, ownerPath))) return false;
    return (
      forbidden(dirtyPath) ||
      otherOutputs.some((ownerPath) => pathWithin(dirtyPath, ownerPath))
    );
  });
  if (violations.length > 0) {
    throw new HarnessError(
      'OTHER_OWNER_OUTPUT_DIRTY',
      `Dirty paths belong to another todo: ${violations.join(', ')}`,
      68,
    );
  }
}

export function verifyTaskOneDirty(repoRoot, ledger) {
  const taskOnePaths = ownershipRow(ledger, 1).outputs;
  const expected = ledger.unrelatedDirty.paths;
  const expectedPaths = new Set(expected.map(({ path }) => path));
  const observedPaths = parsePorcelainPaths(repoRoot)
    .filter((dirtyPath) => !taskOnePaths.some((ownerPath) => pathWithin(dirtyPath, ownerPath)));
  const unexpected = observedPaths.filter((dirtyPath) => !expectedPaths.has(dirtyPath));
  const missing = [...expectedPaths].filter((expectedPath) => !observedPaths.includes(expectedPath));
  if (unexpected.length > 0 || missing.length > 0) {
    throw new HarnessError(
      'UNRELATED_DIRTY_FINGERPRINT_DRIFT',
      `Unrelated dirty path set drifted; unexpected=${unexpected.join(',')} missing=${missing.join(',')}`,
      68,
    );
  }
  for (const expectedPath of expected) {
    const absolutePath = resolve(repoRoot, expectedPath.path);
    const worktree = expectedPath.worktree;
    if (worktree.state === 'absent') {
      if (existsSync(absolutePath)) {
        throw new HarnessError(
          'UNRELATED_DIRTY_FINGERPRINT_DRIFT',
          `Expected absent unrelated path: ${expectedPath.path}`,
          68,
        );
      }
    } else {
      const stat = lstatSync(absolutePath);
      const type =
        stat.isFile() ? 'regular' :
        stat.isDirectory() ? 'directory' :
        stat.isSymbolicLink() ? 'symlink' : 'other';
      const digest =
        type === 'regular'
          ? sha256(readFileSync(absolutePath))
          : type === 'symlink'
            ? sha256(Buffer.from(readlinkSync(absolutePath)))
            : null;
      if (
        type !== worktree.type ||
        (stat.mode & 0o7777).toString(8).padStart(4, '0') !== worktree.mode ||
        stat.size !== worktree.size ||
        digest !== worktree.sha256
      ) {
        throw new HarnessError(
          'UNRELATED_DIRTY_FINGERPRINT_DRIFT',
          `Unrelated worktree identity drifted: ${expectedPath.path}`,
          68,
        );
      }
    }
    const indexOutput = git(['ls-files', '-s', '--', expectedPath.path], { cwd: repoRoot }).trim();
    const expectedIndex = expectedPath.index;
    if (expectedIndex.state === 'absent') {
      if (indexOutput !== '') {
        throw new HarnessError(
          'UNRELATED_DIRTY_FINGERPRINT_DRIFT',
          `Expected absent unrelated index path: ${expectedPath.path}`,
          68,
        );
      }
    } else {
      const observedEntries = indexOutput.split('\n').map((line) => {
        const match = line.match(/^(\d+) ([0-9a-f]+) (\d+)\t([\s\S]+)$/);
        if (!match) {
          throw new HarnessError(
            'UNRELATED_DIRTY_FINGERPRINT_DRIFT',
            `Cannot parse unrelated index entry: ${expectedPath.path}`,
            68,
          );
        }
        return { mode: match[1], blob: match[2], stage: Number(match[3]), path: match[4] };
      });
      if (JSON.stringify(observedEntries) !== JSON.stringify(expectedIndex.entries)) {
        throw new HarnessError(
          'UNRELATED_DIRTY_FINGERPRINT_DRIFT',
          `Unrelated index identity drifted: ${expectedPath.path}`,
          68,
        );
      }
    }
  }
}

function privateIndexTree(repoRoot, ownedPaths) {
  const temporaryDirectory = mkdtempSync(join(tmpdir(), 'teameet-v1-index-'));
  const indexPath = join(temporaryDirectory, 'index');
  const env = { ...process.env, GIT_INDEX_FILE: indexPath };
  try {
    git(['read-tree', 'HEAD'], { cwd: repoRoot, env });
    const usablePaths = ownedPaths.filter((ownedPath) => {
      if (existsSync(resolve(repoRoot, ownedPath))) return true;
      const tracked = git(['ls-tree', '-r', '--name-only', 'HEAD', '--', ownedPath], {
        cwd: repoRoot,
      }).trim();
      return tracked.length > 0;
    });
    if (usablePaths.length > 0) {
      git(['add', '-A', '--', ...usablePaths], { cwd: repoRoot, env });
    }
    const sourceTreeSHA = git(['write-tree'], { cwd: repoRoot, env }).trim();
    return { sourceTreeSHA, temporaryIndexPath: indexPath, cleanup: () => rmSync(temporaryDirectory, { recursive: true }) };
  } catch (error) {
    rmSync(temporaryDirectory, { recursive: true, force: true });
    throw error;
  }
}

export function immutableWrite(filePath, value) {
  mkdirSync(dirname(filePath), { recursive: true });
  const bytes = Buffer.isBuffer(value) ? value : canonicalBytes(value);
  let descriptor;
  try {
    descriptor = openSync(
      filePath,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
      0o400,
    );
    let offset = 0;
    while (offset < bytes.length) {
      offset += writeSync(descriptor, bytes, offset, bytes.length - offset);
    }
    fsyncSync(descriptor);
  } catch (error) {
    if (error.code === 'EEXIST') {
      throw new HarnessError(
        'IMMUTABLE_RECEIPT_COLLISION',
        `Refusing to overwrite immutable evidence: ${filePath}`,
        76,
      );
    }
    throw error;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
  chmodSync(filePath, 0o444);
  return { path: filePath, sha256: sha256(bytes) };
}

export function immutableWriteOrReuse(filePath, value) {
  const bytes = Buffer.isBuffer(value) ? value : canonicalBytes(value);
  if (!existsSync(filePath)) return immutableWrite(filePath, bytes);
  const stat = lstatSync(filePath);
  const expectedUid = typeof process.getuid === 'function' ? process.getuid() : stat.uid;
  if (
    stat.isSymbolicLink() ||
    !stat.isFile() ||
    (stat.mode & 0o777) !== 0o444 ||
    stat.uid !== expectedUid
  ) {
    throw new HarnessError(
      'IMMUTABLE_RECEIPT_COLLISION',
      `Existing immutable source artifact has invalid identity: ${filePath}`,
      76,
    );
  }
  const descriptor = descriptorRead(filePath);
  const expectedSHA = sha256(bytes);
  if (descriptor.sha256 !== expectedSHA) {
    throw new HarnessError(
      'IMMUTABLE_RECEIPT_COLLISION',
      `Existing immutable source artifact has different bytes: ${filePath}`,
      76,
    );
  }
  return { path: filePath, sha256: descriptor.sha256 };
}

function treePathIdentity(repoRoot, treeish, ownedPath) {
  const output = git(
    ['ls-tree', '-z', treeish, '--', ownedPath],
    { cwd: repoRoot, encoding: null },
  );
  const records = output.toString('utf8').split('\0').filter(Boolean);
  if (records.length === 0) return { state: 'deleted' };
  if (records.length !== 1) {
    throw new HarnessError(
      'SOURCE_MANIFEST_INVALID',
      `Expected exactly one tree entry for ${ownedPath}; observed ${records.length}`,
      68,
    );
  }
  const match = records[0].match(/^(\d+) (blob|tree|commit) ([0-9a-f]+)\t([\s\S]+)$/);
  if (!match || match[4] !== ownedPath) {
    throw new HarnessError(
      'SOURCE_MANIFEST_INVALID',
      `Tree entry does not exactly match owned path ${ownedPath}`,
      68,
    );
  }
  const bytes = git(['cat-file', match[2], match[3]], { cwd: repoRoot, encoding: null });
  return {
    state: 'present',
    mode: match[1],
    type: match[2],
    blob: match[3],
    sha256: sha256(bytes),
    size: bytes.length,
  };
}

function sourceEntries(repoRoot, sourceTreeSHA, ownedPaths, baselineSHA, headSHA) {
  const uniquePaths = new Set(ownedPaths);
  if (uniquePaths.size !== ownedPaths.length) {
    throw new HarnessError(
      'SOURCE_MANIFEST_INVALID',
      'Ownership outputs must not contain duplicate paths',
      68,
    );
  }
  return ownedPaths.map((ownedPath) => {
    const candidate = treePathIdentity(repoRoot, sourceTreeSHA, ownedPath);
    return {
      path: ownedPath,
      state: candidate.state,
      baseline: treePathIdentity(repoRoot, baselineSHA, ownedPath),
      head: treePathIdentity(repoRoot, headSHA, ownedPath),
      candidate,
    };
  });
}

function createSourceSnapshot(
  repoRoot,
  ledger,
  task,
  attemptId,
  evidenceRoot,
  candidateSHA = null,
) {
  const ownedPaths = task === null ? [] : ownershipRow(ledger, task).outputs;
  const privateIndex = privateIndexTree(repoRoot, ownedPaths);
  try {
    const headSHA = git(['rev-parse', 'HEAD'], { cwd: repoRoot }).trim();
    const attemptDir = resolve(
      evidenceRoot,
      candidateSHA ? 'commit-sha256' : 'tree-sha256',
      candidateSHA ?? privateIndex.sourceTreeSHA,
      `attempt-${attemptId}`,
    );
    mkdirSync(attemptDir, { recursive: true });
    const entries = sourceEntries(
      repoRoot,
      privateIndex.sourceTreeSHA,
      ownedPaths,
      ledger.baselineSHA,
      headSHA,
    );
    const manifest = {
      schemaVersion: 2,
      attemptId,
      task,
      baselineSHA: ledger.baselineSHA,
      headSHA,
      sourceTreeSHA: privateIndex.sourceTreeSHA,
      ownedPaths,
      entries,
      createdAt: candidateSHA
        ? git(['show', '-s', '--format=%cI', candidateSHA], { cwd: repoRoot }).trim()
        : new Date().toISOString(),
    };
    const manifestReceipt = immutableWriteOrReuse(
      join(attemptDir, 'source-manifest.json'),
      manifest,
    );
    const archive = git(['archive', '--format=tar', candidateSHA ?? privateIndex.sourceTreeSHA], {
      cwd: repoRoot,
      encoding: null,
    });
    const archiveReceipt = immutableWriteOrReuse(join(attemptDir, 'source-tree.tar'), archive);
    return {
      attemptDir,
      sourceTreeSHA: privateIndex.sourceTreeSHA,
      sourceManifestPath: manifestReceipt.path,
      sourceManifestSHA: manifestReceipt.sha256,
      sourceArchivePath: archiveReceipt.path,
      sourceArchiveSHA: archiveReceipt.sha256,
      temporaryIndexPath: privateIndex.temporaryIndexPath,
      ownedPaths,
      baselineSHA: ledger.baselineSHA,
      headSHA,
      entries,
    };
  } finally {
    privateIndex.cleanup();
  }
}

export function createCandidateSourceSnapshot(
  repoRoot,
  candidate,
  attemptId,
  evidenceRoot,
) {
  const sourceManifest = candidate.sourceManifest.receipt;
  const attemptDir = resolve(
    evidenceRoot,
    'commit-sha256',
    candidate.receipt.candidateSHA,
    `attempt-${attemptId}`,
  );
  mkdirSync(attemptDir, { recursive: true });
  const archive = git(
    ['archive', '--format=tar', sourceManifest.sourceTreeSHA],
    { cwd: repoRoot, encoding: null },
  );
  const archiveReceipt = immutableWrite(join(attemptDir, 'source-tree.tar'), archive);
  return {
    attemptDir,
    sourceTreeSHA: sourceManifest.sourceTreeSHA,
    sourceManifestPath: candidate.sourceManifest.path,
    sourceManifestSHA: candidate.sourceManifest.sha256,
    sourceArchivePath: archiveReceipt.path,
    sourceArchiveSHA: archiveReceipt.sha256,
    temporaryIndexPath: null,
    ownedPaths: sourceManifest.ownedPaths,
    baselineSHA: sourceManifest.baselineSHA,
    headSHA: sourceManifest.headSHA,
    entries: sourceManifest.entries,
  };
}

export function verifyCommittedSnapshot(repoRoot, snapshot) {
  if (
    !Array.isArray(snapshot.ownedPaths) ||
    !Array.isArray(snapshot.entries) ||
    !/^[0-9a-f]{40}$/.test(snapshot.baselineSHA ?? '') ||
    !/^[0-9a-f]{40}$/.test(snapshot.headSHA ?? '')
  ) {
    throw new HarnessError('SOURCE_MANIFEST_INVALID', 'Owned paths and entries must be arrays', 68);
  }
  const expectedPaths = snapshot.ownedPaths;
  const actualPaths = snapshot.entries.map((entry) => entry?.path);
  if (
    new Set(expectedPaths).size !== expectedPaths.length ||
    new Set(actualPaths).size !== actualPaths.length ||
    expectedPaths.length !== actualPaths.length ||
    expectedPaths.some((ownedPath, index) => actualPaths[index] !== ownedPath)
  ) {
    throw new HarnessError(
      'SOURCE_MANIFEST_INVALID',
      'Source manifest entries must exactly and uniquely match ordered ownership outputs',
      68,
    );
  }
  for (const entry of snapshot.entries) {
    const baseline = treePathIdentity(repoRoot, snapshot.baselineSHA, entry.path);
    const head = treePathIdentity(repoRoot, snapshot.headSHA, entry.path);
    const sameIdentity = (left, right) =>
      left?.state === right?.state &&
      (left.state === 'deleted' ||
        (
          left.mode === right.mode &&
          left.type === right.type &&
          left.blob === right.blob
        ));
    if (
      !['present', 'deleted'].includes(entry.state) ||
      entry.state !== entry.candidate?.state ||
      !sameIdentity(entry.baseline, baseline) ||
      !sameIdentity(entry.head, head)
    ) {
      throw new HarnessError(
        'SOURCE_MANIFEST_INVALID',
        `Invalid baseline, HEAD, or candidate identity for ${entry.path}`,
        68,
      );
    }
    const committed = treePathIdentity(repoRoot, 'HEAD', entry.path);
    if (entry.state === 'deleted') {
      if (committed.state !== 'deleted') {
        throw new HarnessError(
          'SOURCE_SNAPSHOT_COMMIT_DRIFT',
          `Committed path is present but manifest declares deletion: ${entry.path}`,
          68,
        );
      }
      continue;
    }
    if (
      committed.state !== 'present' ||
      committed.mode !== entry.candidate.mode ||
      committed.type !== entry.candidate.type ||
      committed.blob !== entry.candidate.blob
    ) {
      throw new HarnessError(
        'SOURCE_SNAPSHOT_COMMIT_DRIFT',
        `Committed blob/mode drift for ${entry.path}`,
        68,
      );
    }
  }
}

export function exactKeys(value, expected) {
  return (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expected].sort())
  );
}

export function verifyOwnedPathsClean(repoRoot, ownedPaths) {
  const status = git(
    ['status', '--porcelain=v2', '-z', '--untracked-files=all', '--', ...ownedPaths],
    { cwd: repoRoot, encoding: null },
  );
  if (status.length !== 0) {
    throw new HarnessError(
      'CANDIDATE_BINDING_MISMATCH',
      'Candidate owned paths must be clean in the index and worktree',
      68,
    );
  }
}

function verifyCandidatePair(repoRoot, pair, expected, label) {
  if (
    !exactKeys(pair, ['path', 'sha256']) ||
    resolve(repoRoot, pair.path) !== resolve(repoRoot, expected.path) ||
    pair.sha256 !== expected.sha256
  ) {
    throw new HarnessError(
      'CANDIDATE_BINDING_MISMATCH',
      `Candidate ${label} identity does not match the clean-restart authority`,
      68,
    );
  }
  return secureImmutableDescriptor(
    resolve(repoRoot, pair.path),
    pair.sha256,
    'CANDIDATE_BINDING_MISMATCH',
  );
}

function verifyCandidate(options, ledger, liveHead, planSHA, repoRoot) {
  const receiptPath = options['candidate-receipt'] ?? process.env.V1_CANDIDATE_RECEIPT_PATH;
  const receiptSHA = options['candidate-receipt-sha'] ?? process.env.V1_CANDIDATE_RECEIPT_SHA;
  if (!receiptPath || !receiptSHA) {
    throw new HarnessError(
      'CANDIDATE_BINDING_MISMATCH',
      'Candidate mode requires an immutable candidate receipt path and SHA',
      68,
    );
  }
  const descriptor = secureImmutableDescriptor(
    receiptPath,
    receiptSHA,
    'CANDIDATE_BINDING_MISMATCH',
  );
  const receipt = descriptor.receipt;
  const requiredKeys = [
    'schemaVersion',
    'phase',
    'baselineSHA',
    'restartHeadSHA',
    'candidateSHA',
    'sourceTreeSHA',
    'sourceManifestPath',
    'sourceManifestSHA',
    'planSHA',
    'approvalReceipt',
    'task127CursorReceipt',
    'overrideReceipt',
    'consumptionReceipt',
    'ownedPathBlobs',
    'createdAt',
  ];
  if (
    !exactKeys(receipt, requiredKeys) ||
    receipt.schemaVersion !== 1 ||
    receipt.phase !== 'candidate' ||
    receipt.baselineSHA !== ledger.baselineSHA ||
    receipt.restartHeadSHA !== TASK_ONE_RESTART_HEAD_SHA ||
    receipt.candidateSHA !== liveHead ||
    receipt.planSHA !== planSHA ||
    !/^[0-9a-f]{40}$/.test(receipt.candidateSHA ?? '') ||
    !/^[0-9a-f]{40}$/.test(receipt.sourceTreeSHA ?? '') ||
    !/^[0-9a-f]{64}$/.test(receipt.sourceManifestSHA ?? '') ||
    Number.isNaN(Date.parse(receipt.createdAt ?? ''))
  ) {
    throw new HarnessError(
      'CANDIDATE_BINDING_MISMATCH',
      'Candidate receipt schema does not bind phase, baseline, restart HEAD, live HEAD, source, and plan',
      68,
    );
  }
  const approval = verifyCandidatePair(
    repoRoot,
    receipt.approvalReceipt,
    TASK_ONE_RECEIPTS.approval,
    'approval receipt',
  );
  const cursor = verifyCandidatePair(
    repoRoot,
    receipt.task127CursorReceipt,
    TASK_ONE_RECEIPTS.cursor,
    'Task127 cursor receipt',
  );
  const override = verifyCandidatePair(
    repoRoot,
    receipt.overrideReceipt,
    TASK_ONE_RECEIPTS.override,
    'override receipt',
  );
  const consumption = verifyCandidatePair(
    repoRoot,
    receipt.consumptionReceipt,
    TASK_ONE_RECEIPTS.consumption,
    'consumption receipt',
  );
  const rollback = secureImmutableDescriptor(
    resolve(repoRoot, TASK_ONE_RECEIPTS.rollback.path),
    TASK_ONE_RECEIPTS.rollback.sha256,
    'CANDIDATE_BINDING_MISMATCH',
  );
  const hostPath = options['require-host-supervisor-receipt'];
  const hostSHA = options['require-host-supervisor-receipt-sha'];
  if (!hostPath || !hostSHA) {
    throw new HarnessError(
      'HOST_SUPERVISOR_RECEIPT_INVALID',
      'Task-1 candidate requires the trusted host-supervisor receipt path and SHA',
      78,
    );
  }
  const host = secureImmutableDescriptor(
    hostPath,
    hostSHA,
    'HOST_SUPERVISOR_RECEIPT_INVALID',
    78,
  );
  if (
    approval.receipt.verdict !== 'APPROVED' ||
    approval.receipt.planSha256 !== planSHA ||
    cursor.receipt.receiptType !== 'task-1-task127-clean-restart-cursor' ||
    cursor.receipt.mode !== 'clean-restart-initial' ||
    cursor.receipt.planSHA256 !== planSHA ||
    cursor.receipt.baselineSHA !== TASK_ONE_BASELINE_SHA ||
    cursor.receipt.restartHeadSHA !== TASK_ONE_RESTART_HEAD_SHA ||
    cursor.receipt.approvalReceipt?.sha256 !== approval.sha256 ||
    override.receipt.taskId !== 1 ||
    override.receipt.workloadId !== TASK_ONE_WORKLOAD ||
    override.receipt.planSHA256 !== planSHA ||
    override.receipt.approvalReceipt?.sha256 !== approval.sha256 ||
    override.receipt.cursorReceipt?.sha256 !== cursor.sha256 ||
    consumption.receipt.receiptType !== 'task-1-v0-execution-consumption' ||
    consumption.receipt.verdict !== 'CONSUMED' ||
    consumption.receipt.plan?.sha256 !== planSHA ||
    consumption.receipt.baselineSHA !== TASK_ONE_BASELINE_SHA ||
    consumption.receipt.restartHeadSHA !== TASK_ONE_RESTART_HEAD_SHA ||
    consumption.receipt.approvalReceipt?.sha256 !== approval.sha256 ||
    consumption.receipt.cursorReceipt?.sha256 !== cursor.sha256 ||
    consumption.receipt.overrideReceipt?.sha256 !== override.sha256 ||
    host.receipt.schemaVersion !== 1 ||
    host.receipt.receiptType !== 'task-1-host-supervisor-gate' ||
    host.receipt.taskId !== 1 ||
    host.receipt.workloadId !== TASK_ONE_WORKLOAD ||
    host.receipt.planSHA !== planSHA ||
    host.receipt.verdict !== 'APPROVE' ||
    host.receipt.approvalReceipt?.sha256 !== approval.sha256 ||
    host.receipt.task127CursorReceipt?.sha256 !== cursor.sha256 ||
    host.receipt.overrideReceipt?.sha256 !== override.sha256 ||
    host.receipt.consumptionReceipt?.sha256 !== consumption.sha256 ||
    Object.values(host.receipt.cleanup ?? {}).some((value) => value !== 0)
  ) {
    throw new HarnessError(
      'CANDIDATE_BINDING_MISMATCH',
      'Candidate prerequisite receipts do not bind the clean-restart authority',
      68,
    );
  }
  const sourceManifest = secureImmutableDescriptor(
    receipt.sourceManifestPath,
    receipt.sourceManifestSHA,
    'CANDIDATE_BINDING_MISMATCH',
    68,
    true,
  );
  const ownedPaths = ownershipRow(ledger, 1).outputs;
  if (
    sourceManifest.receipt.schemaVersion !== 2 ||
    sourceManifest.receipt.task !== 1 ||
    sourceManifest.receipt.baselineSHA !== TASK_ONE_BASELINE_SHA ||
    sourceManifest.receipt.headSHA !== TASK_ONE_RESTART_HEAD_SHA ||
    sourceManifest.receipt.sourceTreeSHA !== receipt.sourceTreeSHA ||
    JSON.stringify(sourceManifest.receipt.ownedPaths) !== JSON.stringify(ownedPaths)
  ) {
    throw new HarnessError(
      'CANDIDATE_BINDING_MISMATCH',
      'Candidate source manifest does not bind the Task-1 clean-restart source tree',
      68,
    );
  }
  const expectedBlobs = sourceManifest.receipt.entries.map((entry) => ({
    path: entry.path,
    mode: entry.candidate?.mode,
    blobSHA: entry.candidate?.blob,
  }));
  if (
    !Array.isArray(receipt.ownedPathBlobs) ||
    receipt.ownedPathBlobs.some(
      (entry) => !exactKeys(entry, ['path', 'mode', 'blobSHA']),
    ) ||
    JSON.stringify(stable(receipt.ownedPathBlobs)) !== JSON.stringify(stable(expectedBlobs))
  ) {
    throw new HarnessError(
      'CANDIDATE_BINDING_MISMATCH',
      'Candidate owned blobs do not exactly match the clean-restart source manifest',
      68,
    );
  }
  verifyCommittedSnapshot(repoRoot, sourceManifest.receipt);
  verifyOwnedPathsClean(repoRoot, ownedPaths);
  verifyTaskOneDirty(repoRoot, ledger);
  return {
    ...descriptor,
    sourceManifest,
    chain: { approval, cursor, override, consumption, rollback, host },
  };
}

function verifyParentLifecycle(options, candidate, task) {
  const path = options['parent-lifecycle-receipt'];
  const digest = options['parent-lifecycle-receipt-sha'];
  const parentAttempt = options['parent-attempt'];
  if (!path || !digest || !parentAttempt) {
    throw new HarnessError(
      'REGISTRY_CHILD_IDENTITY_VIOLATION',
      'Registry child requires parent attempt and lifecycle receipt path/SHA',
      77,
    );
  }
  const parent = secureImmutableDescriptor(
    path,
    digest,
    'REGISTRY_CHILD_IDENTITY_VIOLATION',
    77,
  );
  if (
    parent.receipt.attemptId !== parentAttempt ||
    parentAttempt !== candidate.receipt.attemptId ||
    parent.receipt.lifecycleOwner !== 'outer' ||
    parent.receipt.candidateSHA !== candidate.receipt.candidateSHA ||
    parent.receipt.planSHA !== candidate.receipt.planSHA ||
    parent.receipt.task !== 27
  ) {
    throw new HarnessError(
      'REGISTRY_CHILD_IDENTITY_VIOLATION',
      'Registry child identities do not match parent and candidate receipts',
      77,
    );
  }
  const sourceManifest = secureImmutableDescriptor(
    parent.receipt.sourceManifestPath,
    parent.receipt.sourceManifestSHA,
    'REGISTRY_CHILD_IDENTITY_VIOLATION',
    77,
  );
  if (
    sourceManifest.receipt.attemptId !== parentAttempt ||
    sourceManifest.receipt.sourceTreeSHA !== parent.receipt.sourceTreeSHA
  ) {
    throw new HarnessError(
      'REGISTRY_CHILD_IDENTITY_VIOLATION',
      'Parent source-manifest identity does not match its lifecycle receipt',
      77,
    );
  }
  if (
    options.db !== undefined ||
    options['adopt-candidate-attempt'] ||
    options['lifecycle-owner'] !== undefined ||
    options['root-prepare'] !== undefined
  ) {
    throw new HarnessError(
      'REGISTRY_CHILD_LIFECYCLE_VIOLATION',
      'Registry child cannot own attempt, DB, services, or root preparation',
      77,
    );
  }
  if (options.browser !== undefined && !(task === 26 && options['child-browser-owner'])) {
    throw new HarnessError(
      'REGISTRY_CHILD_LIFECYCLE_VIOLATION',
      'Only V26 registry child may own declared browser descendants',
      77,
    );
  }
  return parent;
}

function parseDatabaseConfig() {
  const raw = process.env.V1_VERIFICATION_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!raw) return null;
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new HarnessError('DATABASE_BINDING_INVALID', 'Database URL is invalid', 74);
  }
  const hostname = url.hostname.toLowerCase();
  if (!['127.0.0.1', 'localhost', '::1'].includes(hostname)) {
    throw new HarnessError(
      'NON_LOOPBACK_DATABASE_REJECTED',
      `Database host must be loopback; observed ${hostname}`,
      74,
    );
  }
  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
    throw new HarnessError('DATABASE_BINDING_INVALID', 'Database must use PostgreSQL', 74);
  }
  return { hostname };
}

function createDatabase(task) {
  parseDatabaseConfig();
  const databaseName = `teameet_task_${task}_${randomUUID().replaceAll('-', '')}`;
  const containerName = databaseName;
  const databasePassword = 'teameet_verification_only';
  const started = spawnSync(
    'docker',
    [
      'run',
      '--detach',
      '--rm',
      '--name',
      containerName,
      '--publish',
      '127.0.0.1::5432',
      '--env',
      `POSTGRES_DB=${databaseName}`,
      '--env',
      'POSTGRES_USER=postgres',
      '--env',
      `POSTGRES_PASSWORD=${databasePassword}`,
      'postgres:16-alpine',
    ],
    { encoding: 'utf8', maxBuffer: 1024 * 1024 },
  );
  if (started.status !== 0) {
    throw new HarnessError(
      'DATABASE_LIFECYCLE_FAILED',
      `Could not start isolated PostgreSQL: ${(started.stderr ?? '').trim()}`,
      74,
    );
  }
  const containerId = started.stdout.trim();
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const probe = spawnSync(
      'docker',
      ['exec', containerName, 'pg_isready', '-U', 'postgres', '-d', databaseName],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
    if (probe.status === 0) {
      ready = true;
      break;
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
  }
  if (!ready) {
    spawnSync('docker', ['stop', '--time', '2', containerName], { stdio: 'ignore' });
    throw new HarnessError(
      'DATABASE_LIFECYCLE_FAILED',
      `Isolated PostgreSQL did not become ready: ${containerName}`,
      74,
    );
  }
  const portResult = commandOutput('docker', [
    'port',
    containerName,
    '5432/tcp',
  ]);
  const portMatch = portResult.stdout.match(/127\.0\.0\.1:(\d+)$/);
  if (portResult.status !== 0 || !portMatch) {
    spawnSync('docker', ['stop', '--time', '2', containerName], { stdio: 'ignore' });
    throw new HarnessError(
      'DATABASE_LIFECYCLE_FAILED',
      `Could not resolve isolated PostgreSQL port: ${containerName}`,
      74,
    );
  }
  const port = Number(portMatch[1]);
  return {
    databaseName,
    containerName,
    containerId,
    host: '127.0.0.1',
    port,
    databaseUrl:
      `postgresql://postgres:${databasePassword}@127.0.0.1:${port}/${databaseName}`,
    createdAt: new Date().toISOString(),
  };
}

function dropDatabase(database) {
  const stopped = spawnSync(
    'docker',
    ['stop', '--timeout', '5', database.containerName],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );
  let inspectStatus = 0;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const inspect = spawnSync(
      'docker',
      ['inspect', database.containerName],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
    inspectStatus = inspect.status;
    if (inspectStatus !== 0) break;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
  }
  if (inspectStatus === 0) {
    throw new HarnessError(
      'DATABASE_CLEANUP_LEAK',
      `Database cleanup was not verified for ${database.databaseName}: ${(stopped.stderr ?? '').trim()}`,
      74,
    );
  }
}

function processTable() {
  const result = commandOutput('ps', ['-axo', 'pid=,ppid=,pgid=,lstart=,command=']);
  if (result.status !== 0) {
    throw new HarnessError('PROCESS_INSPECTION_UNAVAILABLE', 'Could not inspect child processes');
  }
  return result.stdout.split('\n').filter(Boolean).map((line) => {
    const match = line.trim().match(
      /^(\d+)\s+(\d+)\s+(\d+)\s+(.{24})\s+([\s\S]*)$/,
    );
    return match
      ? {
          pid: Number(match[1]),
          ppid: Number(match[2]),
          pgid: Number(match[3]),
          startIdentity: match[4],
          command: match[5],
        }
      : null;
  }).filter(Boolean);
}

function markerPids(marker) {
  const result = commandOutput('ps', ['eww', '-axo', 'pid=,command=']);
  if (result.status !== 0) {
    throw new HarnessError(
      'PROCESS_INSPECTION_UNAVAILABLE',
      'Could not inspect process ownership markers',
    );
  }
  const token = `${PROCESS_OWNER_ENV}=${marker}`;
  return new Set(result.stdout.split('\n').flatMap((line) => {
    const match = line.match(/^\s*(\d+)\s+([\s\S]*)$/);
    return match && match[2].includes(token) ? [Number(match[1])] : [];
  }));
}

function processIdentity(processEntry) {
  return {
    pid: processEntry.pid,
    startIdentity: processEntry.startIdentity,
  };
}

function identityKey(identity) {
  return `${identity.pid}:${identity.startIdentity}`;
}

function identityMatches(identity, table = processTable()) {
  const observed = table.find(({ pid }) => pid === identity.pid);
  return observed?.startIdentity === identity.startIdentity;
}

function signalIdentity(identity, signal) {
  const table = processTable();
  if (!identityMatches(identity, table)) return false;
  try {
    process.kill(identity.pid, signal);
    return true;
  } catch (error) {
    if (error.code === 'ESRCH') return false;
    throw error;
  }
}

function sampleOwnedProcesses(rootPid, marker, baselineKeys, ownedIdentities) {
  const table = processTable();
  const byPid = new Map(table.map((entry) => [entry.pid, entry]));
  const marked = markerPids(marker);
  const trackedPids = new Set(
    [...ownedIdentities.values()]
      .filter((identity) => identityMatches(identity, table))
      .map(({ pid }) => pid),
  );
  const descendsFromOwned = (entry) => {
    const visited = new Set();
    let parentPid = entry.ppid;
    while (parentPid > 0 && !visited.has(parentPid)) {
      if (parentPid === rootPid || trackedPids.has(parentPid)) return true;
      visited.add(parentPid);
      parentPid = byPid.get(parentPid)?.ppid ?? 0;
    }
    return false;
  };
  for (const entry of table) {
    const identity = processIdentity(entry);
    const key = identityKey(identity);
    if (
      entry.pid !== process.pid &&
      !baselineKeys.has(key) &&
      (entry.pid === rootPid || marked.has(entry.pid) || descendsFromOwned(entry))
    ) {
      ownedIdentities.set(key, identity);
    }
  }
}

async function cleanupOwnedProcesses(rootPid, marker, baselineKeys, ownedIdentities, lifecycle) {
  sampleOwnedProcesses(rootPid, marker, baselineKeys, ownedIdentities);
  const owned = [...ownedIdentities.values()];
  const termIdentities = owned.filter((identity) => signalIdentity(identity, 'SIGTERM'));
  lifecycle.cleanup.termIdentities.push(...termIdentities);
  lifecycle.cleanup.termPids.push(...termIdentities.map(({ pid }) => pid));
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline) {
    sampleOwnedProcesses(rootPid, marker, baselineKeys, ownedIdentities);
    if (![...ownedIdentities.values()].some((identity) => identityMatches(identity))) break;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 50));
  }
  sampleOwnedProcesses(rootPid, marker, baselineKeys, ownedIdentities);
  const killIdentities = [...ownedIdentities.values()]
    .filter((identity) => signalIdentity(identity, 'SIGKILL'));
  lifecycle.cleanup.killIdentities.push(...killIdentities);
  lifecycle.cleanup.killPids.push(...killIdentities.map(({ pid }) => pid));
  const killDeadline = Date.now() + 1000;
  while (
    Date.now() < killDeadline &&
    [...ownedIdentities.values()].some((identity) => identityMatches(identity))
  ) {
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 25));
  }
  sampleOwnedProcesses(rootPid, marker, baselineKeys, ownedIdentities);
  const leakedIdentities = [...ownedIdentities.values()]
    .filter((identity) => identityMatches(identity));
  lifecycle.cleanup.ownedProcessIdentities.push(...ownedIdentities.values());
  lifecycle.cleanup.leakedIdentities.push(...leakedIdentities);
  lifecycle.cleanup.leakedPids.push(...leakedIdentities.map(({ pid }) => pid));
}

async function runChild(command, args, { cwd, env, lifecycle, ports = [] }) {
  const marker = randomUUID();
  const baselineKeys = new Set(processTable().map((entry) => identityKey(processIdentity(entry))));
  const ownedIdentities = new Map();
  const child = spawn(command, args, {
    cwd,
    env: { ...env, [PROCESS_OWNER_ENV]: marker },
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const childRecord = {
    pid: child.pid,
    ppid: process.pid,
    command: [command, ...args],
    ports,
    startedAt: new Date().toISOString(),
    ownershipMarkerSHA256: sha256(marker),
  };
  lifecycle.children.push(childRecord);
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => {
    stdout += chunk;
  });
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });
  let samplingError = null;
  try {
    sampleOwnedProcesses(child.pid, marker, baselineKeys, ownedIdentities);
  } catch (error) {
    samplingError = error;
  }
  const sampler = setInterval(() => {
    try {
      sampleOwnedProcesses(child.pid, marker, baselineKeys, ownedIdentities);
    } catch (error) {
      samplingError ??= error;
    }
  }, 25);
  sampler.unref();
  const status = await new Promise((resolveStatus, reject) => {
    child.once('error', reject);
    child.once('close', (code, signal) => resolveStatus({ code, signal }));
  }).finally(() => {
    clearInterval(sampler);
  });
  childRecord.exitCode = status.code;
  childRecord.signal = status.signal;
  childRecord.finishedAt = new Date().toISOString();
  await cleanupOwnedProcesses(
    child.pid,
    marker,
    baselineKeys,
    ownedIdentities,
    lifecycle,
  );
  if (samplingError) throw samplingError;
  return { ...status, stdout, stderr };
}

function framedPayload(result) {
  return {
    disposition: result.code === 0 ? 'accepted' : 'rejected',
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

function packageCwd(repoRoot, packageName) {
  if (packageName === undefined) return repoRoot;
  if (!['v1_api', 'v1_web'].includes(packageName)) {
    throw new HarnessError('MALFORMED_INPUT', `Unsupported package: ${packageName}`, 64);
  }
  return resolve(repoRoot, 'apps', packageName);
}

function prepareSnapshotExecution(snapshot, repoRoot, includeHostModules = true) {
  const temporaryDirectory = mkdtempSync(
    join(process.platform === 'darwin' ? '/private/tmp' : tmpdir(), 'teameet-v1-source-'),
  );
  const extractedRoot = join(temporaryDirectory, 'tree');
  mkdirSync(extractedRoot);
  const extracted = spawnSync(
    'tar',
    ['-xf', snapshot.sourceArchivePath, '-C', extractedRoot],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );
  if (extracted.status !== 0) {
    rmSync(temporaryDirectory, { recursive: true, force: true });
    throw new HarnessError(
      'SOURCE_ARCHIVE_INVALID',
      `Could not extract source snapshot: ${(extracted.stderr ?? '').trim()}`,
      68,
    );
  }
  if (includeHostModules) {
    for (const relativePath of ['node_modules', 'apps/v1_api/node_modules', 'apps/v1_web/node_modules']) {
      const source = resolve(repoRoot, relativePath);
      const target = resolve(extractedRoot, relativePath);
      if (existsSync(source) && !existsSync(target)) {
        mkdirSync(dirname(target), { recursive: true });
        symlinkSync(source, target, 'dir');
      }
    }
  }
  return {
    root: extractedRoot,
    cleanup: () => rmSync(temporaryDirectory, { recursive: true, force: true }),
  };
}

async function applyMigrationSnapshot(snapshotRoot, childEnv, lifecycle, repoRoot) {
  const schemaPath = resolve(snapshotRoot, 'apps/v1_api/prisma/schema.prisma');
  const prismaBinary = resolve(repoRoot, 'apps/v1_api/node_modules/.bin/prisma');
  if (!existsSync(schemaPath) || !existsSync(prismaBinary)) {
    throw new HarnessError(
      'DATABASE_MIGRATION_SNAPSHOT_MISSING',
      'Receipt-bound Prisma schema or local Prisma binary is unavailable',
      74,
    );
  }
  return runChild(prismaBinary, ['migrate', 'deploy', '--schema', schemaPath], {
    cwd: resolve(snapshotRoot, 'apps/v1_api'),
    env: childEnv,
    lifecycle,
  });
}

async function runCommands(
  options,
  payload,
  repoRoot,
  childEnv,
  lifecycle,
  snapshotRoot,
  migrationRequired,
) {
  const results = [];
  if (migrationRequired) {
    const migration = await applyMigrationSnapshot(snapshotRoot, childEnv, lifecycle, repoRoot);
    results.push({
      kind: 'migration-snapshot',
      command: ['prisma', 'migrate', 'deploy'],
      ...migration,
    });
    if (migration.code !== 0) return results;
  }
  if (options['root-prepare']) {
    const preparation = await runChild('/bin/sh', ['-lc', options['root-prepare']], {
      cwd: snapshotRoot,
      env: childEnv,
      lifecycle,
    });
    results.push({ kind: 'root-prepare', command: options['root-prepare'], ...preparation });
    if (preparation.code !== 0) return results;
  }
  const executionRoot = options['snapshot-owned'] ? snapshotRoot : repoRoot;
  const cwd = packageCwd(executionRoot, options.package);
  if (options.sequence) {
    for (const command of options.sequence) {
      const result = await runChild('/bin/sh', ['-lc', command], {
        cwd,
        env: childEnv,
        lifecycle,
      });
      results.push({ kind: 'sequence', command, ...result });
      if (result.code !== 0) break;
    }
  } else {
    const result = await runChild(payload[0], payload.slice(1), {
      cwd,
      env: childEnv,
      lifecycle,
      ports: options.browser === 'headed' ? TARGET_PORTS : [],
    });
    results.push({ kind: 'payload', command: payload, ...result });
  }
  return results;
}

function commandIdentity(options, payload) {
  const commands = [
    ...(options['root-prepare'] ? [{ kind: 'root-prepare', command: options['root-prepare'] }] : []),
    ...(options.sequence
      ? options.sequence.map((command) => ({ kind: 'sequence', command }))
      : [{ kind: 'payload', command: payload }]),
  ];
  return { commands, commandHash: sha256(JSON.stringify(commands)) };
}

function requireExactOption(options, name, expected) {
  if (options[name] !== expected) {
    throw new HarnessError(
      'V0_EXECUTION_CHAIN_INVALID',
      `--${name} must exactly match the clean-restart authority`,
      78,
    );
  }
}

function requireEnvironmentPair(pathName, shaName, expected) {
  const suppliedPath = process.env[pathName];
  const suppliedSHA = process.env[shaName];
  if (
    !suppliedPath ||
    !suppliedSHA ||
    resolve(suppliedPath) !== resolve(expected.path) ||
    suppliedSHA !== expected.sha256
  ) {
    throw new HarnessError(
      'V0_EXECUTION_CHAIN_INVALID',
      `${pathName}/${shaName} must be supplied as the exact canonical pair`,
      78,
    );
  }
}

function verifyTaskOneCleanRestartChain(options, repoRoot, plan, liveHead) {
  requireExactOption(options, 'plan-sha', plan.selectedSHA);
  requireExactOption(options, 'baseline-sha', TASK_ONE_BASELINE_SHA);
  requireExactOption(options, 'restart-head-sha', TASK_ONE_RESTART_HEAD_SHA);
  requireExactOption(options, 'predecessor-chain', TASK_ONE_PREDECESSOR_CHAIN.join(','));
  requireExactOption(options, 'candidate-sha', 'null');
  requireExactOption(options, 'require-task127-cursor-mode', 'clean-restart-initial');
  requireExactOption(options, 'require-task127-cursor-receipt', TASK_ONE_RECEIPTS.cursor.path);
  requireExactOption(
    options,
    'require-task127-cursor-receipt-sha',
    TASK_ONE_RECEIPTS.cursor.sha256,
  );
  if (!options['hostile-no-docker-control']) {
    throw new HarnessError(
      'V0_EXECUTION_CHAIN_INVALID',
      'V1 clean restart requires --hostile-no-docker-control',
      78,
    );
  }
  if (liveHead !== TASK_ONE_RESTART_HEAD_SHA) {
    throw new HarnessError(
      'BASELINE_INPUT_DRIFT',
      `V1 clean restart requires HEAD=${TASK_ONE_RESTART_HEAD_SHA}; observed ${liveHead}`,
      68,
    );
  }

  requireEnvironmentPair(
    'OMO_REVIEW_RECEIPT_PATH',
    'OMO_REVIEW_RECEIPT_SHA',
    TASK_ONE_RECEIPTS.approval,
  );
  requireEnvironmentPair(
    'V1_TASK127_CURSOR_RECEIPT_PATH',
    'V1_TASK127_CURSOR_RECEIPT_SHA',
    TASK_ONE_RECEIPTS.cursor,
  );
  requireEnvironmentPair(
    'V1_HOST_PRESSURE_OVERRIDE_RECEIPT_PATH',
    'V1_HOST_PRESSURE_OVERRIDE_RECEIPT_SHA',
    TASK_ONE_RECEIPTS.override,
  );
  requireEnvironmentPair(
    'V1_V0_CONSUMPTION_RECEIPT_PATH',
    'V1_V0_CONSUMPTION_RECEIPT_SHA',
    TASK_ONE_RECEIPTS.consumption,
  );

  const descriptors = Object.fromEntries(
    Object.entries(TASK_ONE_RECEIPTS).map(([name, identity]) => [
      name,
      secureImmutableDescriptor(
        resolve(repoRoot, identity.path),
        identity.sha256,
        'V0_EXECUTION_CHAIN_INVALID',
        78,
      ),
    ]),
  );
  const hostPath = options['require-host-supervisor-receipt'];
  const hostSHA = options['require-host-supervisor-receipt-sha'];
  if (!hostPath || !hostSHA) {
    throw new HarnessError(
      'HOST_SUPERVISOR_RECEIPT_INVALID',
      'Trusted host-supervisor receipt path and SHA are both required',
      78,
    );
  }
  const host = secureImmutableDescriptor(
    hostPath,
    hostSHA,
    'HOST_SUPERVISOR_RECEIPT_INVALID',
    78,
  );
  const approval = descriptors.approval.receipt;
  const cursor = descriptors.cursor.receipt;
  const override = descriptors.override.receipt;
  const consumption = descriptors.consumption.receipt;
  const rollback = descriptors.rollback.receipt;
  if (
    approval.verdict !== 'APPROVED' ||
    approval.planSha256 !== plan.selectedSHA ||
    cursor.receiptType !== 'task-1-task127-clean-restart-cursor' ||
    cursor.mode !== 'clean-restart-initial' ||
    cursor.planSHA256 !== plan.selectedSHA ||
    cursor.restartHeadSHA !== TASK_ONE_RESTART_HEAD_SHA ||
    JSON.stringify(cursor.predecessorChain) !== JSON.stringify(TASK_ONE_PREDECESSOR_CHAIN) ||
    cursor.unrelatedDirtyFingerprintAfter !==
      '65051bf57a83e1bf287a654fdb121e7361bd9136e673bac0a9a149ecf11c4923' ||
    override.taskId !== 1 ||
    override.workloadId !== TASK_ONE_WORKLOAD ||
    override.planSHA256 !== plan.selectedSHA ||
    override.scope !== 'stable-absolute-swap-and-node-mcp-count-only' ||
    override.resourceLimits?.cpus !== 1 ||
    override.resourceLimits?.memoryBytes !== 4_294_967_296 ||
    override.resourceLimits?.pidsLimit !== 256 ||
    consumption.receiptType !== 'task-1-v0-execution-consumption' ||
    consumption.verdict !== 'CONSUMED' ||
    consumption.singleUse !== true ||
    consumption.plan?.sha256 !== plan.selectedSHA ||
    consumption.overrideReceipt?.sha256 !== TASK_ONE_RECEIPTS.override.sha256 ||
    !(new Date(consumption.consumedAt) < new Date(consumption.overrideReceipt.expiresAt)) ||
    rollback.schemaVersion !== 1
  ) {
    throw new HarnessError(
      'V0_EXECUTION_CHAIN_INVALID',
      'Approval, cursor, override, consumption, or rollback semantics do not match',
      78,
    );
  }
  if (
    host.receipt.schemaVersion !== 1 ||
    host.receipt.receiptType !== 'task-1-host-supervisor-gate' ||
    host.receipt.taskId !== 1 ||
    host.receipt.workloadId !== TASK_ONE_WORKLOAD ||
    host.receipt.planSHA !== plan.selectedSHA ||
    host.receipt.verdict !== 'APPROVE' ||
    host.receipt.approvalReceipt?.sha256 !== TASK_ONE_RECEIPTS.approval.sha256 ||
    host.receipt.task127CursorReceipt?.sha256 !== TASK_ONE_RECEIPTS.cursor.sha256 ||
    host.receipt.overrideReceipt?.sha256 !== TASK_ONE_RECEIPTS.override.sha256 ||
    host.receipt.consumptionReceipt?.sha256 !== TASK_ONE_RECEIPTS.consumption.sha256 ||
    Object.values(host.receipt.cleanup ?? {}).some((value) => value !== 0)
  ) {
    throw new HarnessError(
      'HOST_SUPERVISOR_RECEIPT_INVALID',
      'Trusted host-supervisor receipt does not bind the clean-restart chain',
      78,
    );
  }
  return { ...descriptors, host };
}

function dockerResult(args, options = {}) {
  return spawnSync('docker', args, {
    cwd: options.cwd,
    env: options.env,
    encoding: 'utf8',
    maxBuffer: 128 * 1024 * 1024,
    timeout: options.timeout ?? 30_000,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function dockerRequired(args, code = 'DOCKER_LIFECYCLE_FAILED', options = {}) {
  const result = dockerResult(args, options);
  if (result.error || result.status !== 0 || result.signal) {
    throw new HarnessError(
      code,
      `docker ${args[0]} failed: ${result.error?.message ?? result.stderr.trim()}`,
      73,
    );
  }
  return result.stdout.trim();
}

function verificationImage(repoRoot) {
  const dockerfilePath = resolve(repoRoot, VERIFICATION_DOCKERFILE);
  const dockerfileSHA = descriptorRead(dockerfilePath).sha256;
  const lockfileSHA = descriptorRead(resolve(repoRoot, 'pnpm-lock.yaml')).sha256;
  const expectedLabels = {
    'com.teameet.verification.image': '1',
    'com.teameet.verification.dockerfile-sha': dockerfileSHA,
    'com.teameet.verification.lockfile-sha': lockfileSHA,
    'com.teameet.verification.node': '>=22',
    'com.teameet.verification.pnpm': '9.15.4',
  };
  let inspect = dockerResult(['image', 'inspect', VERIFICATION_IMAGE]);
  let parsed = inspect.status === 0 ? JSON.parse(inspect.stdout)[0] : null;
  const labelsMatch = parsed && Object.entries(expectedLabels).every(
    ([name, value]) => parsed.Config?.Labels?.[name] === value,
  );
  if (!labelsMatch) {
    const buildArgs = ['build', '--file', VERIFICATION_DOCKERFILE, '--tag', VERIFICATION_IMAGE];
    for (const [name, value] of Object.entries(expectedLabels)) {
      buildArgs.push('--label', `${name}=${value}`);
    }
    buildArgs.push('.');
    dockerRequired(buildArgs, 'VERIFICATION_IMAGE_INVALID', {
      cwd: repoRoot,
      timeout: 600_000,
    });
    inspect = dockerResult(['image', 'inspect', VERIFICATION_IMAGE]);
    if (inspect.status !== 0) {
      throw new HarnessError(
        'VERIFICATION_IMAGE_INVALID',
        'Built verification image cannot be inspected',
        73,
      );
    }
    parsed = JSON.parse(inspect.stdout)[0];
  }
  if (
    parsed.Os !== 'linux' ||
    !['amd64', 'arm64'].includes(parsed.Architecture) ||
    parsed.Config?.User !== '10001:10001'
  ) {
    throw new HarnessError(
      'VERIFICATION_IMAGE_INVALID',
      'Verification image platform or non-root user does not match',
      73,
    );
  }
  return {
    name: VERIFICATION_IMAGE,
    id: parsed.Id,
    platform: `linux/${parsed.Architecture}`,
    dockerfilePath: VERIFICATION_DOCKERFILE,
    dockerfileSHA,
    lockfileSHA,
    nodeVersion: parsed.Config?.Labels?.['com.teameet.verification.node'],
    pnpmVersion: parsed.Config?.Labels?.['com.teameet.verification.pnpm'],
  };
}

function verifyResourceLabels(resourceType, identity, expectedLabels) {
  const inspected = JSON.parse(dockerRequired(['inspect', '--type', resourceType, identity]))[0];
  const observedLabels = inspected.Config?.Labels ?? inspected.Labels ?? {};
  for (const [name, value] of Object.entries(expectedLabels)) {
    if (observedLabels[name] !== value) {
      throw new HarnessError(
        'DOCKER_RESOURCE_IDENTITY_MISMATCH',
        `${resourceType} ${identity} label ${name} does not match`,
        73,
      );
    }
  }
  return inspected;
}

function exactDockerCleanup(resources, labels) {
  const cleanupErrors = [];
  if (resources.containerId) {
    try {
      verifyResourceLabels('container', resources.containerId, labels);
      dockerResult(['stop', '--time', '3', resources.containerId], { timeout: 10_000 });
      const removed = dockerResult(['rm', '--force', resources.containerId], { timeout: 10_000 });
      if (removed.status !== 0 && !/No such container/i.test(removed.stderr)) {
        cleanupErrors.push(removed.stderr.trim());
      }
    } catch (error) {
      cleanupErrors.push(error.message);
    }
  }
  for (const volume of resources.volumes) {
    const inspected = dockerResult(['volume', 'inspect', volume]);
    if (inspected.status === 0) {
      const value = JSON.parse(inspected.stdout)[0];
      if (Object.entries(labels).some(([name, label]) => value.Labels?.[name] !== label)) {
        cleanupErrors.push(`volume ${volume} label mismatch`);
        continue;
      }
      const removed = dockerResult(['volume', 'rm', '--force', volume]);
      if (removed.status !== 0) cleanupErrors.push(removed.stderr.trim());
    }
  }
  if (resources.networkId) {
    try {
      verifyResourceLabels('network', resources.networkId, labels);
      const removed = dockerResult(['network', 'rm', resources.networkId], { timeout: 10_000 });
      if (removed.status !== 0 && !/not found/i.test(removed.stderr)) {
        cleanupErrors.push(removed.stderr.trim());
      }
    } catch (error) {
      cleanupErrors.push(error.message);
    }
  }
  return cleanupErrors;
}

function assertTaskOneHostGates(preflight, chain, preflightOverride = null) {
  assertPortsFree(preflight);
  const baseline = chain.consumption.receipt.hardGates;
  const limits = chain.override.receipt.hardGrowthGates;
  const waivers = preflightOverride?.waivers ?? {};
  const failures = [];
  if (preflight.loadAverage[0] > preflight.logicalCores * 2) failures.push('LOAD_PER_CORE_PRESSURE');
  if (preflight.docker.state !== 'available') failures.push('DOCKER_UNHEALTHY');
  if (
    preflight.nodeMcpCount - baseline.nodeMcpCount >= limits.nodeMcpGrowthAtLeast &&
    waivers.nodeMcpGrowth !== true
  ) {
    failures.push('NODE_MCP_GROWTH');
  }
  if (
    preflight.browserCount - baseline.browserCount >= 20 &&
    waivers.browserRelativeGrowth !== true
  ) {
    failures.push('BROWSER_GROWTH');
  }
  if (preflight.browserCount > 200) failures.push('BROWSER_PROCESS_PROLIFERATION');
  if (failures.length > 0) {
    throw new HarnessError('HOST_PREFLIGHT_BLOCKED', failures.join(','), 72);
  }
}

function exactObjectKeys(value, expected) {
  return (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expected].sort())
  );
}

function taskOneAuthorityPairMatches(repoRoot, supplied, expected) {
  return (
    exactObjectKeys(supplied, ['path', 'sha256']) &&
    resolve(repoRoot, supplied.path) === expected.path &&
    supplied.sha256 === expected.sha256
  );
}

function verifyTaskOneNodeMcpOverride(options, repoRoot, plan, phase, chain) {
  const suppliedPath = options['require-node-mcp-override-receipt'];
  const suppliedSHA = options['require-node-mcp-override-receipt-sha'];
  if (!suppliedPath || !suppliedSHA) {
    throw new HarnessError(
      'NODE_MCP_OVERRIDE_INVALID',
      'Task-1 Node/MCP override receipt path and SHA are both required',
      75,
    );
  }
  const canonicalPath = resolve(repoRoot, TASK_ONE_NODE_MCP_OVERRIDE.path);
  const absoluteSuppliedPath = isAbsolute(suppliedPath)
    ? resolve(suppliedPath)
    : resolve(repoRoot, suppliedPath);
  if (absoluteSuppliedPath !== canonicalPath) {
    throw new HarnessError(
      'NODE_MCP_OVERRIDE_INVALID',
      `Task-1 Node/MCP override receipt path must be ${TASK_ONE_NODE_MCP_OVERRIDE.path}`,
      75,
    );
  }
  const descriptor = secureImmutableDescriptor(
    absoluteSuppliedPath,
    suppliedSHA,
    'NODE_MCP_OVERRIDE_INVALID',
    75,
  );
  const receipt = descriptor.receipt;
  const authority = receipt.authorityReceipts;
  const valid =
    exactObjectKeys(receipt, [
      'appliesToPhases',
      'authorityReceipts',
      'createdAt',
      'planPath',
      'planSHA256',
      'preservedFailures',
      'receiptType',
      'schemaVersion',
      'scope',
      'sessionId',
      'taskId',
      'userAuthorization',
      'waivedFailure',
      'workloadId',
    ]) &&
    exactObjectKeys(authority, ['approval', 'consumption', 'cursor', 'hostSupervisor']) &&
    exactObjectKeys(receipt.userAuthorization, ['sha256', 'text']) &&
    receipt.schemaVersion === 1 &&
    receipt.receiptType === 'task-1-node-mcp-growth-override' &&
    receipt.planPath === PLAN_PATH &&
    receipt.planSHA256 === plan.selectedSHA &&
    receipt.taskId === 1 &&
    receipt.workloadId === TASK_ONE_WORKLOAD &&
    receipt.sessionId === VERIFICATION_SESSION_ID &&
    receipt.scope === 'node-mcp-preflight-growth-only' &&
    JSON.stringify(receipt.appliesToPhases) ===
      JSON.stringify(['clean-restart', 'candidate']) &&
    receipt.appliesToPhases.includes(phase) &&
    receipt.waivedFailure === 'NODE_MCP_GROWTH' &&
    JSON.stringify(receipt.preservedFailures) ===
      JSON.stringify(TASK_ONE_NODE_MCP_PRESERVED_FAILURES) &&
    receipt.userAuthorization.text === TASK_ONE_NODE_MCP_OVERRIDE_TEXT &&
    receipt.userAuthorization.sha256 === sha256(TASK_ONE_NODE_MCP_OVERRIDE_TEXT) &&
    receipt.createdAt === '2026-07-30T12:34:26.310Z' &&
    taskOneAuthorityPairMatches(repoRoot, authority?.approval, chain.approval) &&
    taskOneAuthorityPairMatches(repoRoot, authority?.cursor, chain.cursor) &&
    taskOneAuthorityPairMatches(repoRoot, authority?.consumption, chain.consumption) &&
    taskOneAuthorityPairMatches(repoRoot, authority?.hostSupervisor, chain.host);
  if (!valid || descriptor.sha256 !== TASK_ONE_NODE_MCP_OVERRIDE.sha256) {
    throw new HarnessError(
      'NODE_MCP_OVERRIDE_INVALID',
      'Task-1 Node/MCP override does not bind the exact plan, session, authority chain, or narrow failure scope',
      75,
    );
  }
  return {
    ...descriptor,
    waivers: {
      nodeMcpGrowth: true,
      browserRelativeGrowth: false,
    },
  };
}

function verifyTaskOneRelativeGrowthOverride(options, repoRoot, plan, phase, chain) {
  const suppliedPath = options['require-relative-growth-override-receipt'];
  const suppliedSHA = options['require-relative-growth-override-receipt-sha'];
  if (!suppliedPath || !suppliedSHA) {
    throw new HarnessError(
      'RELATIVE_GROWTH_OVERRIDE_INVALID',
      'Task-1 relative-growth override receipt path and SHA are both required',
      75,
    );
  }
  const canonicalPath = resolve(repoRoot, TASK_ONE_RELATIVE_GROWTH_OVERRIDE.path);
  const absoluteSuppliedPath = isAbsolute(suppliedPath)
    ? resolve(suppliedPath)
    : resolve(repoRoot, suppliedPath);
  if (absoluteSuppliedPath !== canonicalPath) {
    throw new HarnessError(
      'RELATIVE_GROWTH_OVERRIDE_INVALID',
      `Task-1 relative-growth override receipt path must be ${TASK_ONE_RELATIVE_GROWTH_OVERRIDE.path}`,
      75,
    );
  }
  let receiptStat;
  try {
    receiptStat = lstatSync(absoluteSuppliedPath);
  } catch (error) {
    throw new HarnessError(
      'RELATIVE_GROWTH_OVERRIDE_INVALID',
      `${absoluteSuppliedPath}: ${error.message}`,
      75,
    );
  }
  if (receiptStat.nlink !== 1) {
    throw new HarnessError(
      'RELATIVE_GROWTH_OVERRIDE_INVALID',
      `${absoluteSuppliedPath}: receipt must have exactly one hard link`,
      75,
    );
  }
  const descriptor = secureImmutableDescriptor(
    absoluteSuppliedPath,
    suppliedSHA,
    'RELATIVE_GROWTH_OVERRIDE_INVALID',
    75,
  );
  const receipt = descriptor.receipt;
  const authority = receipt.authorityReceipts;
  const userAuthorizations = receipt.userAuthorizations;
  const valid =
    exactObjectKeys(receipt, [
      'absoluteCaps',
      'appliesToPhases',
      'authorityReceipts',
      'cleanup',
      'createdAt',
      'inRunHardGrowthGates',
      'maxConcurrency',
      'noOtherSessionTermination',
      'planPath',
      'planSHA256',
      'preservedFailures',
      'processHandling',
      'receiptType',
      'schemaVersion',
      'scope',
      'serialExecution',
      'sessionId',
      'supersedesReceipt',
      'taskId',
      'userAuthorizations',
      'waivedPreflightFailures',
      'workloadId',
    ]) &&
    exactObjectKeys(authority, ['approval', 'consumption', 'cursor', 'hostSupervisor']) &&
    exactObjectKeys(receipt.supersedesReceipt, ['path', 'sha256']) &&
    exactObjectKeys(receipt.absoluteCaps, ['browserCountGreaterThan']) &&
    exactObjectKeys(receipt.inRunHardGrowthGates, [
      'browserGrowthAtLeast',
      'nodeMcpGrowthAtLeast',
      'swapGrowthBytesAtLeast',
    ]) &&
    exactObjectKeys(receipt.processHandling, [
      'furtherTerminationAllowed',
      'preservedProcessClasses',
      'removedOrphanAutomationPids',
    ]) &&
    exactObjectKeys(receipt.cleanup, [
      'containers',
      'hostBrowserPids',
      'networks',
      'overlays',
      'publishedPorts',
      'tempRoots',
      'volumes',
    ]) &&
    Array.isArray(userAuthorizations) &&
    userAuthorizations.length === 2 &&
    userAuthorizations.every((authorization) =>
      exactObjectKeys(authorization, ['kind', 'sha256', 'text'])) &&
    receipt.schemaVersion === 1 &&
    receipt.receiptType === 'task-1-preflight-relative-growth-override' &&
    receipt.planPath === PLAN_PATH &&
    receipt.planSHA256 === plan.selectedSHA &&
    receipt.taskId === 1 &&
    receipt.workloadId === TASK_ONE_WORKLOAD &&
    receipt.sessionId === VERIFICATION_SESSION_ID &&
    receipt.scope === 'task-1-preflight-relative-node-browser-growth-only' &&
    JSON.stringify(receipt.appliesToPhases) ===
      JSON.stringify(['clean-restart', 'candidate']) &&
    receipt.appliesToPhases.includes(phase) &&
    resolve(repoRoot, receipt.supersedesReceipt.path) ===
      resolve(repoRoot, TASK_ONE_NODE_MCP_OVERRIDE.path) &&
    receipt.supersedesReceipt.sha256 === TASK_ONE_NODE_MCP_OVERRIDE.sha256 &&
    userAuthorizations[0].kind === 'initial-host-gate' &&
    userAuthorizations[0].text === TASK_ONE_NODE_MCP_OVERRIDE_TEXT &&
    userAuthorizations[0].sha256 === sha256(TASK_ONE_NODE_MCP_OVERRIDE_TEXT) &&
    userAuthorizations[1].kind === 'browser-cleanup-continuation' &&
    userAuthorizations[1].text === TASK_ONE_RELATIVE_GROWTH_OVERRIDE_TEXT &&
    userAuthorizations[1].sha256 ===
      sha256(TASK_ONE_RELATIVE_GROWTH_OVERRIDE_TEXT) &&
    JSON.stringify(receipt.waivedPreflightFailures) ===
      JSON.stringify(['NODE_MCP_GROWTH', 'BROWSER_RELATIVE_GROWTH']) &&
    JSON.stringify(receipt.preservedFailures) ===
      JSON.stringify(TASK_ONE_RELATIVE_GROWTH_PRESERVED_FAILURES) &&
    receipt.absoluteCaps.browserCountGreaterThan === 200 &&
    receipt.inRunHardGrowthGates.nodeMcpGrowthAtLeast === 50 &&
    receipt.inRunHardGrowthGates.browserGrowthAtLeast === 20 &&
    receipt.inRunHardGrowthGates.swapGrowthBytesAtLeast === 2_147_483_648 &&
    receipt.serialExecution === true &&
    receipt.maxConcurrency === 1 &&
    receipt.noOtherSessionTermination === true &&
    JSON.stringify(receipt.processHandling.removedOrphanAutomationPids) ===
      JSON.stringify([64279]) &&
    JSON.stringify(receipt.processHandling.preservedProcessClasses) ===
      JSON.stringify([
        'user Chrome',
        'system WebKit',
        'Docker',
        'current Codex',
        'foreign Claude sessions',
      ]) &&
    receipt.processHandling.furtherTerminationAllowed === false &&
    Object.values(receipt.cleanup).every((value) => value === 0) &&
    receipt.createdAt === '2026-07-30T14:23:59.551Z' &&
    taskOneAuthorityPairMatches(repoRoot, authority?.approval, chain.approval) &&
    taskOneAuthorityPairMatches(repoRoot, authority?.cursor, chain.cursor) &&
    taskOneAuthorityPairMatches(repoRoot, authority?.consumption, chain.consumption) &&
    taskOneAuthorityPairMatches(repoRoot, authority?.hostSupervisor, chain.host);
  if (!valid || descriptor.sha256 !== TASK_ONE_RELATIVE_GROWTH_OVERRIDE.sha256) {
    throw new HarnessError(
      'RELATIVE_GROWTH_OVERRIDE_INVALID',
      'Task-1 relative-growth override does not bind the exact plan, session, predecessor, authority chain, or narrow preflight scope',
      75,
    );
  }
  return {
    ...descriptor,
    waivers: {
      nodeMcpGrowth: true,
      browserRelativeGrowth: true,
    },
  };
}

function taskOneMounts(repoRoot, snapshot, chain, preflightOverride = null) {
  const designBytes = git(
    [
      'show',
      `${TASK_ONE_BASELINE_SHA}:docs/reference/handoff-sm-new-direction/sports-platform/project/Teameet Design.html`,
    ],
    { cwd: repoRoot, encoding: null },
  );
  const designReceipt = immutableWriteOrReuse(
    join(snapshot.attemptDir, 'bound-design.html'),
    designBytes,
  );
  const mounts = [
    {
      source: chain.approval.path,
      target: '/verification/receipts/approval.json',
      envPath: 'OMO_REVIEW_RECEIPT_PATH',
      envSHA: 'OMO_REVIEW_RECEIPT_SHA',
      sha256: chain.approval.sha256,
    },
    {
      source: chain.cursor.path,
      target: '/verification/receipts/cursor.json',
      envPath: 'V1_TASK127_CURSOR_RECEIPT_PATH',
      envSHA: 'V1_TASK127_CURSOR_RECEIPT_SHA',
      sha256: chain.cursor.sha256,
    },
    {
      source: chain.override.path,
      target: '/verification/receipts/override.json',
      envPath: 'V1_HOST_PRESSURE_OVERRIDE_RECEIPT_PATH',
      envSHA: 'V1_HOST_PRESSURE_OVERRIDE_RECEIPT_SHA',
      sha256: chain.override.sha256,
    },
    {
      source: chain.consumption.path,
      target: '/verification/receipts/consumption.json',
      envPath: 'V1_V0_CONSUMPTION_RECEIPT_PATH',
      envSHA: 'V1_V0_CONSUMPTION_RECEIPT_SHA',
      sha256: chain.consumption.sha256,
    },
    {
      source: chain.rollback.path,
      target: '/verification/receipts/rollback.json',
      envPath: 'V1_ROLLBACK_RECEIPT_PATH',
      envSHA: 'V1_ROLLBACK_RECEIPT_SHA',
      sha256: chain.rollback.sha256,
    },
    {
      source: chain.host.path,
      target: '/verification/receipts/host-supervisor.json',
      envPath: 'V1_HOST_SUPERVISOR_RECEIPT_PATH',
      envSHA: 'V1_HOST_SUPERVISOR_RECEIPT_SHA',
      sha256: chain.host.sha256,
    },
    {
      source: resolve(repoRoot, PLAN_PATH),
      target: '/verification/receipts/plan.md',
      envPath: 'V1_SELECTED_PLAN_PATH',
      envSHA: 'OMO_SELECTED_PLAN_SHA',
      sha256: chain.approval.receipt.planSha256,
    },
    {
      source: snapshot.sourceManifestPath,
      target: '/verification/receipts/source-manifest.json',
      envPath: 'V1_SOURCE_MANIFEST_PATH',
      envSHA: 'V1_SOURCE_MANIFEST_SHA',
      sha256: snapshot.sourceManifestSHA,
    },
    {
      source:
        '/Users/sungjun/Downloads/Teameet_app_v1_팀관리_대회운영_상세기획서_2026-07-28.pdf',
      target: '/verification/bound/product.pdf',
      envPath: 'V1_BOUND_PDF_PATH',
      envSHA: null,
      sha256: null,
    },
    {
      source: '/Users/sungjun/Downloads/preview.html',
      target: '/verification/bound/preview.html',
      envPath: 'V1_BOUND_PREVIEW_PATH',
      envSHA: null,
      sha256: null,
    },
    {
      source: designReceipt.path,
      target: '/verification/bound/design.html',
      envPath: 'V1_BOUND_DESIGN_PATH',
      envSHA: null,
      sha256: designReceipt.sha256,
    },
  ];
  if (preflightOverride) {
    mounts.push({
      source: preflightOverride.path,
      target: '/verification/receipts/preflight-growth-override.json',
      envPath: 'V1_PREFLIGHT_GROWTH_OVERRIDE_RECEIPT_PATH',
      envSHA: 'V1_PREFLIGHT_GROWTH_OVERRIDE_RECEIPT_SHA',
      sha256: preflightOverride.sha256,
    });
  }
  return mounts;
}

async function runTaskOneCleanRestart({
  options,
  payload,
  repoRoot,
  ledger,
  plan,
  branch,
  liveHead,
  candidate = null,
}) {
  const phase = candidate ? 'candidate' : 'clean-restart';
  const chain = candidate?.chain ??
    verifyTaskOneCleanRestartChain(options, repoRoot, plan, liveHead);
  validateDirtyScope(repoRoot, ledger, 1);
  verifyTaskOneDirty(repoRoot, ledger);
  if (candidate) {
    verifyOwnedPathsClean(repoRoot, ownershipRow(ledger, 1).outputs);
  }
  const preflightStart = hostPreflight().preflight;
  const nodeMcpGrowth =
    preflightStart.nodeMcpCount - chain.consumption.receipt.hardGates.nodeMcpCount >=
    chain.override.receipt.hardGrowthGates.nodeMcpGrowthAtLeast;
  const nodeMcpOverrideSupplied =
    options['require-node-mcp-override-receipt'] !== undefined ||
    options['require-node-mcp-override-receipt-sha'] !== undefined;
  const relativeGrowthOverrideSupplied =
    options['require-relative-growth-override-receipt'] !== undefined ||
    options['require-relative-growth-override-receipt-sha'] !== undefined;
  if (nodeMcpOverrideSupplied && relativeGrowthOverrideSupplied) {
    throw new HarnessError(
      'RELATIVE_GROWTH_OVERRIDE_INVALID',
      'Task-1 relative-growth override supersedes the Node/MCP-only receipt; both cannot be supplied',
      75,
    );
  }
  const preflightOverride = relativeGrowthOverrideSupplied
    ? verifyTaskOneRelativeGrowthOverride(options, repoRoot, plan, phase, chain)
    : nodeMcpGrowth || nodeMcpOverrideSupplied
      ? verifyTaskOneNodeMcpOverride(options, repoRoot, plan, phase, chain)
      : null;
  assertTaskOneHostGates(preflightStart, chain, preflightOverride);
  const attemptId = randomUUID();
  const evidenceRoot = resolve(options['evidence-root'] ?? DEFAULT_EVIDENCE_ROOT);
  const snapshot = candidate
    ? createCandidateSourceSnapshot(
        repoRoot,
        candidate,
        attemptId,
        evidenceRoot,
      )
    : createSourceSnapshot(
        repoRoot,
        ledger,
        1,
        attemptId,
        evidenceRoot,
      );
  const image = verificationImage(repoRoot);
  const source = prepareSnapshotExecution(snapshot, repoRoot, false);
  const resourcePrefix = `teameet-v1-verify-${attemptId}`;
  const resources = {
    containerName: `${resourcePrefix}-payload`,
    containerId: null,
    networkName: `${resourcePrefix}-net`,
    networkId: null,
    volumes: [`${resourcePrefix}-cache-pnpm`],
  };
  const labels = {
    'com.teameet.verification': '1',
    'com.teameet.attempt': attemptId,
    'com.teameet.plan-sha': plan.selectedSHA,
    'com.teameet.source-tree': snapshot.sourceTreeSHA,
    'com.teameet.owner': 'outer',
  };
  const labelArgs = Object.entries(labels).flatMap(([name, value]) => ['--label', `${name}=${value}`]);
  const mounts = taskOneMounts(repoRoot, snapshot, chain, preflightOverride);
  const containerEnvironment = {
    CI: '1',
    TZ: 'UTC',
    LANG: 'C.UTF-8',
    HOME: '/verification/cache/home',
    PNPM_HOME: '/verification/cache/pnpm',
    V1_TASK_ATTEMPT_ID: attemptId,
    V1_TASK_GATE_ID: 'V1',
    V1_TASK_SOURCE_TREE_SHA: snapshot.sourceTreeSHA,
    ...Object.fromEntries(mounts.flatMap((mount) => [
      [mount.envPath, mount.target],
      ...(mount.envSHA ? [[mount.envSHA, mount.sha256]] : []),
    ])),
  };
  let payloadResult = { status: null, signal: null, stdout: '', stderr: '', error: null };
  let payloadExitCode = null;
  let inspect = null;
  let cleanupErrors = [];
  let interrupted = false;
  const onInterrupt = () => {
    interrupted = true;
    if (resources.containerId) {
      dockerResult(['stop', '--time', '3', resources.containerId], { timeout: 10_000 });
    }
  };
  process.on('SIGINT', onInterrupt);
  process.on('SIGTERM', onInterrupt);
  try {
    resources.networkId = dockerRequired([
      'network',
      'create',
      ...labelArgs,
      resources.networkName,
    ]);
    verifyResourceLabels('network', resources.networkId, labels);
    for (const volume of resources.volumes) {
      dockerRequired(['volume', 'create', ...labelArgs, volume]);
      const volumeInspect = JSON.parse(dockerRequired(['volume', 'inspect', volume]))[0];
      if (Object.entries(labels).some(([name, value]) => volumeInspect.Labels?.[name] !== value)) {
        throw new HarnessError(
          'DOCKER_RESOURCE_IDENTITY_MISMATCH',
          `volume ${volume} labels do not match`,
          73,
        );
      }
    }
    const createArgs = [
      'create',
      '--name',
      resources.containerName,
      ...labelArgs,
      '--user',
      '10001:10001',
      '--cap-drop',
      'ALL',
      '--security-opt',
      'no-new-privileges',
      '--cpus',
      '1',
      '--memory',
      '4g',
      '--pids-limit',
      '256',
      '--read-only',
      '--network',
      resources.networkName,
      '--ipc',
      'private',
      '--tmpfs',
      '/tmp:rw,noexec,nosuid,nodev,size=128m',
      '--mount',
      `type=bind,src=${source.root},dst=/verification/source,readonly`,
      '--mount',
      `type=volume,src=${resources.volumes[0]},dst=/verification/cache`,
      '--workdir',
      options.package
        ? `/verification/source/apps/${options.package}`
        : '/verification/source',
    ];
    for (const [name, value] of Object.entries(containerEnvironment)) {
      createArgs.push('--env', `${name}=${value}`);
    }
    for (const mount of mounts) {
      createArgs.push('--mount', `type=bind,src=${mount.source},dst=${mount.target},readonly`);
    }
    createArgs.push(image.name, ...payload);
    resources.containerId = dockerRequired(createArgs);
    inspect = verifyResourceLabels('container', resources.containerId, labels);
    if (
      inspect.HostConfig.NanoCpus !== 1_000_000_000 ||
      inspect.HostConfig.Memory !== 4_294_967_296 ||
      inspect.HostConfig.PidsLimit !== 256 ||
      inspect.HostConfig.ReadonlyRootfs !== true ||
      inspect.HostConfig.Privileged !== false ||
      inspect.HostConfig.NetworkMode !== resources.networkName ||
      inspect.HostConfig.CapDrop?.join(',') !== 'ALL' ||
      inspect.HostConfig.SecurityOpt?.includes('no-new-privileges') !== true ||
      inspect.Mounts.some((mount) => mount.Destination === '/var/run/docker.sock') ||
      Object.keys(inspect.HostConfig.PortBindings ?? {}).length !== 0
    ) {
      throw new HarnessError(
        'PAYLOAD_CONTAINMENT_INVALID',
        'Payload container does not match the frozen cgroup/security contract',
        73,
      );
    }
    const journal = {
      schemaVersion: 1,
      attemptId,
      workloadId: TASK_ONE_WORKLOAD,
      labels,
      resources,
      createdAt: new Date().toISOString(),
    };
    immutableWrite(join(snapshot.attemptDir, 'cleanup-journal.json'), journal);
    payloadResult = dockerResult(['start', '--attach', resources.containerId], {
      timeout: 5_000,
    });
    if (payloadResult.error?.code === 'ETIMEDOUT') {
      dockerResult(['stop', '--time', '3', resources.containerId], { timeout: 10_000 });
    }
    const finalInspect = JSON.parse(
      dockerRequired(['inspect', resources.containerId]),
    )[0];
    payloadExitCode = finalInspect.State.ExitCode;
  } finally {
    process.off('SIGINT', onInterrupt);
    process.off('SIGTERM', onInterrupt);
    cleanupErrors = exactDockerCleanup(resources, labels);
    source.cleanup();
  }

  const residual = {
    containers: dockerRequired([
      'ps',
      '-aq',
      '--filter',
      `label=com.teameet.attempt=${attemptId}`,
    ]),
    networks: dockerRequired([
      'network',
      'ls',
      '-q',
      '--filter',
      `label=com.teameet.attempt=${attemptId}`,
    ]),
    volumes: dockerRequired([
      'volume',
      'ls',
      '-q',
      '--filter',
      `label=com.teameet.attempt=${attemptId}`,
    ]),
  };
  if (cleanupErrors.length > 0 || Object.values(residual).some(Boolean)) {
    throw new HarnessError(
      'DOCKER_CLEANUP_LEAK',
      [...cleanupErrors, JSON.stringify(residual)].join('; '),
      79,
    );
  }
  const preflightEnd = hostPreflight().preflight;
  if (
    preflightEnd.nodeMcpCount - preflightStart.nodeMcpCount >= 50 ||
    preflightEnd.browserCount - preflightStart.browserCount >= 20 ||
    preflightEnd.swapUsedGB - preflightStart.swapUsedGB >= 2
  ) {
    throw new HarnessError(
      'HOST_GROWTH_HARD_GATE',
      'Host process, browser, or swap growth exceeded the hard limit',
      79,
    );
  }
  const stdoutReceipt = immutableWrite(
    join(snapshot.attemptDir, 'payload.stdout'),
    Buffer.from(payloadResult.stdout),
  );
  const stderrReceipt = immutableWrite(
    join(snapshot.attemptDir, 'payload.stderr'),
    Buffer.from(payloadResult.stderr),
  );
  const cleanup = {
    containers: 0,
    networks: 0,
    volumes: 0,
    overlays: 0,
    publishedPorts: 0,
    hostBrowserPids: 0,
    tempRoots: 0,
  };
  const accepted =
    payloadResult.error === undefined || payloadResult.error === null
      ? payloadResult.status === 0 && payloadExitCode === 0 && !interrupted
      : false;
  const command = commandIdentity(options, payload);
  const receipt = {
    schemaVersion: 1,
    gateId: 'V1',
    phase,
    commandId: 'V1',
    commandHash: command.commandHash,
    attemptId,
    baselineSHA: TASK_ONE_BASELINE_SHA,
    restartHeadSHA: TASK_ONE_RESTART_HEAD_SHA,
    candidateSHA: candidate?.receipt.candidateSHA ?? null,
    sourceTreeSHA: snapshot.sourceTreeSHA,
    sourceManifestPath: snapshot.sourceManifestPath,
    sourceManifestSHA: snapshot.sourceManifestSHA,
    planSHA: plan.selectedSHA,
    task127CursorReceiptPath: chain.cursor.path,
    task127CursorReceiptSHA: chain.cursor.sha256,
    hostSupervisorReceiptPath: chain.host.path,
    hostSupervisorReceiptSHA: chain.host.sha256,
    ...(preflightOverride?.receipt.receiptType === 'task-1-node-mcp-growth-override'
      ? {
          nodeMcpOverrideReceiptPath: preflightOverride.path,
          nodeMcpOverrideReceiptSHA: preflightOverride.sha256,
        }
      : {}),
    ...(preflightOverride?.receipt.receiptType ===
      'task-1-preflight-relative-growth-override'
      ? {
          relativeGrowthOverrideReceiptPath: preflightOverride.path,
          relativeGrowthOverrideReceiptSHA: preflightOverride.sha256,
        }
      : {}),
    approvalReceiptPath: chain.approval.path,
    approvalReceiptSHA: chain.approval.sha256,
    overrideReceiptPath: chain.override.path,
    overrideReceiptSHA: chain.override.sha256,
    consumptionReceiptPath: chain.consumption.path,
    consumptionReceiptSHA: chain.consumption.sha256,
    ...(candidate
      ? {
          candidateReceiptPath: candidate.path,
          candidateReceiptSHA: candidate.sha256,
        }
      : {}),
    containerRuntime: {
      cpus: 1,
      memoryBytes: 4_294_967_296,
      pidsLimit: 256,
      privileged: false,
      dockerSocketMounted: false,
      user: '10001:10001',
      capDrop: ['ALL'],
      noNewPrivileges: true,
      readonlyRootfs: true,
    },
    verificationImage: image,
    payloadContainer: {
      id: resources.containerId,
      name: resources.containerName,
      labels,
    },
    network: {
      id: resources.networkId,
      name: resources.networkName,
      labels,
    },
    volumes: resources.volumes,
    publishedPorts: [],
    sourceMount: {
      hostPath: source.root,
      containerPath: '/verification/source',
      readonly: true,
      sourceTreeSHA: snapshot.sourceTreeSHA,
    },
    cache: {
      overlays: resources.volumes,
      perAttempt: true,
      retainedSeedImage: image.id,
    },
    stdoutPath: stdoutReceipt.path,
    stderrPath: stderrReceipt.path,
    payloadExitCode,
    cleanup,
    verdict: accepted ? 'accepted' : 'rejected',
    branch,
    liveHead,
    hostMetrics: {
      before: preflightStart,
      after: preflightEnd,
    },
    createdAt: new Date().toISOString(),
  };
  if (candidate) {
    const finalHead = git(['rev-parse', 'HEAD'], { cwd: repoRoot }).trim();
    if (finalHead !== liveHead) {
      throw new HarnessError(
        'CANDIDATE_BINDING_MISMATCH',
        `Candidate HEAD changed during verification: ${liveHead} -> ${finalHead}`,
        68,
      );
    }
    verifyCommittedSnapshot(repoRoot, snapshot);
    verifyOwnedPathsClean(repoRoot, snapshot.ownedPaths);
    verifyTaskOneDirty(repoRoot, ledger);
  }
  const receiptFile = immutableWrite(join(snapshot.attemptDir, 'V1.json'), receipt);
  const terminal = JSON.stringify({
    ...receipt,
    receiptPath: receiptFile.path,
    receiptSHA: receiptFile.sha256,
  });
  if (!accepted) {
    process.stderr.write(`${terminal}\n`);
    process.exitCode = payloadExitCode || (interrupted ? 130 : 1);
    return;
  }
  process.stdout.write(`${terminal}\n`);
}

async function main() {
  const { options, payload } = parseArgs(process.argv.slice(2));
  if (
    options['pressure-receipt-only'] !== undefined ||
    options['pressure-receipt-sha'] !== undefined
  ) {
    validatePressureReceiptOnly(options, payload);
    return;
  }
  const identity = parseIdentity(options);
  const repoRoot = process.cwd();
  const ledger = parseLedger(resolve(repoRoot, options.ledger ?? DEFAULT_LEDGER));
  const plan = verifyPlanBinding(options, repoRoot, identity.task);
  const branch = git(['branch', '--show-current'], { cwd: repoRoot }).trim();
  const liveHead = git(['rev-parse', 'HEAD'], { cwd: repoRoot }).trim();
  if (branch !== 'dev') {
    throw new HarnessError('BASELINE_INPUT_DRIFT', `Expected dev branch, observed ${branch}`, 68);
  }

  const phase = options.phase ?? (identity.task === 1 ? 'initial' : 'standalone');
  if (!['initial', 'clean-restart', 'standalone', 'candidate', 'local-precleanup'].includes(phase)) {
    throw new HarnessError('MALFORMED_INPUT', `Unsupported phase: ${phase}`, 64);
  }
  if (identity.task === 1 && phase === 'clean-restart') {
    await runTaskOneCleanRestart({
      options,
      payload,
      repoRoot,
      ledger,
      plan,
      branch,
      liveHead,
    });
    return;
  }
  if (identity.task === 1 && phase === 'candidate') {
    const candidate = verifyCandidate(options, ledger, liveHead, plan.selectedSHA, repoRoot);
    await runTaskOneCleanRestart({
      options,
      payload,
      repoRoot,
      ledger,
      plan,
      branch,
      liveHead,
      candidate,
    });
    return;
  }

  let candidate = null;
  if (identity.task === 1 && phase === 'initial' && liveHead !== ledger.baselineSHA) {
    throw new HarnessError(
      'BASELINE_INPUT_DRIFT',
      `V1 initial phase requires HEAD=${ledger.baselineSHA}; observed ${liveHead}`,
      68,
    );
  }
  const needsCandidate =
    phase === 'candidate' ||
    options['adopt-candidate-attempt'] ||
    options['registry-child'] ||
    identity.finalGate !== null;
  if (needsCandidate) {
    candidate = verifyCandidate(options, ledger, liveHead, plan.selectedSHA, repoRoot);
  }

  let parentLifecycle = null;
  if (options['registry-child']) {
    if (identity.task === null || identity.task === 27) {
      throw new HarnessError(
        'REGISTRY_CHILD_IDENTITY_VIOLATION',
        'Registry child must identify one task from 1 through 26',
        77,
      );
    }
    parentLifecycle = verifyParentLifecycle(options, candidate, identity.task);
  } else if (
    options['parent-attempt'] ||
    options['parent-lifecycle-receipt'] ||
    options['parent-lifecycle-receipt-sha'] ||
    options['child-browser-owner']
  ) {
    throw new HarnessError(
      'REGISTRY_CHILD_IDENTITY_VIOLATION',
      'Parent lifecycle options are valid only with --registry-child',
      77,
    );
  }

  if (options['lifecycle-owner'] !== undefined && options['lifecycle-owner'] !== 'outer') {
    throw new HarnessError('LIFECYCLE_OWNERSHIP_INVALID', 'Lifecycle owner must be outer', 77);
  }
  if (
    (identity.task === 27 || identity.finalGate === 'F3' || options.browser === 'headed') &&
    options['lifecycle-owner'] !== 'outer' &&
    !options['registry-child']
  ) {
    throw new HarnessError(
      'LIFECYCLE_OWNERSHIP_INVALID',
      'DB/service/browser lifecycle requires --lifecycle-owner outer',
      77,
    );
  }

  validateDirtyScope(repoRoot, ledger, identity.task);
  if (identity.task === 1) verifyTaskOneDirty(repoRoot, ledger);
  const requestedPressureBAttempt = process.env.V1_PRESSURE_B_ATTEMPT_ID;
  if (requestedPressureBAttempt !== undefined && ![5, 11].includes(identity.task)) {
    throw new HarnessError(
      'HOST_PRESSURE_OVERRIDE_INVALID',
      'V1_PRESSURE_B_ATTEMPT_ID is valid only for Task 11 or Task 5',
      75,
    );
  }
  const attemptId =
    requestedPressureBAttempt ??
    candidate?.receipt.attemptId ??
    parentLifecycle?.receipt.attemptId ??
    randomUUID();
  const evidenceRoot = resolve(options['evidence-root'] ?? DEFAULT_EVIDENCE_ROOT);
  const command = commandIdentity(options, payload);
  const pressureBLifecycle = [5, 11].includes(identity.task)
    ? {
        attemptId,
        commandHash: command.commandHash,
        stage: identity.task === 11 ? 'V11' : 'V5',
        stateRoot: resolve(evidenceRoot, 'pressure-b-lifecycle'),
      }
    : null;
  const snapshot = options['registry-child']
    ? {
        attemptDir: dirname(parentLifecycle.path),
        sourceTreeSHA: parentLifecycle.receipt.sourceTreeSHA,
        sourceManifestPath: parentLifecycle.receipt.sourceManifestPath,
        sourceManifestSHA: parentLifecycle.receipt.sourceManifestSHA,
        temporaryIndexPath: null,
        ownedPaths: [],
        baselineSHA: ledger.baselineSHA,
        headSHA: liveHead,
        entries: [],
      }
    : createSourceSnapshot(
        repoRoot,
        ledger,
        identity.task ?? 27,
        attemptId,
        evidenceRoot,
        candidate?.receipt.candidateSHA ?? null,
      );

  if (candidate) verifyCommittedSnapshot(repoRoot, snapshot);

  const preflightBaseline = hostPreflight().preflight;
  const preflightResult = hostPreflight();
  if (!options['registry-child']) assertPortsFree(preflightResult.preflight);
  const override = verifyOverride(
    repoRoot,
    plan,
    identity.task ?? 27,
    preflightResult.failures,
    preflightResult.preflight,
    preflightBaseline,
    pressureBLifecycle,
  );
  const hostPressureOverride = override ?? {
    applied: false,
    receiptPath: null,
    receiptSHA256: null,
    observedFailures: preflightResult.failures,
  };
  if (preflightResult.failures.length > 0 && !override) {
    throw new HarnessError(
      'HOST_PREFLIGHT_BLOCKED',
      JSON.stringify({
        reason: 'HOST_RESOURCE_PRESSURE',
        failures: preflightResult.failures,
        preflight: preflightResult.preflight,
      }),
      72,
    );
  }
  if (options.db !== undefined && options.db !== 'isolated') {
    throw new HarnessError('DATABASE_BINDING_INVALID', '--db supports only isolated', 74);
  }
  if (options.db === 'isolated' && options['registry-child']) {
    throw new HarnessError(
      'REGISTRY_CHILD_LIFECYCLE_VIOLATION',
      'Registry child cannot provision a database',
      77,
    );
  }

  const lifecycle = {
    schemaVersion: 1,
    attemptId,
    task: identity.task,
    gateId: identity.gateId,
    phase,
    lifecycleOwner: options['registry-child'] ? 'parent' : (options['lifecycle-owner'] ?? 'standalone'),
    wrapperPid: process.pid,
    baseline: {
      nodeMcpCount: preflightResult.preflight.nodeMcpCount,
      browserCount: preflightResult.preflight.browserCount,
      swapUsedGB: preflightResult.preflight.swapUsedGB,
      ports: preflightResult.preflight.targetPorts,
    },
    children: [],
    ports: TARGET_PORTS,
    temporaryDatabases: [],
    temporaryIndexPath: snapshot.temporaryIndexPath,
    temporarySourceRoot: null,
    cleanup: {
      termPids: [],
      killPids: [],
      leakedPids: [],
      ownedProcessIdentities: [],
      termIdentities: [],
      killIdentities: [],
      leakedIdentities: [],
      leakedPorts: [],
      removedTemporaryDatabases: [],
    },
  };
  const lifecycleStart = {
    schemaVersion: 1,
    attemptId,
    task: identity.task,
    gateId: identity.gateId,
    lifecycleOwner: options['registry-child'] ? 'parent' : 'outer',
    baselineSHA: ledger.baselineSHA,
    candidateSHA: candidate?.receipt.candidateSHA ?? null,
    planSHA: plan.selectedSHA,
    sourceTreeSHA: snapshot.sourceTreeSHA,
    sourceManifestPath: snapshot.sourceManifestPath,
    sourceManifestSHA: snapshot.sourceManifestSHA,
    databaseName: null,
    databaseHost: null,
    databasePort: null,
    createdAt: new Date().toISOString(),
  };
  let database = null;
  let snapshotExecution = null;
  let lifecycleStartReceipt = null;
  let results = [];
  let cleanupError = null;
  let bindingError = null;
  try {
    if (!options['registry-child'] && (options.db === 'isolated' || options['snapshot-owned'])) {
      snapshotExecution = prepareSnapshotExecution(snapshot, repoRoot);
      lifecycle.temporarySourceRoot = snapshotExecution.root;
    }
    if (options.db === 'isolated') {
      database = createDatabase(identity.task ?? 27);
      lifecycle.temporaryDatabases.push({
        name: database.databaseName,
        host: database.host,
        port: database.port,
        containerId: database.containerId,
      });
      lifecycleStart.databaseName = database.databaseName;
      lifecycleStart.databaseHost = database.host;
      lifecycleStart.databasePort = database.port;
    }
    if (!options['registry-child'] && (identity.task === 27 || identity.finalGate === 'F3')) {
      lifecycleStartReceipt = immutableWrite(
        join(snapshot.attemptDir, `lifecycle-start-${identity.gateId}.json`),
        lifecycleStart,
      );
    }
    const childEnv = {
      ...process.env,
      V1_TASK_ATTEMPT_ID: attemptId,
      V1_TASK_GATE_ID: identity.gateId,
      V1_TASK_SOURCE_TREE_SHA: snapshot.sourceTreeSHA,
      V1_TASK_SOURCE_MANIFEST_PATH: snapshot.sourceManifestPath,
      V1_TASK_SOURCE_MANIFEST_SHA: snapshot.sourceManifestSHA,
      ...(candidate
        ? {
            V1_CANDIDATE_RECEIPT_PATH: candidate.path,
            V1_CANDIDATE_RECEIPT_SHA: candidate.sha256,
          }
        : {}),
      ...(lifecycleStartReceipt
        ? {
            V1_TASK_LIFECYCLE_RECEIPT_PATH: lifecycleStartReceipt.path,
            V1_TASK_LIFECYCLE_RECEIPT_SHA: lifecycleStartReceipt.sha256,
          }
        : {}),
      ...(database ? { DATABASE_URL: database.databaseUrl } : {}),
      V1_TASK_FIXTURE_PATHS: JSON.stringify(
        identity.task === null
          ? []
          : ownershipRow(ledger, identity.task).outputs.filter((ownedPath) =>
              /(?:^|\/)(?:fixtures?)(?:\/|[^/]*$)/.test(ownedPath)),
      ),
    };
    results = await runCommands(
      options,
      payload,
      repoRoot,
      childEnv,
      lifecycle,
      snapshotExecution?.root ?? repoRoot,
      options.db === 'isolated' && !options['registry-child'],
    );
  } finally {
    if (database) {
      try {
        dropDatabase(database);
        lifecycle.cleanup.removedTemporaryDatabases.push(database.databaseName);
      } catch (error) {
        cleanupError = error;
      }
    }
    if (snapshotExecution) snapshotExecution.cleanup();
    const finalPorts = Object.fromEntries(TARGET_PORTS.map((port) => [port, portOwners(port)]));
    lifecycle.cleanup.leakedPorts = TARGET_PORTS.filter(
      (port) =>
        JSON.stringify(finalPorts[port]) !==
        JSON.stringify(lifecycle.baseline.ports[port]),
    );
    const finalPreflight = hostPreflight().preflight;
    lifecycle.final = {
      processCounts: {
        nodeMcpCount: finalPreflight.nodeMcpCount,
        browserCount: finalPreflight.browserCount,
      },
      swapUsedGB: finalPreflight.swapUsedGB,
      ports: finalPorts,
      completedAt: new Date().toISOString(),
    };
  }

  if (candidate) {
    try {
      const finalHead = git(['rev-parse', 'HEAD'], { cwd: repoRoot }).trim();
      if (finalHead !== liveHead) {
        throw new HarnessError(
          'CANDIDATE_BINDING_MISMATCH',
          `Candidate HEAD changed during verification: ${liveHead} -> ${finalHead}`,
          68,
        );
      }
      verifyCommittedSnapshot(repoRoot, snapshot);
    } catch (error) {
      bindingError = error;
    }
  }
  const failedResult = results.find(({ code }) => code !== 0);
  const cleanupLeaked =
    lifecycle.cleanup.leakedPids.length > 0 ||
    lifecycle.cleanup.leakedPorts.length > 0 ||
    cleanupError !== null ||
    lifecycle.final.processCounts.nodeMcpCount >
      lifecycle.baseline.nodeMcpCount + preflightResult.preflight.limits.maximumNodeMcpIncrease ||
    lifecycle.final.processCounts.browserCount >
      lifecycle.baseline.browserCount + preflightResult.preflight.limits.maximumBrowserIncrease ||
    lifecycle.final.swapUsedGB >
      lifecycle.baseline.swapUsedGB + preflightResult.preflight.limits.maximumSwapIncreaseGB;
  let pressureBCompletion = null;
  try {
    if (override?.completePressureBLifecycle) {
      pressureBCompletion = override.completePressureBLifecycle({
        successful: !failedResult && !cleanupLeaked && !bindingError && results.length > 0,
        cleanupVerified: !cleanupLeaked,
      });
      hostPressureOverride.pressureBCompletion = pressureBCompletion;
    }
  } catch (error) {
    bindingError ??= error;
  }
  const verdict = failedResult || cleanupLeaked || bindingError ? 'rejected' : 'accepted';
  const dbLifecycle = database
    ? {
        schemaVersion: 1,
        attemptId,
        task: identity.task,
        gateId: identity.gateId,
        databaseName: database.databaseName,
        host: database.host,
        port: database.port,
        containerId: database.containerId,
        sourceTreeSHA: snapshot.sourceTreeSHA,
        sourceManifestPath: snapshot.sourceManifestPath,
        sourceManifestSHA: snapshot.sourceManifestSHA,
        migrationSnapshotApplied:
          results.find(({ kind }) => kind === 'migration-snapshot')?.code === 0,
        fixturePathsBoundToChild:
          identity.task === null
            ? []
            : ownershipRow(ledger, identity.task).outputs.filter((ownedPath) =>
                /(?:^|\/)(?:fixtures?)(?:\/|[^/]*$)/.test(ownedPath)),
        createdAt: database.createdAt,
        droppedAt: lifecycle.cleanup.removedTemporaryDatabases.includes(database.databaseName)
          ? new Date().toISOString()
          : null,
        cleanupVerified: lifecycle.cleanup.removedTemporaryDatabases.includes(database.databaseName),
        verdict: cleanupError ? 'rejected' : 'accepted',
      }
    : null;
  const dbLifecycleReceipt = dbLifecycle
    ? immutableWrite(join(snapshot.attemptDir, `db-lifecycle-${identity.gateId}.json`), dbLifecycle)
    : null;
  const receipt = {
    schemaVersion: 1,
    gateId: identity.gateId,
    phase,
    commandId: identity.gateId,
    commandHash: command.commandHash,
    attemptId,
    baselineSHA: ledger.baselineSHA,
    ...(candidate ? { candidateSHA: candidate.receipt.candidateSHA } : {}),
    sourceTreeSHA: snapshot.sourceTreeSHA,
    sourceManifestPath: snapshot.sourceManifestPath,
    sourceManifestSHA: snapshot.sourceManifestSHA,
    planSHA: plan.selectedSHA,
    ...(dbLifecycleReceipt
      ? {
          dbLifecycleReceiptPath: dbLifecycleReceipt.path,
          dbLifecycleReceiptSHA: dbLifecycleReceipt.sha256,
        }
      : {}),
    verdict,
    createdAt: new Date().toISOString(),
    branch,
    liveHead,
    command: command.commands,
    preflight: preflightResult.preflight,
    hostPressureOverride,
    candidateReceiptPath: candidate?.path ?? null,
    candidateReceiptSHA: candidate?.sha256 ?? null,
    parentLifecycleReceiptPath: parentLifecycle?.path ?? null,
    parentLifecycleReceiptSHA: parentLifecycle?.sha256 ?? null,
    lifecycle,
    payloadResults: results.map((result) => ({
      kind: result.kind,
      command: result.command,
      exitCode: result.code,
      signal: result.signal,
      output: framedPayload(result),
    })),
    cleanupError: cleanupError
      ? { code: cleanupError.code ?? 'DATABASE_CLEANUP_FAILED', message: cleanupError.message }
      : null,
    bindingError: bindingError
      ? { code: bindingError.code ?? 'CANDIDATE_BINDING_MISMATCH', message: bindingError.message }
      : null,
  };
  const receiptPath = join(snapshot.attemptDir, `${identity.gateId}.json`);
  const receiptFile = immutableWrite(receiptPath, receipt);
  const terminal = `${JSON.stringify({
    ...receipt,
    receiptPath: receiptFile.path,
    receiptSHA: receiptFile.sha256,
  })}\n`;
  if (verdict === 'accepted') {
    process.stdout.write(terminal);
    return;
  }
  process.stderr.write(terminal);
  if (cleanupLeaked) {
    process.exitCode = cleanupError?.exitCode ?? 79;
  } else if (bindingError) {
    process.exitCode = bindingError.exitCode ?? 68;
  } else {
    process.exitCode = failedResult?.code ?? 1;
  }
}

// `import.meta.url` is always the REAL path, while `process.argv[1]` is whatever the caller typed.
// Comparing them raw makes an invocation through a symlink look like an import and silently skips
// main() -- the CLI would exit 0 having done nothing, which is the worst possible failure for a
// verification harness. realpathSync on argv[1] collapses that difference. It is wrapped because
// argv[1] can name a path that no longer exists, and a guard that throws is no better than one
// that under-fires.
function isDirectCliInvocation() {
  const entry = process.argv[1];
  if (entry === undefined) return false;
  if (import.meta.url === pathToFileURL(entry).href) return true;
  try {
    return import.meta.url === pathToFileURL(realpathSync(entry)).href;
  } catch {
    return false;
  }
}

if (isDirectCliInvocation()) {
  main().catch((error) => {
    const code = error instanceof HarnessError ? error.code : 'V1_TASK_VERIFICATION_CRASH';
    process.stderr.write(`${code}: ${error.message}\n`);
    process.exitCode = error instanceof HarnessError ? error.exitCode : 70;
  });
}
