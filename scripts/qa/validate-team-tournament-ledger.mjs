#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { verifyBoundSources } from './verify-team-tournament-bound-sources.mjs';

const TASK_ONE_OUTPUTS = [
  '.github/tasks/127-v1-team-tournament-operations-game-record.md',
  'scripts/qa/validate-team-tournament-ledger.mjs',
  'scripts/qa/run-v1-task-verification.mjs',
  'scripts/qa/verify-team-tournament-bound-sources.mjs',
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
  const options = { ledgerPath, 'verify-source-manifest': false };
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (token === '--verify-source-manifest') {
      options['verify-source-manifest'] = true;
      continue;
    }
    if (!token.startsWith('--')) {
      throw new LedgerError('MALFORMED_INPUT', `Unexpected argument: ${token}`);
    }
    const value = rest[index + 1];
    if (!value || value.startsWith('--')) {
      throw new LedgerError('MALFORMED_INPUT', `Missing value for ${token}`);
    }
    options[token.slice(2)] = value;
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
    'Task 1 baseline state must contain exactly the four canonical owned paths, all absent',
  );
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
  const planText = readFileSync(resolve(repoRoot, PLAN_PATH), 'utf8');
  validateBaseline(ledger, repoRoot);
  validateScreens(ledger);
  validateOwnership(ledger, planText);
  validateClassifications(ledger);
  const sources = options['verify-source-manifest'] ? validateSources(ledger, options) : null;
  return {
    code: 'TEAM_TOURNAMENT_LEDGER_OK',
    baselineSHA: ledger.baselineSHA,
    screens: ledger.screens.length,
    ownershipRows: ledger.ownership.length,
    classifications: ledger.classifications.length,
    dirtyFingerprintSHA256: ledger.unrelatedDirty.fingerprintSHA256,
    sources,
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
