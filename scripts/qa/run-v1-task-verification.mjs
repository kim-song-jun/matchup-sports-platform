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
  rmSync,
  symlinkSync,
  writeSync,
} from 'node:fs';
import { cpus, loadavg, tmpdir } from 'node:os';
import { dirname, isAbsolute, join, parse, resolve, sep } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { descriptorRead } from './verify-team-tournament-bound-sources.mjs';

const DEFAULT_LEDGER = '.github/tasks/127-v1-team-tournament-operations-game-record.md';
const DEFAULT_EVIDENCE_ROOT =
  '/private/tmp/teameet-ulw-evidence/teameet-team-tournament-operations-v1';
const PLAN_PATH = '.omo/plans/teameet-team-tournament-operations-v1.md';
const SCRIPT_PATH = 'scripts/qa/run-v1-task-verification.mjs';
const BEGIN = '<!-- TASK127_LEDGER_JSON_BEGIN -->';
const END = '<!-- TASK127_LEDGER_JSON_END -->';
const OVERRIDE_PATH = '.omo/start-work/host-pressure-override-plan.json';
const OVERRIDE_SHA256 =
  '2c04e6621fccb1017838c6b479ac8addabba9061852654cec4c893ed588631c2';
const HISTORICAL_TASK_ONE_OVERRIDE_PATH =
  '.omo/start-work/host-pressure-override-task-1.json';
const HISTORICAL_TASK_ONE_OVERRIDE_SHA256 =
  '2042407ad7b8f634f118d4ee9f0154ad1503564ceeac5874c6681f458e8c16da';
const VERIFICATION_SESSION_ID =
  'codex:019fa9b3-efe1-75e0-811d-d2d03b08f027';
const BOOLEAN_OPTIONS = new Set([
  'adopt-candidate-attempt',
  'child-browser-owner',
  'registry-child',
  'snapshot-owned',
]);
const VALUE_OPTIONS = new Set([
  'browser',
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
  'root-prepare',
  'task',
]);
const TARGET_PORTS = [3013, 8121];

class HarnessError extends Error {
  constructor(code, message, exitCode = 70) {
    super(message);
    this.code = code;
    this.exitCode = exitCode;
  }
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

function canonicalBytes(value) {
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
  if (payload.length === 0 && !options.sequence) {
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

function parseLedger(filePath) {
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

function git(args, { cwd = process.cwd(), encoding = 'utf8', env = process.env } = {}) {
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

function readPlan(repoRoot) {
  const bytes = readFileSync(resolve(repoRoot, PLAN_PATH));
  const rawSHA = sha256(bytes);
  const normalized = bytes.toString('utf8').replace(
    /^- \[[ x]\] (?=(?:\d+\.|F[1-4]\.))/gm,
    '- [ ] ',
  );
  return { rawSHA, normalizedSHA: sha256(normalized) };
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

function secureImmutableDescriptor(filePath, expectedSHA, code, exitCode = 68) {
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
    (stat.mode & 0o777) !== 0o444 ||
    stat.uid !== expectedUid
  ) {
    throw new HarnessError(
      code,
      `${absolutePath}: receipt must be current-user-owned, regular, non-symlink, and mode 0444`,
      exitCode,
    );
  }
  let descriptor;
  try {
    descriptor = descriptorRead(absolutePath);
  } catch (error) {
    throw new HarnessError(code, `${absolutePath}: ${error.message}`, exitCode);
  }
  if (!/^[0-9a-f]{64}$/.test(expectedSHA ?? '') || descriptor.sha256 !== expectedSHA) {
    throw new HarnessError(code, `${absolutePath}: receipt SHA-256 mismatch`, exitCode);
  }
  let receipt;
  try {
    receipt = JSON.parse(descriptor.bytes.toString('utf8'));
  } catch (error) {
    throw new HarnessError(code, `${absolutePath}: invalid receipt JSON: ${error.message}`, exitCode);
  }
  return { path: absolutePath, sha256: descriptor.sha256, receipt };
}

function verifyOverride(repoRoot, plan, task, failures) {
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
  const absoluteSupplied = resolve(supplied);
  const historical = task === 1 && absoluteSupplied === historicalPath;
  if (absoluteSupplied !== canonicalPath && !historical) {
    throw new HarnessError(
      'HOST_PRESSURE_OVERRIDE_INVALID',
      `Override receipt path must be ${OVERRIDE_PATH}`,
      75,
    );
  }
  const expectedSHA = historical ? HISTORICAL_TASK_ONE_OVERRIDE_SHA256 : OVERRIDE_SHA256;
  const descriptor = secureImmutableDescriptor(
    absoluteSupplied,
    expectedSHA,
    'HOST_PRESSURE_OVERRIDE_INVALID',
    75,
  );
  const receipt = descriptor.receipt;
  const allowed =
    historical ? receipt.task === 1 : Array.isArray(receipt.allowedTasks) &&
      receipt.allowedTasks.includes(task);
  if (
    receipt.schemaVersion !== 1 ||
    receipt.plan !== PLAN_PATH ||
    ![plan.rawSHA, plan.normalizedSHA].includes(receipt.planSHA256) ||
    receipt.sessionId !== VERIFICATION_SESSION_ID ||
    receipt.authorizationSource !== 'user-message' ||
    !['host-preflight-only', 'plan-host-preflight-only'].includes(receipt.scope) ||
    !allowed
  ) {
    throw new HarnessError(
      'HOST_PRESSURE_OVERRIDE_INVALID',
      'Override receipt fields do not bind this plan, session, scope, and task',
      75,
    );
  }
  return {
    applied: failures.length > 0,
    receiptPath: descriptor.path,
    receiptSHA256: descriptor.sha256,
    observedFailures: failures,
  };
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

function ownershipRow(ledger, task) {
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

function verifyTaskOneDirty(repoRoot, ledger) {
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

function immutableWrite(filePath, value) {
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

function immutableWriteOrReuse(filePath, value) {
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

function sourceEntries(repoRoot, sourceTreeSHA, ownedPaths) {
  const output = git(
    ['ls-tree', '-r', '-z', sourceTreeSHA, '--', ...ownedPaths],
    { cwd: repoRoot, encoding: null },
  );
  return output.toString('utf8').split('\0').filter(Boolean).map((line) => {
    const match = line.match(/^(\d+) (blob|commit) ([0-9a-f]+)\t([\s\S]+)$/);
    if (!match) {
      throw new HarnessError('SOURCE_MANIFEST_INVALID', `Cannot parse tree entry: ${line}`, 68);
    }
    const bytes = git(['cat-file', match[2], match[3]], { cwd: repoRoot, encoding: null });
    return {
      path: match[4],
      mode: match[1],
      type: match[2],
      blob: match[3],
      sha256: sha256(bytes),
      size: bytes.length,
    };
  }).sort((left, right) => Buffer.compare(Buffer.from(left.path), Buffer.from(right.path)));
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
    const attemptDir = resolve(
      evidenceRoot,
      candidateSHA ? 'commit-sha256' : 'tree-sha256',
      candidateSHA ?? privateIndex.sourceTreeSHA,
      `attempt-${attemptId}`,
    );
    mkdirSync(attemptDir, { recursive: true });
    const entries = sourceEntries(repoRoot, privateIndex.sourceTreeSHA, ownedPaths);
    const manifest = {
      schemaVersion: 1,
      attemptId,
      task,
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
      entries,
    };
  } finally {
    privateIndex.cleanup();
  }
}

function verifyCommittedSnapshot(repoRoot, snapshot) {
  for (const entry of snapshot.entries) {
    const committed = git(['ls-tree', 'HEAD', '--', entry.path], { cwd: repoRoot }).trim();
    const match = committed.match(/^(\d+) (blob|commit) ([0-9a-f]+)\t/);
    if (!match || match[1] !== entry.mode || match[3] !== entry.blob) {
      throw new HarnessError(
        'SOURCE_SNAPSHOT_COMMIT_DRIFT',
        `Committed blob/mode drift for ${entry.path}`,
        68,
      );
    }
  }
}

function verifyCandidate(options, ledger, liveHead, planSHA) {
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
  if (
    receipt.schemaVersion !== 1 ||
    receipt.baselineSHA !== ledger.baselineSHA ||
    receipt.candidateSHA !== liveHead ||
    receipt.planSHA !== planSHA ||
    !/^[0-9a-f]{40}$/.test(receipt.candidateSHA ?? '') ||
    typeof receipt.attemptId !== 'string'
  ) {
    throw new HarnessError(
      'CANDIDATE_BINDING_MISMATCH',
      'Candidate receipt does not bind baseline, live HEAD, plan, and attempt',
      68,
    );
  }
  return descriptor;
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
  const result = commandOutput('ps', ['-axo', 'pid=,ppid=,pgid=,command=']);
  if (result.status !== 0) {
    throw new HarnessError('PROCESS_INSPECTION_UNAVAILABLE', 'Could not inspect child processes');
  }
  return result.stdout.split('\n').filter(Boolean).map((line) => {
    const match = line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+([\s\S]*)$/);
    return match
      ? { pid: Number(match[1]), ppid: Number(match[2]), pgid: Number(match[3]), command: match[4] }
      : null;
  }).filter(Boolean);
}

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error.code === 'ESRCH') return false;
    throw error;
  }
}

async function cleanupProcessGroup(groupId, lifecycle) {
  const owned = processTable().filter(({ pgid, pid }) => pgid === groupId && pid !== process.pid);
  for (const processEntry of owned) {
    if (alive(processEntry.pid)) process.kill(processEntry.pid, 'SIGTERM');
  }
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline && owned.some(({ pid }) => alive(pid))) {
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 50));
  }
  const killed = [];
  for (const processEntry of owned) {
    if (alive(processEntry.pid)) {
      process.kill(processEntry.pid, 'SIGKILL');
      killed.push(processEntry.pid);
    }
  }
  lifecycle.cleanup.termPids.push(...owned.map(({ pid }) => pid));
  lifecycle.cleanup.killPids.push(...killed);
  lifecycle.cleanup.leakedPids.push(...owned.filter(({ pid }) => alive(pid)).map(({ pid }) => pid));
}

async function runChild(command, args, { cwd, env, lifecycle, ports = [] }) {
  const child = spawn(command, args, {
    cwd,
    env,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const childRecord = {
    pid: child.pid,
    ppid: process.pid,
    command: [command, ...args],
    ports,
    startedAt: new Date().toISOString(),
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
  const status = await new Promise((resolveStatus, reject) => {
    child.once('error', reject);
    child.once('close', (code, signal) => resolveStatus({ code, signal }));
  });
  childRecord.exitCode = status.code;
  childRecord.signal = status.signal;
  childRecord.finishedAt = new Date().toISOString();
  await cleanupProcessGroup(child.pid, lifecycle);
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

function prepareSnapshotExecution(snapshot, repoRoot) {
  const temporaryDirectory = mkdtempSync(join(tmpdir(), 'teameet-v1-source-'));
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
  for (const relativePath of ['node_modules', 'apps/v1_api/node_modules', 'apps/v1_web/node_modules']) {
    const source = resolve(repoRoot, relativePath);
    const target = resolve(extractedRoot, relativePath);
    if (existsSync(source) && !existsSync(target)) {
      mkdirSync(dirname(target), { recursive: true });
      symlinkSync(source, target, 'dir');
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

async function main() {
  const { options, payload } = parseArgs(process.argv.slice(2));
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
  if (!['initial', 'standalone', 'candidate', 'local-precleanup'].includes(phase)) {
    throw new HarnessError('MALFORMED_INPUT', `Unsupported phase: ${phase}`, 64);
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
    candidate = verifyCandidate(options, ledger, liveHead, plan.selectedSHA);
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
  const attemptId =
    candidate?.receipt.attemptId ??
    parentLifecycle?.receipt.attemptId ??
    randomUUID();
  const evidenceRoot = resolve(options['evidence-root'] ?? DEFAULT_EVIDENCE_ROOT);
  const snapshot = options['registry-child']
    ? {
        attemptDir: dirname(parentLifecycle.path),
        sourceTreeSHA: parentLifecycle.receipt.sourceTreeSHA,
        sourceManifestPath: parentLifecycle.receipt.sourceManifestPath,
        sourceManifestSHA: parentLifecycle.receipt.sourceManifestSHA,
        temporaryIndexPath: null,
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

  const preflightResult = hostPreflight();
  if (!options['registry-child']) assertPortsFree(preflightResult.preflight);
  const override = verifyOverride(repoRoot, plan, identity.task ?? 27, preflightResult.failures);
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
      leakedPorts: [],
      removedTemporaryDatabases: [],
    },
  };
  const command = commandIdentity(options, payload);
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

main().catch((error) => {
  const code = error instanceof HarnessError ? error.code : 'V1_TASK_VERIFICATION_CRASH';
  process.stderr.write(`${code}: ${error.message}\n`);
  process.exitCode = error instanceof HarnessError ? error.exitCode : 70;
});
