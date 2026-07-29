#!/usr/bin/env node

import { createHash, randomUUID } from 'node:crypto';
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  readSync,
  readFileSync,
  readlinkSync,
  writeFileSync,
} from 'node:fs';
import { cpus, loadavg } from 'node:os';
import { isAbsolute, parse, resolve, sep } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { descriptorRead } from './verify-team-tournament-bound-sources.mjs';

const TASK_ONE_OUTPUTS = [
  '.github/tasks/127-v1-team-tournament-operations-game-record.md',
  'scripts/qa/validate-team-tournament-ledger.mjs',
  'scripts/qa/run-v1-task-verification.mjs',
  'scripts/qa/verify-team-tournament-bound-sources.mjs',
];
const DEFAULT_LEDGER = TASK_ONE_OUTPUTS[0];
const DEFAULT_EVIDENCE_ROOT =
  '/private/tmp/teameet-ulw-evidence/teameet-team-tournament-operations-v1';
const PLAN_PATH = '.omo/plans/teameet-team-tournament-operations-v1.md';
const BEGIN = '<!-- TASK127_LEDGER_JSON_BEGIN -->';
const END = '<!-- TASK127_LEDGER_JSON_END -->';
const HOST_PRESSURE_OVERRIDE_RECEIPT_PATH = '.omo/start-work/host-pressure-override-task-1.json';
const HOST_PRESSURE_OVERRIDE_RECEIPT_SHA256 =
  '2042407ad7b8f634f118d4ee9f0154ad1503564ceeac5874c6681f458e8c16da';
const HOST_PRESSURE_OVERRIDE_SESSION_ID =
  'codex:019fa9b3-efe1-75e0-811d-d2d03b08f027';

class HarnessError extends Error {
  constructor(code, message, exitCode = 70) {
    super(message);
    this.code = code;
    this.exitCode = exitCode;
  }
}

function parseArgs(argv) {
  const separator = argv.indexOf('--');
  if (separator === -1 || separator === argv.length - 1) {
    throw new HarnessError('MALFORMED_INPUT', 'Payload command must follow --', 64);
  }
  const wrapper = argv.slice(0, separator);
  const payload = argv.slice(separator + 1);
  const options = {};
  for (let index = 0; index < wrapper.length; index += 1) {
    const token = wrapper[index];
    if (!token.startsWith('--')) {
      throw new HarnessError('MALFORMED_INPUT', `Unexpected argument: ${token}`, 64);
    }
    const value = wrapper[index + 1];
    if (!value || value.startsWith('--')) {
      throw new HarnessError('MALFORMED_INPUT', `Missing value for ${token}`, 64);
    }
    options[token.slice(2)] = value;
    index += 1;
  }
  return { options, payload };
}

function parseLedger(path) {
  const markdown = readFileSync(path, 'utf8');
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
  return JSON.parse(match[1]);
}

function git(args, options = {}) {
  const result = spawnSync('git', args, {
    cwd: options.cwd ?? process.cwd(),
    encoding: options.encoding ?? 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new HarnessError('GIT_STATE_UNAVAILABLE', result.stderr.trim(), 69);
  }
  return result.stdout;
}

function parsePorcelain(buffer) {
  const tokens = buffer.toString('utf8').split('\0').filter(Boolean);
  const records = [];
  for (let index = 0; index < tokens.length; index += 1) {
    let record = tokens[index];
    let path;
    if (record.startsWith('1 ')) {
      path = record.split(' ').slice(8).join(' ');
    } else if (record.startsWith('2 ')) {
      path = record.split(' ').slice(9).join(' ');
      record += `\0${tokens[index + 1]}`;
      index += 1;
    } else if (record.startsWith('u ')) {
      path = record.split(' ').slice(10).join(' ');
    } else if (record.startsWith('? ') || record.startsWith('! ')) {
      path = record.slice(2);
    } else {
      throw new HarnessError('DIRTY_FINGERPRINT_INVALID', `Unsupported porcelain-v2 record: ${record}`);
    }
    records.push({ path, record });
  }
  return records.sort((left, right) =>
    Buffer.compare(Buffer.from(left.path), Buffer.from(right.path)));
}

function indexState(path, repoRoot) {
  const output = git(['ls-files', '-s', '-z', '--', path], {
    cwd: repoRoot,
    encoding: null,
  });
  const entries = output.toString('utf8').split('\0').filter(Boolean).map((entry) => {
    const match = entry.match(/^(\d+) ([0-9a-f]+) (\d+)\t([\s\S]+)$/);
    if (!match) {
      throw new HarnessError('DIRTY_FINGERPRINT_INVALID', `Cannot parse index entry for ${path}`);
    }
    return {
      mode: match[1],
      blob: match[2],
      stage: Number(match[3]),
      path: match[4],
    };
  });
  return entries.length ? { state: 'present', entries } : { state: 'absent', entries: [] };
}

function worktreeState(path, repoRoot) {
  const absolutePath = resolve(repoRoot, path);
  try {
    const stat = lstatSync(absolutePath);
    const type =
      stat.isFile() ? 'regular' :
      stat.isDirectory() ? 'directory' :
      stat.isSymbolicLink() ? 'symlink' : 'other';
    let sha256 = null;
    if (type === 'regular') {
      sha256 = createHash('sha256').update(readFileSync(absolutePath)).digest('hex');
    } else if (type === 'symlink') {
      sha256 = createHash('sha256').update(Buffer.from(readlinkSync(absolutePath))).digest('hex');
    }
    return {
      state: 'present',
      type,
      mode: (stat.mode & 0o7777).toString(8).padStart(4, '0'),
      size: stat.size,
      sha256,
    };
  } catch (error) {
    if (error.code === 'ENOENT') {
      return { state: 'absent', type: 'deleted', mode: null, size: null, sha256: null };
    }
    throw error;
  }
}

function fingerprintUnrelated(repoRoot, baselineSHA) {
  const output = git(
    ['status', '--porcelain=v2', '-z', '--untracked-files=all'],
    { cwd: repoRoot, encoding: null },
  );
  const parsed = parsePorcelain(output)
    .filter(({ path }) => !TASK_ONE_OUTPUTS.includes(path));
  const unsigned = {
    schemaVersion: 1,
    baselineSHA,
    records: parsed.map(({ record }) => record),
    paths: parsed.map(({ path }) => ({
      path,
      index: indexState(path, repoRoot),
      worktree: worktreeState(path, repoRoot),
    })),
  };
  return {
    ...unsigned,
    fingerprintSHA256: createHash('sha256')
      .update(JSON.stringify(unsigned))
      .digest('hex'),
  };
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

function exact(left, right) {
  return JSON.stringify(stable(left)) === JSON.stringify(stable(right));
}

function selectedPlanSHA(path) {
  const normalized = readFileSync(path, 'utf8').replace(
    /^- \[[ x]\] (?=(?:\d+\.|F[1-4]\.))/gm,
    '- [ ] ',
  );
  return createHash('sha256').update(normalized).digest('hex');
}

function sameDescriptorIdentity(before, after) {
  return (
    before.dev === after.dev &&
    before.ino === after.ino &&
    before.mode === after.mode &&
    before.size === after.size &&
    before.mtimeNs === after.mtimeNs
  );
}

function descriptorReadHostPressureOverride(filePath) {
  const absolutePath = isAbsolute(filePath) ? filePath : resolve(filePath);
  const { root } = parse(absolutePath);
  const relativeParts = absolutePath.slice(root.length).split(sep).filter(Boolean);
  const fileName = relativeParts.at(-1);
  let fileDescriptor;

  try {
    if (!fileName) {
      throw new HarnessError('HOST_PRESSURE_OVERRIDE_INVALID', 'Override receipt must name a file', 75);
    }
    const assertPathComponents = () => {
      let currentPath = root;
      for (let index = 0; index < relativeParts.length; index += 1) {
        currentPath = resolve(currentPath, relativeParts[index]);
        const stat = lstatSync(currentPath, { bigint: true });
        if (stat.isSymbolicLink()) {
          throw new HarnessError('HOST_PRESSURE_OVERRIDE_INVALID', 'Override receipt path contains a symlink', 75);
        }
        if (index < relativeParts.length - 1 && !stat.isDirectory()) {
          throw new HarnessError('HOST_PRESSURE_OVERRIDE_INVALID', 'Override receipt parent is not a directory', 75);
        }
      }
    };
    assertPathComponents();
    fileDescriptor = openSync(absolutePath, constants.O_RDONLY | constants.O_NOFOLLOW);
    const before = fstatSync(fileDescriptor, { bigint: true });
    const expectedUid = typeof process.getuid === 'function' ? BigInt(process.getuid()) : null;
    if (!before.isFile() || (before.mode & 0o777n) !== 0o444n || before.uid !== expectedUid) {
      throw new HarnessError(
        'HOST_PRESSURE_OVERRIDE_INVALID',
        'Override receipt must be a current-user-owned regular mode 0444 file',
        75,
      );
    }

    const chunks = [];
    const buffer = Buffer.allocUnsafe(64 * 1024);
    let bytesRead = 0;
    let offset = 0;
    do {
      bytesRead = readSync(fileDescriptor, buffer, 0, buffer.length, offset);
      if (bytesRead > 0) {
        chunks.push(Buffer.from(buffer.subarray(0, bytesRead)));
        offset += bytesRead;
      }
    } while (bytesRead > 0);

    const after = fstatSync(fileDescriptor, { bigint: true });
    assertPathComponents();
    const pathStat = lstatSync(absolutePath, { bigint: true });
    if (
      !sameDescriptorIdentity(before, after) ||
      pathStat.dev !== before.dev ||
      pathStat.ino !== before.ino ||
      !pathStat.isFile() ||
      BigInt(offset) !== before.size
    ) {
      throw new HarnessError(
        'HOST_PRESSURE_OVERRIDE_INVALID',
        'Override receipt changed during descriptor read',
        75,
      );
    }
    const bytes = Buffer.concat(chunks);
    return {
      path: absolutePath,
      bytes,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    };
  } catch (error) {
    if (error instanceof HarnessError) throw error;
    throw new HarnessError('HOST_PRESSURE_OVERRIDE_INVALID', `${absolutePath}: ${error.message}`, 75);
  } finally {
    if (fileDescriptor !== undefined) closeSync(fileDescriptor);
  }
}

function verifyHostPressureOverride(repoRoot, planSHA) {
  const receiptPath = process.env.V1_HOST_PRESSURE_OVERRIDE_RECEIPT;
  if (!receiptPath) return null;
  const expectedPath = resolve(repoRoot, HOST_PRESSURE_OVERRIDE_RECEIPT_PATH);
  const suppliedPath = resolve(receiptPath);
  if (suppliedPath !== expectedPath) {
    throw new HarnessError(
      'HOST_PRESSURE_OVERRIDE_INVALID',
      `Override receipt path must be ${HOST_PRESSURE_OVERRIDE_RECEIPT_PATH}`,
      75,
    );
  }
  if (process.env.V1_VERIFICATION_SESSION_ID !== HOST_PRESSURE_OVERRIDE_SESSION_ID) {
    throw new HarnessError('HOST_PRESSURE_OVERRIDE_INVALID', 'Override session binding does not match', 75);
  }

  const descriptor = descriptorReadHostPressureOverride(suppliedPath);
  if (descriptor.sha256 !== HOST_PRESSURE_OVERRIDE_RECEIPT_SHA256) {
    throw new HarnessError('HOST_PRESSURE_OVERRIDE_INVALID', 'Override receipt SHA-256 does not match', 75);
  }
  let receipt;
  try {
    receipt = JSON.parse(descriptor.bytes.toString('utf8'));
  } catch (error) {
    throw new HarnessError('HOST_PRESSURE_OVERRIDE_INVALID', `Override receipt JSON is invalid: ${error.message}`, 75);
  }
  if (
    receipt.schemaVersion !== 1 ||
    receipt.plan !== PLAN_PATH ||
    receipt.planSHA256 !== planSHA ||
    receipt.task !== 1 ||
    receipt.sessionId !== process.env.V1_VERIFICATION_SESSION_ID ||
    receipt.authorizationSource !== 'user-message' ||
    receipt.scope !== 'host-preflight-only'
  ) {
    throw new HarnessError('HOST_PRESSURE_OVERRIDE_INVALID', 'Override receipt fields do not match Task 1', 75);
  }
  return { path: suppliedPath, sha256: descriptor.sha256 };
}

function verifyCandidate(options, ledger, repoRoot, liveHead) {
  const receiptPath = options['candidate-receipt'] ?? process.env.V1_CANDIDATE_RECEIPT_PATH;
  const receiptSHA = options['candidate-receipt-sha'] ?? process.env.V1_CANDIDATE_RECEIPT_SHA;
  if (!receiptPath || !receiptSHA) {
    throw new HarnessError(
      'CANDIDATE_BINDING_MISMATCH',
      'candidate phase requires an immutable candidate receipt path and SHA',
      68,
    );
  }
  const descriptor = descriptorRead(receiptPath);
  if (descriptor.sha256 !== receiptSHA) {
    throw new HarnessError('CANDIDATE_BINDING_MISMATCH', 'candidate receipt SHA mismatch', 68);
  }
  const receipt = JSON.parse(descriptor.bytes.toString('utf8'));
  if (
    receipt.baselineSHA !== ledger.baselineSHA ||
    receipt.candidateSHA !== liveHead ||
    receipt.planSHA !== options['plan-sha']
  ) {
    throw new HarnessError(
      'CANDIDATE_BINDING_MISMATCH',
      `candidate receipt binding does not match baseline, live HEAD, and plan`,
      68,
    );
  }
  return { path: receiptPath, sha256: receiptSHA, receipt };
}

function commandOutput(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  return {
    status: result.status,
    stdout: (result.stdout ?? '').trim(),
    stderr: (result.stderr ?? '').trim(),
  };
}

function hostPreflight() {
  const processListing = commandOutput('ps', ['-axo', 'command=']);
  const processList = processListing.stdout.split('\n');
  const nodeMcpCount = processList.filter((line) => /node|mcp/i.test(line)).length;
  const browserCount = processList.filter((line) => /Chrom(e|ium)|Playwright|WebKit/i.test(line)).length;
  const swap = commandOutput('sysctl', ['vm.swapusage']);
  const swapMatch = swap.stdout.match(/total = ([0-9.]+)([MG]).*used = ([0-9.]+)([MG])/);
  const swapTotalGB = swapMatch
    ? Number(swapMatch[1]) * (swapMatch[2] === 'M' ? 1 / 1024 : 1)
    : null;
  const swapUsedGB = swapMatch
    ? Number(swapMatch[3]) * (swapMatch[4] === 'M' ? 1 / 1024 : 1)
    : null;
  const swapUsageRatio = swapTotalGB && swapUsedGB !== null ? swapUsedGB / swapTotalGB : null;
  const memory = commandOutput('memory_pressure', ['-Q']);
  const memoryMatch = memory.stdout.match(/System-wide memory free percentage: (\d+)%/);
  const memoryFreePercent = memoryMatch ? Number(memoryMatch[1]) : null;
  const docker = commandOutput('docker', ['info', '--format', '{{.ServerVersion}}']);
  const logicalCores = cpus().length;
  const limits = {
    maximumLoadAverage: logicalCores * 1.5,
    maximumSwapUsageRatio: 0.5,
    minimumMemoryFreePercent: 10,
    maximumNodeMcpCount: logicalCores * 20,
    maximumBrowserCount: logicalCores * 10,
  };
  const preflight = {
    logicalCores,
    loadAverage: loadavg(),
    swapTotalGB,
    swapUsedGB,
    swapUsageRatio,
    memoryFreePercent,
    nodeMcpCount,
    browserCount,
    docker: docker.status === 0 ? { state: 'available', version: docker.stdout } : { state: 'unavailable' },
    limits,
  };
  const failures = [];
  if (processListing.status !== 0) failures.push('PROCESS_INSPECTION_UNAVAILABLE');
  if (preflight.loadAverage[0] > limits.maximumLoadAverage) failures.push('LOAD_PER_CORE_PRESSURE');
  if (swap.status !== 0 || swapUsageRatio === null) failures.push('SWAP_METRICS_UNAVAILABLE');
  else if (swapUsageRatio >= limits.maximumSwapUsageRatio) failures.push('SWAP_USAGE_RATIO_PRESSURE');
  if (memory.status !== 0 || memoryFreePercent === null) failures.push('MEMORY_METRICS_UNAVAILABLE');
  else if (memoryFreePercent <= limits.minimumMemoryFreePercent) failures.push('MEMORY_FREE_PERCENT_PRESSURE');
  if (nodeMcpCount > limits.maximumNodeMcpCount) failures.push('NODE_MCP_PROCESS_PROLIFERATION');
  if (browserCount > limits.maximumBrowserCount) failures.push('BROWSER_PROCESS_PROLIFERATION');
  return { failures, preflight };
}

async function runPayload(payload, repoRoot, lifecycle) {
  const child = spawn(payload[0], payload.slice(1), {
    cwd: repoRoot,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  lifecycle.children.push({
    pid: child.pid,
    ppid: process.pid,
    command: payload,
    ports: [],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => {
    stdout += chunk;
  });
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });
  const status = await new Promise((resolveStatus, reject) => {
    child.once('error', reject);
    child.once('close', (code, signal) => resolveStatus({ code, signal }));
  });
  lifecycle.children[0].exitCode = status.code;
  lifecycle.children[0].signal = status.signal;
  return { ...status, stdout, stderr };
}

function framedPayload(result) {
  const accepted = result.code === 0;
  return {
    disposition: accepted ? 'accepted' : 'rejected',
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

async function main() {
  const { options, payload } = parseArgs(process.argv.slice(2));
  const repoRoot = process.cwd();
  if (options.task !== '1') {
    throw new HarnessError('TASK_NOT_IMPLEMENTED', 'This bootstrap harness currently accepts Task 1 only', 64);
  }
  const phase = options.phase ?? 'initial';
  if (!['initial', 'candidate'].includes(phase)) {
    throw new HarnessError('MALFORMED_INPUT', `Unsupported phase: ${phase}`, 64);
  }
  const planSHA = selectedPlanSHA(resolve(repoRoot, PLAN_PATH));
  if (!options['plan-sha'] || options['plan-sha'] !== planSHA) {
    throw new HarnessError('PLAN_DIGEST_MISMATCH', 'Selected plan SHA does not match the live plan', 65);
  }

  const ledgerPath = resolve(repoRoot, options.ledger ?? DEFAULT_LEDGER);
  const ledger = parseLedger(ledgerPath);
  const branch = git(['branch', '--show-current'], { cwd: repoRoot }).trim();
  const liveHead = git(['rev-parse', 'HEAD'], { cwd: repoRoot }).trim();
  if (branch !== 'dev') {
    throw new HarnessError('BASELINE_INPUT_DRIFT', `Expected dev branch, observed ${branch}`, 68);
  }
  let candidate = null;
  if (phase === 'initial' && liveHead !== ledger.baselineSHA) {
    throw new HarnessError(
      'BASELINE_INPUT_DRIFT',
      `Initial phase requires HEAD=${ledger.baselineSHA}; observed ${liveHead}`,
      68,
    );
  }
  if (phase === 'candidate') {
    candidate = verifyCandidate(options, ledger, repoRoot, liveHead);
  }

  const observedDirty = fingerprintUnrelated(repoRoot, ledger.baselineSHA);
  if (!exact(observedDirty, ledger.unrelatedDirty)) {
    throw new HarnessError(
      'UNRELATED_DIRTY_FINGERPRINT_DRIFT',
      `Unrelated dirty fingerprint changed: expected ${ledger.unrelatedDirty.fingerprintSHA256}, observed ${observedDirty.fingerprintSHA256}`,
      68,
    );
  }

  const attemptId = randomUUID();
  const evidenceDir = resolve(
    options['evidence-root'] ?? DEFAULT_EVIDENCE_ROOT,
    'task-1',
  );
  const evidencePath = resolve(
    evidenceDir,
    'task-1-teameet-team-tournament-operations-v1.txt',
  );
  mkdirSync(evidenceDir, { recursive: true });
  const lifecycle = {
    schemaVersion: 1,
    attemptId,
    phase,
    task: 1,
    wrapperPid: process.pid,
    children: [],
    ports: [],
    temporaryDatabases: [],
  };
  const hostPreflightResult = hostPreflight();
  const override = verifyHostPressureOverride(repoRoot, planSHA);
  const hostPressureOverride = {
    applied: hostPreflightResult.failures.length > 0 && override !== null,
    receiptPath: override?.path ?? null,
    receiptSHA256: override?.sha256 ?? null,
    observedFailures: hostPreflightResult.failures,
  };
  if (hostPreflightResult.failures.length > 0 && override === null) {
    throw new HarnessError(
      'HOST_PREFLIGHT_BLOCKED',
      JSON.stringify({
        reason: 'HOST_RESOURCE_PRESSURE',
        failures: hostPreflightResult.failures,
        preflight: hostPreflightResult.preflight,
      }),
      72,
    );
  }
  const result = await runPayload(payload, repoRoot, lifecycle);
  lifecycle.cleanup = {
    childExited: result.code !== null,
    leakedPids: [],
    leakedPorts: [],
    removedTemporaryDatabases: [],
  };

  const receipt = {
    code: result.code === 0 ? 'V1_TASK_VERIFICATION_OK' : 'V1_TASK_VERIFICATION_FAILED',
    attemptId,
    task: 1,
    phase,
    baselineSHA: ledger.baselineSHA,
    candidateSHA: candidate?.receipt.candidateSHA ?? null,
    planSHA,
    command: payload,
    commandHash: createHash('sha256').update(JSON.stringify(payload)).digest('hex'),
    sourceHashes: ledger.sources,
    dirtyFingerprintSHA256: ledger.unrelatedDirty.fingerprintSHA256,
    preflight: hostPreflightResult.preflight,
    hostPressureOverride,
    lifecycle,
    payloadExitCode: result.code,
    payloadOutput: framedPayload(result),
  };
  writeFileSync(evidencePath, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o644 });
  const terminalReceipt = `${JSON.stringify({ ...receipt, evidencePath })}\n`;
  if (result.code === 0) {
    process.stdout.write(terminalReceipt);
  } else {
    process.stderr.write(terminalReceipt);
    process.exitCode = result.code ?? 1;
  }
}

main().catch((error) => {
  const code = error instanceof HarnessError ? error.code : 'V1_TASK_VERIFICATION_CRASH';
  process.stderr.write(`${code}: ${error.message}\n`);
  process.exitCode = error instanceof HarnessError ? error.exitCode : 70;
});
