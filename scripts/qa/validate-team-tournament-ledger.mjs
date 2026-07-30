#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { lstatSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  descriptorRead,
  verifyBoundSources,
} from './verify-team-tournament-bound-sources.mjs';

const TASK_ONE_OUTPUTS = [
  '.github/tasks/127-v1-team-tournament-operations-game-record.md',
  'scripts/qa/validate-team-tournament-ledger.mjs',
  'scripts/qa/run-v1-task-verification.mjs',
  'scripts/qa/run-v1-task-verification.contract.test.mjs',
  'scripts/qa/verify-team-tournament-bound-sources.mjs',
  'deploy/Dockerfile.v1-verification',
];
const EXPECTED_OWNED_PATH_BASELINE_STATE = Object.fromEntries(
  TASK_ONE_OUTPUTS.map((path) => [path, 'absent']),
);
const EXPECTED_FORBIDDEN = [
  '.env*',
  'apps/api/**',
  'apps/web/**',
  'docs/reference/handoff-sm-new-direction/sports-platform/project/Teameet Design.html',
  'unrelatedDirty.paths[*]',
  'every ownership output not listed in the active todo row',
];
const EXPECTED_BASELINE_SHA = '71f67b0d24e272eecd216cebb31eefbd66c9ca02';
const EXPECTED_DIRTY_FINGERPRINT_SHA256 =
  '02f9e070b8a68419ff620af3943bfc638a8ab4a896c24d977384beacb77b81c7';
const EXPECTED_SCREEN_IDS = [
  'T-01', 'T-02', 'T-03', 'T-04', 'T-05', 'T-06', 'T-07', 'T-08', 'T-09',
  'A-01', 'A-02', 'A-03', 'A-04', 'A-05',
  'P-01', 'P-02', 'P-03', 'P-04',
];
const PLAN_PATH = '.omo/plans/teameet-team-tournament-operations-v1.md';
const BEGIN = '<!-- TASK127_LEDGER_JSON_BEGIN -->';
const END = '<!-- TASK127_LEDGER_JSON_END -->';
const BOOLEAN_OPTIONS = new Set([
  'verify-clean-restart-cursor-chain',
  'verify-rollback-clean-state',
  'verify-source-manifest',
]);

class LedgerError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function parseArgs(argv) {
  const [ledgerPath, ...rest] = argv;
  if (!ledgerPath || ledgerPath.startsWith('--')) {
    throw new LedgerError('MALFORMED_INPUT', 'Ledger path is required');
  }
  const options = Object.fromEntries(
    [...BOOLEAN_OPTIONS].map((name) => [name, false]),
  );
  options.ledgerPath = ledgerPath;
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    const name = token.slice(2);
    if (token.startsWith('--') && BOOLEAN_OPTIONS.has(name)) {
      if (options[name] === true) {
        throw new LedgerError('MALFORMED_INPUT', `Duplicate option: ${token}`);
      }
      options[name] = true;
      continue;
    }
    if (!token.startsWith('--')) {
      throw new LedgerError('MALFORMED_INPUT', `Unexpected argument: ${token}`);
    }
    const value = rest[index + 1];
    if (!value || value.startsWith('--')) {
      throw new LedgerError('MALFORMED_INPUT', `Missing value for ${token}`);
    }
    if (Object.hasOwn(options, name) && options[name] !== false) {
      throw new LedgerError('MALFORMED_INPUT', `Duplicate option: ${token}`);
    }
    options[name] = value;
    index += 1;
  }
  return options;
}

function parseLedger(path) {
  const markdown = readFileSync(path, 'utf8');
  const start = markdown.indexOf(BEGIN);
  const end = markdown.indexOf(END);
  if (start === -1 || end === -1 || end <= start) {
    throw new LedgerError('LEDGER_FORMAT_INVALID', 'Canonical ledger JSON markers are missing');
  }
  const fenced = markdown.slice(start + BEGIN.length, end).trim();
  const match = fenced.match(/^```json\n([\s\S]+)\n```$/);
  if (!match) {
    throw new LedgerError('LEDGER_FORMAT_INVALID', 'Canonical ledger JSON fence is malformed');
  }
  try {
    return JSON.parse(match[1]);
  } catch (error) {
    throw new LedgerError('LEDGER_FORMAT_INVALID', `Canonical ledger JSON is invalid: ${error.message}`);
  }
}

function splitTableCells(line) {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());
}

function splitPaths(cell) {
  return [...cell.matchAll(/`([^`]+)`/g)].map((match) => match[1]);
}

function parseOwnershipFromPlan(planText) {
  const section = planText.match(
    /### Baseline-bound ownership and commit manifest[\s\S]+?\n\| Todo \| Baseline read-only inputs \| Owned output\/commit pathspec \|\n\|[-|]+\|\n([\s\S]+?)\n\n## Todos/,
  );
  if (!section) {
    throw new LedgerError('LEDGER_OWNERSHIP_DRIFT', 'Ownership table is missing from the selected plan');
  }
  return section[1]
    .split('\n')
    .filter((line) => /^\|\s*\d+\s*\|/.test(line))
    .map((line) => {
      const [todo, inputCell, outputCell] = splitTableCells(line);
      return {
        todo: Number(todo),
        inputs: inputCell,
        outputs: splitPaths(outputCell),
      };
    });
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

function equal(left, right) {
  return JSON.stringify(stable(left)) === JSON.stringify(stable(right));
}

function assert(condition, code, message) {
  if (!condition) throw new LedgerError(code, message);
}

function receiptFromEnvironment(pathName, shaName, code) {
  const path = process.env[pathName];
  const expectedSHA = process.env[shaName];
  assert(path && /^[0-9a-f]{64}$/.test(expectedSHA ?? ''), code, `${pathName}/${shaName} pair is required`);
  const stat = lstatSync(path);
  assert(
    stat.isFile() && !stat.isSymbolicLink() && (stat.mode & 0o777) === 0o444,
    code,
    `${pathName} must name an immutable regular file`,
  );
  const descriptor = descriptorRead(path);
  assert(descriptor.sha256 === expectedSHA, code, `${pathName} digest mismatch`);
  let receipt;
  try {
    receipt = JSON.parse(descriptor.bytes.toString('utf8'));
  } catch (error) {
    throw new LedgerError(code, `${pathName} is not valid JSON: ${error.message}`);
  }
  const canonical = JSON.stringify(stable(receipt));
  const observed = descriptor.bytes.toString('utf8');
  assert(
    observed === canonical || observed === `${canonical}\n`,
    code,
    `${pathName} has duplicate keys, trailing data, or noncanonical bytes`,
  );
  return { path, sha256: expectedSHA, receipt };
}

function validateCleanRestartAuthority(ledger, options) {
  if (
    !options['verify-clean-restart-cursor-chain'] &&
    !options['verify-rollback-clean-state']
  ) {
    return null;
  }
  const approval = receiptFromEnvironment(
    'OMO_REVIEW_RECEIPT_PATH',
    'OMO_REVIEW_RECEIPT_SHA',
    'V0_EXECUTION_CHAIN_INVALID',
  );
  const cursor = receiptFromEnvironment(
    'V1_TASK127_CURSOR_RECEIPT_PATH',
    'V1_TASK127_CURSOR_RECEIPT_SHA',
    'V0_EXECUTION_CHAIN_INVALID',
  );
  const override = receiptFromEnvironment(
    'V1_HOST_PRESSURE_OVERRIDE_RECEIPT_PATH',
    'V1_HOST_PRESSURE_OVERRIDE_RECEIPT_SHA',
    'V0_EXECUTION_CHAIN_INVALID',
  );
  const consumption = receiptFromEnvironment(
    'V1_V0_CONSUMPTION_RECEIPT_PATH',
    'V1_V0_CONSUMPTION_RECEIPT_SHA',
    'V0_EXECUTION_CHAIN_INVALID',
  );
  const rollback = receiptFromEnvironment(
    'V1_ROLLBACK_RECEIPT_PATH',
    'V1_ROLLBACK_RECEIPT_SHA',
    'V0_EXECUTION_CHAIN_INVALID',
  );
  const host = receiptFromEnvironment(
    'V1_HOST_SUPERVISOR_RECEIPT_PATH',
    'V1_HOST_SUPERVISOR_RECEIPT_SHA',
    'HOST_SUPERVISOR_RECEIPT_INVALID',
  );
  assert(
    approval.receipt.verdict === 'APPROVED' &&
      approval.receipt.planSha256 === ledger.planSHA &&
      cursor.receipt.mode === 'clean-restart-initial' &&
      cursor.receipt.planSHA256 === ledger.planSHA &&
      cursor.receipt.restartHeadSHA ===
        'a4823d2f575d9396323421024a81a63dacf0cf67' &&
      cursor.receipt.unrelatedDirtyFingerprintAfter ===
        '65051bf57a83e1bf287a654fdb121e7361bd9136e673bac0a9a149ecf11c4923' &&
      override.receipt.taskId === 1 &&
      override.receipt.scope === 'stable-absolute-swap-and-node-mcp-count-only' &&
      consumption.receipt.verdict === 'CONSUMED' &&
      consumption.receipt.singleUse === true &&
      consumption.receipt.cursorReceipt.sha256 === cursor.sha256 &&
      consumption.receipt.overrideReceipt.sha256 === override.sha256 &&
      rollback.receipt.schemaVersion === 1 &&
      host.receipt.verdict === 'APPROVE' &&
      host.receipt.planSHA === ledger.planSHA &&
      host.receipt.consumptionReceipt.sha256 === consumption.sha256 &&
      Object.values(host.receipt.cleanup).every((value) => value === 0),
    'V0_EXECUTION_CHAIN_INVALID',
    'Clean-restart authority chain semantics do not match the ledger',
  );
  return {
    approvalSHA: approval.sha256,
    cursorSHA: cursor.sha256,
    overrideSHA: override.sha256,
    consumptionSHA: consumption.sha256,
    rollbackSHA: rollback.sha256,
    hostSupervisorSHA: host.sha256,
  };
}

function validateSourceManifest(options) {
  if (!options['verify-source-manifest']) return null;
  const source = receiptFromEnvironment(
    'V1_SOURCE_MANIFEST_PATH',
    'V1_SOURCE_MANIFEST_SHA',
    'SOURCE_MANIFEST_INVALID',
  );
  const receipt = source.receipt;
  assert(
    receipt.schemaVersion === 2 &&
      receipt.task === 1 &&
      receipt.sourceTreeSHA === process.env.V1_TASK_SOURCE_TREE_SHA &&
      equal(receipt.ownedPaths, TASK_ONE_OUTPUTS) &&
      equal(receipt.entries.map((entry) => entry.path), TASK_ONE_OUTPUTS) &&
      receipt.entries.every(
        (entry) =>
          entry.state === 'present' &&
          entry.baseline?.state === 'deleted' &&
          entry.candidate?.state === 'present' &&
          entry.candidate?.type === 'blob' &&
          /^[0-9a-f]{40}$/.test(entry.candidate?.blob ?? '') &&
          /^[0-9a-f]{64}$/.test(entry.candidate?.sha256 ?? ''),
      ),
    'SOURCE_MANIFEST_INVALID',
    'Private-index source manifest does not bind the six Task 1 outputs',
  );
  return {
    path: source.path,
    sha256: source.sha256,
    sourceTreeSHA: receipt.sourceTreeSHA,
    entries: receipt.entries.length,
  };
}

function validateSources(ledger, options) {
  const expected = {
    pdf: options['pdf-sha'],
    preview: options['preview-sha'],
    designCommit: options['design-commit'],
    design: options['design-sha'],
  };
  assert(equal(ledger.sources, expected), 'SOURCE_DIGEST_MISMATCH', 'Ledger source binding differs from CLI binding');
  return verifyBoundSources(options);
}

function validateScreens(ledger) {
  assert(Array.isArray(ledger.screens), 'LEDGER_SCREEN_COUNT', 'screens must be an array');
  assert(ledger.screens.length === 18, 'LEDGER_SCREEN_COUNT', `Expected 18 screens, found ${ledger.screens.length}`);
  const ids = ledger.screens.map((screen) => screen.id);
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
  assert(duplicates.length === 0, 'LEDGER_DUPLICATE_ID', `Duplicate screen IDs: ${[...new Set(duplicates)].join(', ')}`);
  assert(equal([...ids].sort(), [...EXPECTED_SCREEN_IDS].sort()), 'LEDGER_SCREEN_SET', 'Screen ID set is incomplete');
  for (const screen of ledger.screens) {
    for (const field of ['route', 'actorShell', 'backendContract', 'wave', 'scenario', 'ownerTodo']) {
      assert(screen[field] !== undefined && screen[field] !== '', 'LEDGER_SCREEN_MAPPING_INCOMPLETE', `${screen.id} is missing ${field}`);
    }
  }
}

function validateOwnership(ledger, planText) {
  const expected = parseOwnershipFromPlan(planText);
  assert(expected.length === 27, 'LEDGER_OWNERSHIP_DRIFT', `Selected plan has ${expected.length} ownership rows`);
  assert(Array.isArray(ledger.ownership) && ledger.ownership.length === 27, 'LEDGER_OWNERSHIP_COUNT', 'Ledger must contain 27 ownership rows');
  assert(
    equal(ledger.globalForbidden, EXPECTED_FORBIDDEN),
    'LEDGER_FORBIDDEN_DRIFT',
    'Global forbidden manifest differs from the canonical Task 1 set',
  );
  const observedTodoIds = ledger.ownership.map((row) => row.todo);
  assert(
    new Set(observedTodoIds).size === 27 &&
      observedTodoIds.every((todo) => Number.isInteger(todo) && todo >= 1 && todo <= 27),
    'LEDGER_OWNERSHIP_COUNT',
    'Ledger ownership todo IDs must be exactly 1 through 27',
  );
  for (const expectedRow of expected) {
    const observed = ledger.ownership.find((row) => row.todo === expectedRow.todo);
    assert(observed, 'LEDGER_OWNERSHIP_COUNT', `Missing ownership row ${expectedRow.todo}`);
    assert(observed.inputs === expectedRow.inputs, 'LEDGER_OWNERSHIP_DRIFT', `Todo ${expectedRow.todo} input manifest drift`);
    assert(equal(observed.outputs, expectedRow.outputs), 'LEDGER_OWNERSHIP_DRIFT', `Todo ${expectedRow.todo} output manifest drift`);
    assert(
      equal(observed.forbidden, EXPECTED_FORBIDDEN),
      'LEDGER_FORBIDDEN_DRIFT',
      `Todo ${expectedRow.todo} forbidden manifest drift`,
    );
  }
}

function validateBaseline(ledger, repoRoot) {
  assert(/^[0-9a-f]{40}$/.test(ledger.baselineSHA ?? ''), 'BASELINE_INPUT_DRIFT', 'baselineSHA must be a full commit SHA');
  assert(
    ledger.baselineSHA === EXPECTED_BASELINE_SHA,
    'BASELINE_INPUT_DRIFT',
    'baselineSHA differs from the independently frozen Task 1 commit',
  );
  assert(ledger.branch === 'dev', 'BASELINE_INPUT_DRIFT', 'baseline branch must be dev');
  assert(
    equal(ledger.ownedPathBaselineState, EXPECTED_OWNED_PATH_BASELINE_STATE),
    'OWNED_PATH_DIRTY_BEFORE_START',
    'Task 1 baseline state must contain exactly the six canonical owned paths, all absent',
  );
  if (!process.env.V1_TASK_SOURCE_TREE_SHA) {
    const baselineTree = spawnSync(
      'git',
      ['ls-tree', '-r', '-z', '--name-only', ledger.baselineSHA, '--', ...TASK_ONE_OUTPUTS],
      { cwd: repoRoot, encoding: null, maxBuffer: 1024 * 1024 },
    );
    assert(
      baselineTree.status === 0,
      'BASELINE_INPUT_DRIFT',
      `Unable to inspect baseline tree: ${baselineTree.stderr?.toString('utf8').trim()}`,
    );
    const trackedAtBaseline = baselineTree.stdout.toString('utf8').split('\0').filter(Boolean);
    assert(
      trackedAtBaseline.length === 0,
      'OWNED_PATH_DIRTY_BEFORE_START',
      `Task 1 owned paths existed in the baseline tree: ${trackedAtBaseline.join(', ')}`,
    );
  }
  const dirty = ledger.unrelatedDirty;
  assert(dirty?.schemaVersion === 1 && Array.isArray(dirty.records) && Array.isArray(dirty.paths), 'DIRTY_FINGERPRINT_INVALID', 'Unrelated dirty fingerprint is malformed');
  const baselineDirtyPaths = new Set(dirty.paths.map((entry) => entry.path));
  const ownedDirtyPaths = TASK_ONE_OUTPUTS.filter((path) => baselineDirtyPaths.has(path));
  assert(
    ownedDirtyPaths.length === 0,
    'OWNED_PATH_DIRTY_BEFORE_START',
    `Task 1 owned paths leaked into the baseline dirty fingerprint: ${ownedDirtyPaths.join(', ')}`,
  );
  const unsigned = {
    schemaVersion: dirty.schemaVersion,
    baselineSHA: dirty.baselineSHA,
    records: dirty.records,
    paths: dirty.paths,
  };
  const digest = createHash('sha256').update(JSON.stringify(unsigned)).digest('hex');
  assert(digest === dirty.fingerprintSHA256, 'DIRTY_FINGERPRINT_INVALID', 'Unrelated dirty fingerprint digest mismatch');
  assert(
    dirty.fingerprintSHA256 === EXPECTED_DIRTY_FINGERPRINT_SHA256,
    'DIRTY_FINGERPRINT_INVALID',
    'Unrelated dirty fingerprint differs from the independently frozen Task 1 snapshot',
  );
  assert(dirty.baselineSHA === ledger.baselineSHA, 'BASELINE_INPUT_DRIFT', 'Dirty fingerprint baseline differs from ledger baseline');
}

function validateClassifications(ledger) {
  assert(Array.isArray(ledger.classifications) && ledger.classifications.length === 9, 'LEDGER_CLASSIFICATION_INCOMPLETE', 'Nine named task/scenario references must be classified');
  const allowed = new Set(['keep', 'extend', 'supersede', 'stale']);
  for (const entry of ledger.classifications) {
    assert(allowed.has(entry.classification), 'LEDGER_CLASSIFICATION_INVALID', `${entry.path} has invalid classification`);
    if (entry.classification === 'stale' || entry.classification === 'supersede') {
      assert(entry.supersededBy, 'LEDGER_SUPERSEDING_PATH_MISSING', `${entry.path} must name a superseding path`);
    }
  }
}

export function validateLedger(options, repoRoot = process.cwd()) {
  const ledger = parseLedger(resolve(repoRoot, options.ledgerPath));
  const planText = readFileSync(
    resolve(repoRoot, process.env.V1_SELECTED_PLAN_PATH ?? PLAN_PATH),
    'utf8',
  );
  validateBaseline(ledger, repoRoot);
  validateScreens(ledger);
  validateOwnership(ledger, planText);
  validateClassifications(ledger);
  const sources = options['verify-source-manifest'] ? validateSources(ledger, options) : null;
  const cleanRestartAuthority = validateCleanRestartAuthority(ledger, options);
  const sourceManifest = validateSourceManifest(options);
  return {
    code: 'TEAM_TOURNAMENT_LEDGER_OK',
    baselineSHA: ledger.baselineSHA,
    screens: ledger.screens.length,
    ownershipRows: ledger.ownership.length,
    classifications: ledger.classifications.length,
    dirtyFingerprintSHA256: ledger.unrelatedDirty.fingerprintSHA256,
    sources,
    cleanRestartAuthority,
    sourceManifest,
  };
}

try {
  const result = validateLedger(parseArgs(process.argv.slice(2)));
  process.stdout.write(`${JSON.stringify(result)}\n`);
} catch (error) {
  const code = error instanceof LedgerError || error?.code ? error.code : 'LEDGER_VALIDATION_FAILED';
  process.stderr.write(`${code}: ${error.message}\n`);
  process.exitCode =
    code === 'SOURCE_DIGEST_MISMATCH' ? 65 :
    code === 'LEDGER_DUPLICATE_ID' ? 66 :
    code === 'OWNED_PATH_DIRTY_BEFORE_START' ? 67 : 64;
}
