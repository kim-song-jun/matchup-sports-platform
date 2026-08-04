#!/usr/bin/env node
//
// F1-F4 final-gate payload body for Task 27 (Task 127 ledger todo 27, see
// .github/tasks/127-v1-team-tournament-operations-game-record.md line 151).
//
// This script is NOT invoked directly. It is the payload command the wrapper
// (scripts/qa/run-v1-task-verification.mjs) spawns after `--` when called as:
//
//   node scripts/qa/run-v1-task-verification.mjs --final-gate F1 --adopt-candidate-attempt \
//     --candidate-receipt "$V1_CANDIDATE_RECEIPT_PATH" --candidate-receipt-sha "$V1_CANDIDATE_RECEIPT_SHA" \
//     -- node scripts/qa/run-v1-final-gate.mjs --gate F1 --phase local-precleanup \
//        --plan .omo/plans/teameet-team-tournament-operations-v1.md
//
// The wrapper owns candidate verification, host preflight, DB/service lifecycle, and writes
// its OWN receipt at `<attemptDir>/<gateId>.json` via `immutableWrite()` after this process
// exits (run-v1-task-verification.mjs main(), HEAD 6b7b06a3, lines 3973-4019). This script
// must never write to that same path — its own evidence goes to `<attemptDir>/final/<gate>.json`
// instead. A non-zero exit code here becomes the wrapper's `failedResult`, which flips the
// wrapper's own verdict to 'rejected' (same file, line 3918/3941) — that is the sole channel
// this script has to fail a gate; there is no separate approval side-channel.
//
// attemptDir is derived, not passed directly: the wrapper always sets
// V1_TASK_SOURCE_MANIFEST_PATH = join(attemptDir, 'source-manifest.json') for every payload
// (createSourceSnapshot / createCandidateSourceSnapshot, same file, lines 1583-1622 and
// 1644-1668), so dirname(V1_TASK_SOURCE_MANIFEST_PATH) === attemptDir always holds. The
// wrapper only sets V1_TASK_LIFECYCLE_RECEIPT_PATH for task===27 or finalGate==='F3' (line
// 3833), so F1/F2/F4 cannot rely on it to find attemptDir — the source-manifest path is the
// one env var every gate is guaranteed to receive.
//
// This file does NOT import run-v1-task-verification.mjs. That module calls
// `main().catch(...)` unconditionally at its own top level (confirmed: zero `if
// (import.meta.url === ...)` guard exists there, lines 4039-4043) — importing it here would
// re-run its full CLI parser against *this* process's argv as a side effect. All helpers this
// script needs (sha256, ledger-marker parsing, immutable-write semantics) are reimplemented
// below, deliberately kept small and self-contained instead.
//
// CRITICAL HONESTY CONTRACT: every check below is either (a) genuinely evaluated from the
// repository, the ledger, or the receipts the wrapper bound into this process's env, and
// reported pass/fail, or (b) explicitly marked `blocked` with a distinct FINAL_* code
// explaining exactly what could not be verified and why. A gate only reaches verdict
// 'APPROVE' when every single check is 'pass' — one 'blocked' item is enough to REJECT. Do
// not weaken this by turning a 'blocked' item into a silent pass without actually
// implementing the check it stands in for.

import { createHash } from 'node:crypto';
import {
  closeSync,
  chmodSync,
  constants as fsConstants,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  statSync,
  writeSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { connect } from 'node:net';

const BEGIN = '<!-- TASK127_LEDGER_JSON_BEGIN -->';
const END = '<!-- TASK127_LEDGER_JSON_END -->';
const DEFAULT_LEDGER = '.github/tasks/127-v1-team-tournament-operations-game-record.md';
const DEFAULT_PLAN = '.omo/plans/teameet-team-tournament-operations-v1.md';
// Mirrors TARGET_PORTS in scripts/qa/run-v1-task-verification.mjs line 203 (web 3013 / api
// 8121) — the wrapper only tracks these ports for cleanup accounting; it never starts the
// stack. This script probes them read-only for the same reason (see F3).
const TARGET_PORTS = [3013, 8121];

class GateError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'GateError';
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// small shared primitives
// ---------------------------------------------------------------------------

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function sha256File(path) {
  return sha256(readFileSync(path));
}

function runGit(args, cwd) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 });
  if (result.status !== 0) {
    return { ok: false, stdout: '', stderr: (result.stderr || result.error?.message || '').trim() };
  }
  return { ok: true, stdout: result.stdout, stderr: '' };
}

function parseLedgerJSON(markdown) {
  const start = markdown.indexOf(BEGIN);
  const end = markdown.indexOf(END);
  if (start === -1 || end === -1 || end <= start) {
    throw new GateError('FINAL_PLAN_LEDGER_INVALID', 'Canonical ledger JSON markers are missing');
  }
  const fenced = markdown.slice(start + BEGIN.length, end).trim();
  const match = fenced.match(/^```json\n([\s\S]+)\n```$/);
  if (!match) {
    throw new GateError('FINAL_PLAN_LEDGER_INVALID', 'Canonical ledger JSON fence is malformed');
  }
  try {
    return JSON.parse(match[1]);
  } catch (error) {
    throw new GateError('FINAL_PLAN_LEDGER_INVALID', `Canonical ledger JSON is invalid: ${error.message}`);
  }
}

function loadLedger(repoRoot, options) {
  const ledgerPath = resolve(repoRoot, options.ledger ?? DEFAULT_LEDGER);
  const markdown = readFileSync(ledgerPath, 'utf8');
  return { ledgerPath, markdown, ledger: parseLedgerJSON(markdown) };
}

function check(id, description, status, detail, code) {
  if (!['pass', 'fail', 'blocked'].includes(status)) {
    throw new GateError('FINAL_GATE_CRASH', `invalid check status "${status}" for ${id}`);
  }
  if (status !== 'pass' && !code) {
    throw new GateError('FINAL_GATE_CRASH', `check ${id} is ${status} but has no code`);
  }
  return { id, description, status, detail, code: code ?? null };
}

function matchesForbidden(path, pattern) {
  if (pattern.endsWith('/**')) return path.startsWith(pattern.slice(0, -2));
  if (pattern.endsWith('*')) return path.startsWith(pattern.slice(0, -1));
  return path === pattern;
}

function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) {
      options[key] = true;
    } else {
      options[key] = next;
      i += 1;
    }
  }
  return options;
}

// O_CREAT|O_EXCL|O_NOFOLLOW, mode 0400 -> chmod 0444 after write: mirrors the
// immutableWrite() convention in run-v1-task-verification.mjs (lines 1459-1489) so gate
// evidence is exclusive-write and read-only, without importing that module (see header).
// It deliberately does NOT dedupe-on-identical-bytes the way immutableWriteOrReuse() does:
// the wrapper's own <gateId>.json receipt uses plain immutableWrite (line 4019), i.e. a
// second run against the same attemptId is expected to collide there too — this mirrors
// that, on the theory that attemptId is normally a fresh randomUUID() per invocation
// (run-v1-task-verification.mjs line 3684-3688) unless a caller deliberately pins one.
function writeEvidenceImmutable(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
  const flags = fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_NOFOLLOW;
  let fd;
  try {
    fd = openSync(path, flags, 0o400);
  } catch (error) {
    if (error.code === 'EEXIST') {
      throw new GateError('FINAL_EVIDENCE_COLLISION', `${path} already exists`);
    }
    throw error;
  }
  try {
    let offset = 0;
    while (offset < bytes.length) {
      offset += writeSync(fd, bytes, offset, bytes.length - offset, null);
    }
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  chmodSync(path, 0o444);
  return { path, sha256: sha256(bytes) };
}

// ---------------------------------------------------------------------------
// shared receipt-descriptor re-affirmation (used by F1 and F4)
//
// The wrapper's verifyCandidate() has already exact-key/regex/chain-validated the candidate
// receipt before this process was even spawned (run-v1-task-verification.mjs lines
// 1784-1968) — this is a lightweight re-affirmation from inside the payload that the exact
// same bound path+sha the wrapper handed us in env still resolves on disk, not a repeat of
// the wrapper's full descriptor/canonical-JSON verification.
// ---------------------------------------------------------------------------

function verifyBoundReceipt(env, pathVar, shaVar, checkId, description, missingCode, mismatchCode) {
  const path = env[pathVar];
  const sha = env[shaVar];
  if (!path || !sha) {
    return check(checkId, description, 'fail', `${pathVar}/${shaVar} not supplied by the wrapper`, missingCode);
  }
  if (!existsSync(path)) {
    return check(checkId, description, 'fail', `${path} does not exist`, missingCode);
  }
  const observed = sha256File(path);
  if (observed !== sha) {
    return check(checkId, description, 'fail', `expected=${sha} observed=${observed} at ${path}`, mismatchCode);
  }
  return check(checkId, description, 'pass', `${path} sha256=${observed}`);
}

function verifyReceiptDescriptors(env) {
  return [
    verifyBoundReceipt(
      env,
      'V1_CANDIDATE_RECEIPT_PATH',
      'V1_CANDIDATE_RECEIPT_SHA',
      'candidate-receipt-bound',
      'Candidate receipt file on disk still matches the sha256 the wrapper bound into this process env',
      'FINAL_CANDIDATE_RECEIPT_MISSING',
      'FINAL_CANDIDATE_RECEIPT_SHA_MISMATCH',
    ),
    verifyBoundReceipt(
      env,
      'V1_TASK_SOURCE_MANIFEST_PATH',
      'V1_TASK_SOURCE_MANIFEST_SHA',
      'source-manifest-bound',
      'Source manifest file on disk still matches the sha256 the wrapper bound into this process env',
      'FINAL_SOURCE_MANIFEST_MISSING',
      'FINAL_SOURCE_MANIFEST_SHA_MISMATCH',
    ),
  ];
}

// ---------------------------------------------------------------------------
// F1 - plan compliance audit
// ---------------------------------------------------------------------------

function runF1({ repoRoot, options, env }) {
  const checks = [];
  let ledgerMarkdown;
  let ledger;
  try {
    ({ markdown: ledgerMarkdown, ledger } = loadLedger(repoRoot, options));
    checks.push(check('ledger-parses', 'Task 127 ledger JSON parses from git-tracked markdown', 'pass', options.ledger ?? DEFAULT_LEDGER));
  } catch (error) {
    checks.push(check('ledger-parses', 'Task 127 ledger JSON parses from git-tracked markdown', 'fail', error.message, error.code ?? 'FINAL_PLAN_LEDGER_INVALID'));
    return checks;
  }

  // 18 screen IDs (T-01..T-09, A-01..A-05, P-01..P-04 per the ledger's `screens` array).
  const screens = Array.isArray(ledger.screens) ? ledger.screens : [];
  const screenFieldsOk = screens.every(
    (s) => s && s.id && s.route && s.actorShell && s.backendContract && s.wave !== undefined && s.scenario && s.ownerTodo !== undefined,
  );
  checks.push(check(
    'screen-coverage-18',
    'Ledger binds exactly 18 product screen IDs, each with route/actorShell/backendContract/wave/scenario/ownerTodo',
    screens.length === 18 && screenFieldsOk ? 'pass' : 'fail',
    `count=${screens.length} fieldsComplete=${screenFieldsOk}`,
    screens.length === 18 && screenFieldsOk ? undefined : 'FINAL_PLAN_SCREEN_COVERAGE_MISSING',
  ));

  // 7 distinct E2E scenario IDs referenced across those screens (scenario field is
  // '|'-delimited when a screen belongs to more than one journey).
  const scenarioIds = new Set();
  for (const s of screens) {
    if (!s?.scenario) continue;
    for (const token of String(s.scenario).split('|')) scenarioIds.add(token.trim());
  }
  checks.push(check(
    'e2e-scenario-coverage-7',
    'Screens collectively reference exactly 7 distinct E2E scenario IDs',
    scenarioIds.size === 7 ? 'pass' : 'fail',
    `ids=${[...scenarioIds].sort().join(',')}`,
    scenarioIds.size === 7 ? undefined : 'FINAL_PLAN_SCENARIO_COVERAGE_MISSING',
  ));

  // D-01..D-12 decision table, reproduced verbatim in the ledger markdown (not just the JSON
  // block) at the "Approved decisions, reproduced for executor independence" table.
  const dIds = new Set([...ledgerMarkdown.matchAll(/^\| (D-\d{2}) \|/gm)].map((m) => m[1]));
  const expectedD = Array.from({ length: 12 }, (_, i) => `D-${String(i + 1).padStart(2, '0')}`);
  const dComplete = expectedD.every((id) => dIds.has(id));
  checks.push(check(
    'd-decisions-12',
    'Reproduced decision table (D-01..D-12) is present in the ledger with every ID',
    dComplete ? 'pass' : 'fail',
    `found=${[...dIds].sort().join(',')}`,
    dComplete ? undefined : 'FINAL_PLAN_DECISION_TABLE_INCOMPLETE',
  ));

  // Scope rules: globalForbidden + every ownership row's forbidden[].
  const globalForbidden = Array.isArray(ledger.globalForbidden) ? ledger.globalForbidden : [];
  const ownership = Array.isArray(ledger.ownership) ? ledger.ownership : [];
  const scopeRulesOk = globalForbidden.length > 0 && ownership.length > 0
    && ownership.every((row) => Array.isArray(row.forbidden) && row.forbidden.length > 0);
  checks.push(check(
    'scope-rules-present',
    'globalForbidden and every ownership row forbidden[] are declared',
    scopeRulesOk ? 'pass' : 'fail',
    `globalForbidden=${globalForbidden.length} ownershipRows=${ownership.length}`,
    scopeRulesOk ? undefined : 'FINAL_PLAN_SCOPE_RULES_MISSING',
  ));

  // Canonical plan doc: 27 acceptance items + checkbox-normalized SHA binding. Absent in
  // most worktrees today — .omo/plans/** is excluded via a local (uncommitted)
  // .git/info/exclude rule, confirmed via `git check-ignore -v` and a direct `ls .omo`
  // (only .omo/start-work/ exists on disk here). That file is Task-1 clean-restart
  // authority evidence meant to persist on the host across the whole lifecycle, not
  // something a Task-27 gate can regenerate — so its absence blocks, it does not fail.
  const planPath = resolve(repoRoot, options.plan ?? DEFAULT_PLAN);
  if (!existsSync(planPath)) {
    checks.push(check(
      'plan-document-present',
      'Canonical plan markdown exists at the path the ledger declares (planPath)',
      'blocked',
      `${planPath} is absent from this worktree. It must be materialized by the host process that owns the Task-1 clean-restart authority chain before F1 can audit the 27 acceptance items and byte-fidelity of the D-decision/screen/scenario text against the canonical plan.`,
      'FINAL_PLAN_COVERAGE_MISSING',
    ));
  } else {
    try {
      const planBytes = readFileSync(planPath);
      // Same checkbox-normalization readPlan() applies in run-v1-task-verification.mjs
      // (lines 353-361): unchecked-normalize only numbered/F[1-4]-prefixed checkbox lines.
      const normalized = planBytes.toString('utf8').replace(/^- \[[ x]\] (?=(?:\d+\.|F[1-4]\.))/gm, '- [ ] ');
      const normalizedSHA = sha256(Buffer.from(normalized));
      const selected = env.OMO_SELECTED_PLAN_SHA;
      const shaOk = Boolean(selected) && selected === normalizedSHA;
      checks.push(check(
        'plan-sha-binding',
        'OMO_SELECTED_PLAN_SHA matches the checkbox-normalized live plan (mirrors run-v1-task-verification.mjs readPlan())',
        shaOk ? 'pass' : 'fail',
        `selected=${selected ?? 'unset'} normalized=${normalizedSHA}`,
        shaOk ? undefined : 'FINAL_PLAN_COVERAGE_MISSING',
      ));
      const acceptanceItems = new Set([...planBytes.toString('utf8').matchAll(/^- \[[ x]\] (\d+)\./gm)].map((m) => Number(m[1])));
      checks.push(check(
        'acceptance-items-27',
        'Plan declares exactly 27 numbered top-level acceptance checkboxes',
        acceptanceItems.size === 27 ? 'pass' : 'fail',
        `count=${acceptanceItems.size}`,
        acceptanceItems.size === 27 ? undefined : 'FINAL_PLAN_COVERAGE_MISSING',
      ));
    } catch (error) {
      checks.push(check('plan-document-present', 'Canonical plan markdown exists and parses', 'fail', error.message, 'FINAL_PLAN_COVERAGE_MISSING'));
    }
  }

  checks.push(...verifyReceiptDescriptors(env));
  return checks;
}

// ---------------------------------------------------------------------------
// F2 - code quality review
// ---------------------------------------------------------------------------

const DEBT_MARKER_PATTERN = /(TODO|FIXME|HACK|XXX|eslint-disable|@ts-ignore|\.only\(|\.skip\()/;

function runF2({ repoRoot, options }) {
  const checks = [];
  let ledger;
  try {
    ({ ledger } = loadLedger(repoRoot, options));
    checks.push(check('ledger-parses', 'Task 127 ledger JSON parses from git-tracked markdown', 'pass', options.ledger ?? DEFAULT_LEDGER));
  } catch (error) {
    checks.push(check('ledger-parses', 'Task 127 ledger JSON parses from git-tracked markdown', 'fail', error.message, error.code ?? 'FINAL_PLAN_LEDGER_INVALID'));
    return checks;
  }

  const diff = runGit(['diff', '--name-only', `${ledger.baselineSHA}..HEAD`], repoRoot);
  if (!diff.ok) {
    checks.push(check('touched-files-diff', 'git diff baselineSHA..HEAD resolves', 'blocked', diff.stderr || 'git diff failed', 'FINAL_CODE_DIFF_UNAVAILABLE'));
    checks.push(check(
      'debt-marker-scan',
      'Touched files scanned for TODO/FIXME/HACK/XXX/eslint-disable/@ts-ignore/.only(/.skip( markers',
      'blocked',
      'skipped: diff unavailable',
      'FINAL_CODE_DIFF_UNAVAILABLE',
    ));
  } else {
    const touched = diff.stdout.split('\n').map((s) => s.trim()).filter(Boolean);
    checks.push(check('touched-files-diff', 'git diff baselineSHA..HEAD resolves', 'pass', `${touched.length} files changed since baselineSHA`));

    const hits = [];
    for (const relPath of touched) {
      const abs = resolve(repoRoot, relPath);
      if (!existsSync(abs)) continue; // deleted between baseline and HEAD
      let stat;
      try {
        stat = statSync(abs);
      } catch {
        continue;
      }
      if (!stat.isFile() || stat.size > 2 * 1024 * 1024) continue; // skip non-files / oversized (likely binary)
      let text;
      try {
        text = readFileSync(abs, 'utf8');
      } catch {
        continue; // unreadable / binary
      }
      text.split('\n').forEach((line, index) => {
        if (DEBT_MARKER_PATTERN.test(line)) hits.push(`${relPath}:${index + 1}`);
      });
    }
    checks.push(check(
      'debt-marker-scan',
      'Touched files scanned for TODO/FIXME/HACK/XXX/eslint-disable/@ts-ignore/.only(/.skip( markers',
      hits.length === 0 ? 'pass' : 'fail',
      hits.length === 0 ? `${touched.length} touched files clean` : hits.slice(0, 50).join(', '),
      hits.length === 0 ? undefined : 'FINAL_CODE_TECH_DEBT_MARKER',
    ));
  }

  // The five serial domain reviews (backend/frontend/infra-security/migration/privacy) call
  // for judgment this static gate script cannot exercise with any confidence. Per the
  // honesty contract, mark unchecked-and-blocking rather than approve a criterion never
  // evaluated.
  checks.push(check(
    'domain-serial-reviews',
    'Serial backend / frontend / infra-security / migration / privacy review passes',
    'blocked',
    'This gate performs only mechanical static scans; it cannot substitute domain-expert review judgment. Run the project review loop (insane-review + Copilot review, see docs/ops/pr-review-visual-workflow.md) and feed its outcome back before approving F2.',
    'FINAL_CODE_REVIEW_UNPERFORMED',
  ));

  // FINAL_CODE_LEGACY_WRITER (named by the orchestrator) needs to know which touched call
  // sites bypass the GAME_WRITE flag gate (apps/v1_api/src/config/game-operation-flags.ts)
  // to write the legacy result path directly. A grep-based heuristic here would either miss
  // real bypasses (false negative -> silently approves a regression) or flag innocuous
  // matches (false positive -> blocks good code) with no reliable way to tell them apart
  // without tracing the call graph. Left unchecked rather than faked.
  checks.push(check(
    'legacy-writer-scan',
    'No touched code bypasses the GAME_WRITE flag gate to write the legacy result path directly',
    'blocked',
    'Reliable detection requires tracing the GAME_WRITE flag call graph across touched files (apps/v1_api/src/config/game-operation-flags.ts); a grep heuristic risks false negatives on a scope-defining safety check, so this is left unchecked. Confirm apps/v1_api/src/games/adapters is the sole legacy/new write switch for touched files during domain review.',
    'FINAL_CODE_LEGACY_WRITER_UNVERIFIED',
  ));

  return checks;
}

// ---------------------------------------------------------------------------
// F3 - real manual QA
// ---------------------------------------------------------------------------

function probePort(port, host = '127.0.0.1', timeoutMs = 1500) {
  return new Promise((resolvePromise) => {
    let settled = false;
    const finish = (reachable) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.removeAllListeners();
      socket.destroy();
      resolvePromise(reachable);
    };
    const socket = connect({ host, port });
    const timer = setTimeout(() => finish(false), timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
  });
}

// Passive TCP reachability probe only. This never starts, stops, or otherwise provisions
// the v1 web/api stack — it only observes whether something is already listening on the two
// ports the wrapper itself tracks (TARGET_PORTS, mirrored above). Starting the stack is the
// wrapper/outer lifecycle owner's job (run-v1-task-verification.mjs `--lifecycle-owner
// outer`, required for finalGate==='F3' at line 3663-3671), never this payload's.
async function probeLiveSurface() {
  const results = await Promise.all(TARGET_PORTS.map(async (port) => ({ port, reachable: await probePort(port) })));
  const allReachable = results.every((r) => r.reachable);
  return check(
    'live-surface-reachable',
    `Passive TCP reachability probe of the v1 stack ports (${TARGET_PORTS.join(', ')}) — this gate never starts these services itself`,
    allReachable ? 'pass' : 'blocked',
    results.map((r) => `${r.port}:${r.reachable ? 'up' : 'down'}`).join(' '),
    allReachable ? undefined : 'FINAL_MANUAL_QA_SURFACE_ABSENT',
  );
}

async function runF3({ options, env }) {
  const checks = [];

  const lifecyclePath = env.V1_TASK_LIFECYCLE_RECEIPT_PATH;
  const lifecycleSHA = env.V1_TASK_LIFECYCLE_RECEIPT_SHA;
  if (!lifecyclePath || !lifecycleSHA) {
    // The wrapper only writes this receipt (and only sets these two env vars) when
    // finalGate === 'F3' or task === 27 (run-v1-task-verification.mjs line 3833). Its
    // absence here means this process was not actually invoked as the F3 payload.
    checks.push(check(
      'lifecycle-receipt-bound',
      'Wrapper supplied V1_TASK_LIFECYCLE_RECEIPT_PATH/SHA (only set for finalGate=F3 or task=27)',
      'fail',
      'env vars absent',
      'FINAL_MANUAL_QA_LIFECYCLE_MISSING',
    ));
  } else if (!existsSync(lifecyclePath)) {
    checks.push(check('lifecycle-receipt-bound', 'Lifecycle-start receipt file exists', 'fail', lifecyclePath, 'FINAL_MANUAL_QA_LIFECYCLE_MISSING'));
  } else {
    const observed = sha256File(lifecyclePath);
    if (observed !== lifecycleSHA) {
      checks.push(check(
        'lifecycle-receipt-bound',
        'Lifecycle-start receipt bytes match the sha256 bound into this process env',
        'fail',
        `expected=${lifecycleSHA} observed=${observed}`,
        'FINAL_MANUAL_QA_LIFECYCLE_SHA_MISMATCH',
      ));
    } else {
      let gateIdOk = false;
      let detail = lifecyclePath;
      try {
        const receipt = JSON.parse(readFileSync(lifecyclePath, 'utf8'));
        gateIdOk = receipt.gateId === 'F3';
        detail = `gateId=${receipt.gateId}`;
      } catch (error) {
        detail = error.message;
      }
      checks.push(check(
        'lifecycle-receipt-bound',
        'Lifecycle-start receipt bytes match the bound sha256 and is bound to gateId F3',
        gateIdOk ? 'pass' : 'fail',
        detail,
        gateIdOk ? undefined : 'FINAL_MANUAL_QA_LIFECYCLE_MISSING',
      ));
    }
  }

  checks.push(await probeLiveSurface());

  const zipPath = options['qa-evidence-zip'];
  if (!zipPath || zipPath === true) {
    checks.push(check(
      'qa-evidence-provided',
      'A manual-QA evidence archive path was supplied via --qa-evidence-zip',
      'blocked',
      'not supplied. Per the plan, F3 evidence is a zip; this gate does not have zip-authoring tooling and cannot fabricate one, so a reviewed archive must be handed in.',
      'FINAL_MANUAL_QA_EVIDENCE_MISSING',
    ));
  } else if (!existsSync(zipPath)) {
    checks.push(check('qa-evidence-provided', 'The supplied --qa-evidence-zip exists on disk', 'fail', zipPath, 'FINAL_MANUAL_QA_EVIDENCE_MISSING'));
  } else {
    const sha = sha256File(zipPath);
    checks.push(check('qa-evidence-provided', 'The supplied --qa-evidence-zip exists on disk and was hashed', 'pass', `${zipPath} sha256=${sha}`));
    checks.push(check(
      'qa-evidence-content-reviewed',
      'Archive contents were opened and matched against all 7 E2E journeys',
      'blocked',
      'This gate has no archive-inspection tooling; hashing only proves an artifact exists at this path, not that its contents cover the required journeys.',
      'FINAL_MANUAL_QA_EVIDENCE_UNREVIEWED',
    ));
  }

  checks.push(check(
    'manual-qa-journeys-performed',
    'A human operator executed the 7 E2E journeys against a headed browser and confirmed pass/fail per journey',
    'blocked',
    'This gate must not start a browser or a live stack itself (hard rule). Manual QA execution and journey-by-journey confirmation is out of scope for a non-interactive static gate and must be supplied as reviewed evidence.',
    'FINAL_MANUAL_QA_NOT_PERFORMED',
  ));

  return checks;
}

// ---------------------------------------------------------------------------
// F4 - scope fidelity
// ---------------------------------------------------------------------------

async function runF4({ repoRoot, options, env }) {
  const checks = [];
  let ledger;
  try {
    ({ ledger } = loadLedger(repoRoot, options));
    checks.push(check('ledger-parses', 'Task 127 ledger JSON parses from git-tracked markdown', 'pass', options.ledger ?? DEFAULT_LEDGER));
  } catch (error) {
    checks.push(check('ledger-parses', 'Task 127 ledger JSON parses from git-tracked markdown', 'fail', error.message, error.code ?? 'FINAL_PLAN_LEDGER_INVALID'));
    return checks;
  }

  const gitProbe = runGit(['rev-parse', '--is-inside-work-tree'], repoRoot);
  if (!gitProbe.ok) {
    checks.push(check(
      'git-available',
      'repoRoot is inside a usable git worktree',
      'blocked',
      gitProbe.stderr || `no .git found from ${repoRoot} — this cwd may be a --snapshot-owned extracted tar copy, which has no git history to diff`,
      'FINAL_SCOPE_GIT_UNAVAILABLE',
    ));
    checks.push(...verifyReceiptDescriptors(env));
    return checks;
  }
  checks.push(check('git-available', 'repoRoot is inside a usable git worktree', 'pass', repoRoot));

  const branchResult = runGit(['branch', '--show-current'], repoRoot);
  const branch = branchResult.ok ? branchResult.stdout.trim() : null;
  checks.push(check(
    'branch-dev',
    'Current branch is dev',
    branch === 'dev' ? 'pass' : 'fail',
    branch ?? branchResult.stderr,
    branch === 'dev' ? undefined : 'FINAL_SCOPE_DRIFT',
  ));

  const headResult = runGit(['rev-parse', 'HEAD'], repoRoot);
  const head = headResult.ok ? headResult.stdout.trim() : null;

  let candidateSHA = null;
  const candidatePath = env.V1_CANDIDATE_RECEIPT_PATH;
  if (candidatePath && existsSync(candidatePath)) {
    try {
      candidateSHA = JSON.parse(readFileSync(candidatePath, 'utf8')).candidateSHA ?? null;
    } catch {
      // handled by verifyReceiptDescriptors below
    }
  }
  const headOk = Boolean(head) && Boolean(candidateSHA) && head === candidateSHA;
  checks.push(check(
    'head-matches-candidate',
    'Live HEAD equals the candidate receipt candidateSHA',
    headOk ? 'pass' : 'fail',
    `head=${head ?? 'unknown'} candidateSHA=${candidateSHA ?? 'unknown'}`,
    headOk ? undefined : 'FINAL_SCOPE_DRIFT',
  ));

  checks.push(...verifyReceiptDescriptors(env));

  const planShaOk = Boolean(ledger.planSHA) && ledger.planSHA === env.OMO_SELECTED_PLAN_SHA;
  checks.push(check(
    'plan-sha-declared',
    'Ledger-declared planSHA matches OMO_SELECTED_PLAN_SHA bound to this run',
    planShaOk ? 'pass' : 'fail',
    `ledger=${ledger.planSHA ?? 'unset'} env=${env.OMO_SELECTED_PLAN_SHA ?? 'unset'}`,
    planShaOk ? undefined : 'FINAL_SCOPE_DRIFT',
  ));

  const diffResult = runGit(['diff', '--name-only', `${ledger.baselineSHA}..HEAD`], repoRoot);
  if (!diffResult.ok) {
    checks.push(check('diff-within-ownership', 'Every changed path between baselineSHA and HEAD is declared in some ownership row', 'blocked', diffResult.stderr, 'FINAL_SCOPE_GIT_UNAVAILABLE'));
    checks.push(check('unrelated-dirty-untouched', 'Frozen unrelatedDirty paths were not further modified', 'blocked', diffResult.stderr, 'FINAL_SCOPE_GIT_UNAVAILABLE'));
    checks.push(check('global-forbidden-untouched', 'No changed path matches a globalForbidden pattern', 'blocked', diffResult.stderr, 'FINAL_SCOPE_GIT_UNAVAILABLE'));
  } else {
    const changed = diffResult.stdout.split('\n').map((s) => s.trim()).filter(Boolean);
    const owned = new Set((ledger.ownership ?? []).flatMap((row) => row.outputs ?? []));
    const outOfScope = changed.filter((path) => !owned.has(path));
    checks.push(check(
      'diff-within-ownership',
      "Every changed path between baselineSHA and HEAD is declared in some todo's ownership outputs",
      outOfScope.length === 0 ? 'pass' : 'fail',
      outOfScope.length === 0 ? `${changed.length} changed paths, all owned` : outOfScope.slice(0, 50).join(', '),
      outOfScope.length === 0 ? undefined : 'FINAL_SCOPE_DRIFT',
    ));

    const unrelatedPaths = new Set((ledger.unrelatedDirty?.paths ?? []).map((p) => p.path));
    const reTouchedUnrelated = changed.filter((path) => unrelatedPaths.has(path));
    checks.push(check(
      'unrelated-dirty-untouched',
      'Frozen unrelatedDirty paths were not further modified in baselineSHA..HEAD',
      reTouchedUnrelated.length === 0 ? 'pass' : 'fail',
      reTouchedUnrelated.length === 0 ? `${unrelatedPaths.size} frozen paths untouched` : reTouchedUnrelated.join(', '),
      reTouchedUnrelated.length === 0 ? undefined : 'FINAL_SCOPE_DRIFT',
    ));

    const forbiddenGlobs = Array.isArray(ledger.globalForbidden) ? ledger.globalForbidden : [];
    const forbiddenHits = changed.filter((path) => forbiddenGlobs.some((pattern) => matchesForbidden(path, pattern)));
    checks.push(check(
      'global-forbidden-untouched',
      'No changed path matches a globalForbidden pattern',
      forbiddenHits.length === 0 ? 'pass' : 'fail',
      forbiddenHits.length === 0 ? 'clean' : forbiddenHits.join(', '),
      forbiddenHits.length === 0 ? undefined : 'FINAL_SCOPE_DRIFT',
    ));
  }

  const allOutputs = (ledger.ownership ?? []).flatMap((row) => row.outputs ?? []);
  const migrationOutputs = allOutputs.filter((p) => p.includes('/prisma/migrations/'));
  // Directory presence is NOT enough. This repo has a documented production outage caused by a
  // schema change shipped without a real migration file (CLAUDE.md, "DB 마이그레이션 규율"), and an
  // empty migration directory reproduces exactly that failure while satisfying an existsSync
  // check. Require the directory to actually carry a non-trivial migration.sql.
  const missingMigrations = migrationOutputs.filter((p) => {
    const dir = resolve(repoRoot, p);
    if (!existsSync(dir)) return true;
    const sql = resolve(dir, 'migration.sql');
    if (!existsSync(sql)) return true;
    try {
      // Comment/whitespace-only files carry no schema change; treat them as missing rather than
      // letting a placeholder satisfy the gate.
      const body = readFileSync(sql, 'utf8')
        .split('\n')
        .filter((line) => !line.trimStart().startsWith('--'))
        .join('')
        .trim();
      return body.length === 0;
    } catch {
      return true;
    }
  });
  checks.push(check(
    'migrations-exist',
    'Every ownership-declared migration directory carries a non-empty migration.sql',
    missingMigrations.length === 0 ? 'pass' : 'fail',
    missingMigrations.length === 0
      ? `${migrationOutputs.length} migrations present with non-empty SQL`
      : missingMigrations.join(', '),
    missingMigrations.length === 0 ? undefined : 'FINAL_SCOPE_DRIFT',
  ));

  const docOutputs = allOutputs.filter((p) => p.startsWith('docs/') && p.endsWith('.md'));
  // Same existence-is-not-content gap as migrations: a zero-byte or heading-only file at the
  // declared path would otherwise certify a documentation deliverable that was never written.
  // The threshold is deliberately low — this gate proves "someone wrote something", not quality,
  // and claiming more than that would be the manufactured confidence this gate must avoid.
  const DOC_MIN_BODY_CHARS = 200;
  const missingDocs = docOutputs.filter((p) => {
    const full = resolve(repoRoot, p);
    if (!existsSync(full)) return true;
    try {
      const body = readFileSync(full, 'utf8')
        .split('\n')
        .filter((line) => !line.trimStart().startsWith('#'))
        .join('')
        .trim();
      return body.length < DOC_MIN_BODY_CHARS;
    } catch {
      return true;
    }
  });
  checks.push(check(
    'docs-exist',
    `Every ownership-declared docs/*.md output exists with at least ${DOC_MIN_BODY_CHARS} chars of body`,
    missingDocs.length === 0 ? 'pass' : 'fail',
    missingDocs.length === 0 ? `${docOutputs.length} docs present with real body text` : missingDocs.join(', '),
    missingDocs.length === 0 ? undefined : 'FINAL_SCOPE_DRIFT',
  ));

  // Narrow proxy for D-12 ("compatibility readers remain and legacy writes reject"): only
  // checks that the GAME_READ compare state is still declared in source. It does not audit
  // every reader call site — that is out of scope for a static grep and is not claimed here.
  const flagsSourcePath = resolve(repoRoot, 'apps/v1_api/src/config/game-operation-flags.ts');
  let compatibilityReaderProxyOk = false;
  if (existsSync(flagsSourcePath)) {
    try {
      const text = readFileSync(flagsSourcePath, 'utf8');
      // Must prove 'compare' sits INSIDE GAME_READ's own declared value list. Testing
      // /GAME_READ/ and /'compare'/ independently would pass on a file where GAME_READ lost
      // 'compare' entirely and the word merely survived in a comment or an unrelated flag —
      // i.e. it would report the compatibility reader as intact at the exact moment it was
      // removed, which is the one outcome this check exists to prevent.
      compatibilityReaderProxyOk = /GAME_READ\s*:\s*\[[^\]]*['"]compare['"][^\]]*\]/.test(text);
    } catch {
      compatibilityReaderProxyOk = false;
    }
  }
  checks.push(check(
    'compatibility-readers-declared',
    "game-operation-flags.ts still declares the GAME_READ compare state (narrow proxy for D-12's \"compatibility readers remain\" — not a full reader-call-site audit)",
    compatibilityReaderProxyOk ? 'pass' : 'fail',
    flagsSourcePath,
    compatibilityReaderProxyOk ? undefined : 'FINAL_SCOPE_DRIFT',
  ));

  checks.push(check(
    'live-flag-tuple-verified',
    'The deployed GAME_WRITE/GAME_READ/PUBLIC_LIVE/DIRECTOR_OFFICIALIZE flag tuple matches the phase-appropriate target state',
    'blocked',
    "This gate performs no database I/O and cannot read live flag rows. Verify against the attempt's flag-gate-<attemptId>-*.json transition bundle (produced by scripts/qa/run-v1-release-candidate.mjs, see ledger line ~521) instead.",
    'FINAL_SCOPE_LIVE_FLAG_UNVERIFIED',
  ));

  return checks;
}

// ---------------------------------------------------------------------------
// entry point
// ---------------------------------------------------------------------------

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const gateId = options.gate;
  if (typeof gateId !== 'string' || !/^F[1-4]$/.test(gateId)) {
    process.stderr.write('FINAL_GATE_USAGE_INVALID: --gate F1|F2|F3|F4 is required\n');
    process.exitCode = 64;
    return;
  }

  const sourceManifestPath = process.env.V1_TASK_SOURCE_MANIFEST_PATH;
  if (!sourceManifestPath) {
    // The wrapper sets this for every payload (see header comment). Its absence means this
    // script was invoked outside run-v1-task-verification.mjs's --final-gate lifecycle.
    process.stderr.write('FINAL_GATE_WIRING_MISSING: V1_TASK_SOURCE_MANIFEST_PATH is not set; this script must be run as the payload of run-v1-task-verification.mjs --final-gate\n');
    process.exitCode = 70;
    return;
  }
  const attemptDir = dirname(resolve(sourceManifestPath));

  const repoRoot = options['repo-root'] && options['repo-root'] !== true
    ? resolve(options['repo-root'])
    : process.cwd();

  const context = { repoRoot, options, env: process.env };
  let checks;
  try {
    if (gateId === 'F1') checks = runF1(context);
    else if (gateId === 'F2') checks = runF2(context);
    else if (gateId === 'F3') checks = await runF3(context);
    else checks = await runF4(context);
  } catch (error) {
    checks = [check('gate-crash', 'Gate evaluation completed without an unhandled error', 'blocked', error.message, error.code ?? 'FINAL_GATE_CRASH')];
  }

  checks.unshift(check(
    'gate-identity',
    'CLI --gate matches the wrapper-bound V1_TASK_GATE_ID',
    process.env.V1_TASK_GATE_ID === gateId ? 'pass' : 'fail',
    `cli=${gateId} env=${process.env.V1_TASK_GATE_ID ?? 'unset'}`,
    process.env.V1_TASK_GATE_ID === gateId ? undefined : 'FINAL_GATE_IDENTITY_MISMATCH',
  ));

  const failed = checks.filter((c) => c.status !== 'pass');
  const verdict = failed.length === 0 ? 'APPROVE' : 'REJECT';
  const evidence = {
    schemaVersion: 1,
    gate: gateId,
    phase: typeof options.phase === 'string' ? options.phase : null,
    attemptId: process.env.V1_TASK_ATTEMPT_ID ?? null,
    repoRoot,
    sourceManifestPath,
    sourceManifestSHA: process.env.V1_TASK_SOURCE_MANIFEST_SHA ?? null,
    candidateReceiptPath: process.env.V1_CANDIDATE_RECEIPT_PATH ?? null,
    candidateReceiptSHA: process.env.V1_CANDIDATE_RECEIPT_SHA ?? null,
    checks,
    verdict,
    blockingCodes: [...new Set(failed.map((c) => c.code).filter(Boolean))],
    createdAt: new Date().toISOString(),
  };

  let output;
  try {
    const written = writeEvidenceImmutable(resolve(attemptDir, 'final', `${gateId}.json`), evidence);
    output = { ...evidence, evidencePath: written.path, evidenceSHA: written.sha256 };
  } catch (error) {
    // Evidence could not be written (e.g. a real EEXIST collision on retry). Surface this as
    // its own hard failure — do not silently report a verdict with no durable evidence.
    process.stderr.write(`${error.code ?? 'FINAL_EVIDENCE_WRITE_FAILED'}: ${error.message}\n`);
    process.exitCode = 76;
    return;
  }

  if (verdict === 'APPROVE') {
    process.stdout.write(`${JSON.stringify(output)}\n`);
    return;
  }
  process.stderr.write(`${JSON.stringify(output)}\n`);
  process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    process.stderr.write(`${error.code ?? 'FINAL_GATE_CRASH'}: ${error.message}\n`);
    process.exitCode = 70;
  });
}

export { parseArgs, matchesForbidden, parseLedgerJSON };
