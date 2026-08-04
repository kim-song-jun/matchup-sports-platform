#!/usr/bin/env node
// Generates the immutable "candidate receipt" that scripts/qa/run-v1-task-verification.mjs's
// verifyCandidate() consumes via --candidate-receipt/--candidate-receipt-sha (or the
// V1_CANDIDATE_RECEIPT_PATH/V1_CANDIDATE_RECEIPT_SHA env pair) whenever a run needs
// `phase === 'candidate'` binding -- Task 27's --adopt-candidate-attempt, every
// --registry-child run, and every --final-gate F1..F4 invocation.
//
// WHY this exists as a separate script: the wrapper only ever VERIFIES an existing candidate
// receipt against the frozen Task-1 clean-restart authority chain -- it has no write path. This
// is the write-side counterpart. It deliberately reuses the wrapper's own canonicalization /
// sha256 / immutable-write primitives (see the named imports below) instead of re-deriving them,
// because the receipt this script writes must be byte-identical -- under sha256 -- to what
// verifyCandidate() recomputes at consume time; a second hand-rolled JSON.stringify/hashing path
// here would silently drift the moment either copy changed key order, whitespace, or newline
// handling.
//
// Canonical invocation (.omo/plans/teameet-team-tournament-operations-v1.md Todo 27):
//   node scripts/qa/run-v1-release-candidate.mjs --capture-only --phase local-precleanup \
//     --plan-sha "$OMO_SELECTED_PLAN_SHA" \
//     --receipt-dir /private/tmp/teameet-ulw-evidence/teameet-team-tournament-operations-v1
//
// --phase is accepted (and validated against the wrapper's own phase vocabulary) purely as a
// caller-intent label for logs; the receipt's own `phase` field is always the literal string
// 'candidate' regardless, because that is the one and only value verifyCandidate() accepts there
// -- do not confuse the two (see the CLI flag vs. the receipt field).
//
// Optional:
//   --source-manifest-path <path> --source-manifest-sha <sha256>
//     Explicit pointer to a pre-existing, Task-1-bound source-manifest.json to bind into the
//     receipt. When omitted, this script auto-discovers one under
//     <receipt-dir>/tree-sha256/*/attempt-*/source-manifest.json.
//   --ledger <path>
//     Overrides the Task127 ledger markdown (defaults to the wrapper's own DEFAULT_LEDGER).
//
// On the source manifest: the receipt's sourceManifestPath/sourceManifestSHA/sourceTreeSHA/
// ownedPathBlobs fields all bind to a source-manifest.json whose own `headSHA` field must equal
// the wrapper's hardcoded TASK_ONE_RESTART_HEAD_SHA (verifyCandidate() checks this literally) --
// NOT today's live candidateSHA. That manifest can only be produced by createSourceSnapshot()
// running with a repoRoot whose HEAD is checked out exactly at that frozen commit (it reads
// `git rev-parse HEAD` of its repoRoot verbatim into the manifest's headSHA). This script's own
// repoRoot is the live `dev` checkout, not that pinned commit, and the hard rules for this task
// forbid creating any worktree/checkout to manufacture one. So this script never fabricates that
// manifest -- it only validates and re-binds one someone else already produced, mirroring the
// wrapper's own createCandidateSourceSnapshot() reuse pattern for already-verified candidates.
// It then re-runs the wrapper's verifyCommittedSnapshot() against that manifest as a precondition,
// so a manifest whose frozen headSHA content has since drifted from live HEAD (i.e. Task 1's
// owned files were edited again after TASK_ONE_RESTART_HEAD_SHA landed) is rejected here, loudly,
// instead of producing a receipt that would only fail much later inside verifyCandidate() itself.

import { randomUUID } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs';
import { isAbsolute, resolve, sep } from 'node:path';
import {
  DEFAULT_EVIDENCE_ROOT,
  DEFAULT_LEDGER,
  HarnessError,
  TASK_ONE_BASELINE_SHA,
  TASK_ONE_RECEIPTS,
  TASK_ONE_RESTART_HEAD_SHA,
  TASK_ONE_WORKLOAD,
  createCandidateSourceSnapshot,
  exactKeys,
  git,
  immutableWrite,
  ownershipRow,
  parseLedger,
  readPlan,
  secureImmutableDescriptor,
  sha256,
  stable,
  verifyCommittedSnapshot,
  verifyOwnedPathsClean,
  verifyTaskOneDirty,
} from './run-v1-task-verification.mjs';

// Mirrors the wrapper's own inline phase allow-list (main(), around the `phase` local) --
// duplicated here as a plain literal because the wrapper does not export it as a named constant
// and it is a one-line vocabulary check, not canonicalization/hashing/write logic.
const PHASE_ALLOWLIST = new Set(['initial', 'clean-restart', 'standalone', 'candidate', 'local-precleanup']);

const BOOLEAN_FLAGS = new Set(['capture-only']);
const VALUE_FLAGS = new Set([
  'phase',
  'plan-sha',
  'receipt-dir',
  'ledger',
  'source-manifest-path',
  'source-manifest-sha',
]);

const REQUIRED_RECEIPT_KEYS = [
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

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      throw new HarnessError('MALFORMED_INPUT', `Unexpected argument: ${token}`, 64);
    }
    const name = token.slice(2);
    if (BOOLEAN_FLAGS.has(name)) {
      if (options[name] !== undefined) {
        throw new HarnessError('MALFORMED_INPUT', `Duplicate option: ${token}`, 64);
      }
      options[name] = true;
      continue;
    }
    if (!VALUE_FLAGS.has(name)) {
      throw new HarnessError('MALFORMED_INPUT', `Unsupported option: ${token}`, 64);
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new HarnessError('MALFORMED_INPUT', `Missing value for ${token}`, 64);
    }
    if (options[name] !== undefined) {
      throw new HarnessError('MALFORMED_INPUT', `Duplicate option: ${token}`, 64);
    }
    options[name] = value;
    index += 1;
  }
  return options;
}

// Defense-in-depth ahead of createCandidateSourceSnapshot()'s own `mkdirSync(..., {recursive:
// true})`: recursive mkdir happily creates directories *through* an existing symlink component,
// so a receipt-dir with a symlinked ancestor could land evidence somewhere the caller never
// intended. Walk every already-existing path segment and refuse the first symlink found.
function assertNoSymlinkAncestors(targetPath) {
  const isPosixAbsolute = targetPath.startsWith(sep);
  const segments = targetPath.split(sep).filter(Boolean);
  let current = isPosixAbsolute ? sep : '';
  for (const segment of segments) {
    current = current === sep || current === '' ? `${current}${segment}` : `${current}${sep}${segment}`;
    if (!existsSync(current)) continue;
    const stat = lstatSync(current);
    if (stat.isSymbolicLink()) {
      throw new HarnessError(
        'RECEIPT_DIR_INVALID',
        `Receipt directory path contains a symlink component: ${current}`,
        66,
      );
    }
  }
}

// Scans <receiptDirRoot>/tree-sha256/*/attempt-*/source-manifest.json for one that already
// satisfies the Task-1/candidate binding checks verifyCandidate() applies (schemaVersion, task,
// baselineSHA, headSHA, ownedPaths) -- see the file header for why this script cannot generate
// one itself. Returns the newest qualifying manifest's path (by its own createdAt), or null.
function discoverQualifyingManifest(receiptDirRoot, ownedPaths) {
  const treeRoot = resolve(receiptDirRoot, 'tree-sha256');
  if (!existsSync(treeRoot)) return null;
  const expectedOwnedPaths = JSON.stringify(ownedPaths);
  const candidates = [];
  for (const treeEntry of readdirSync(treeRoot, { withFileTypes: true })) {
    if (!treeEntry.isDirectory()) continue;
    const attemptsRoot = resolve(treeRoot, treeEntry.name);
    let attemptEntries;
    try {
      attemptEntries = readdirSync(attemptsRoot, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const attemptEntry of attemptEntries) {
      if (!attemptEntry.isDirectory() || !attemptEntry.name.startsWith('attempt-')) continue;
      const manifestPath = resolve(attemptsRoot, attemptEntry.name, 'source-manifest.json');
      if (!existsSync(manifestPath)) continue;
      let parsed;
      try {
        parsed = JSON.parse(readFileSync(manifestPath, 'utf8'));
      } catch {
        continue;
      }
      if (
        parsed.schemaVersion === 2 &&
        parsed.task === 1 &&
        parsed.baselineSHA === TASK_ONE_BASELINE_SHA &&
        parsed.headSHA === TASK_ONE_RESTART_HEAD_SHA &&
        JSON.stringify(parsed.ownedPaths) === expectedOwnedPaths
      ) {
        candidates.push({ path: manifestPath, createdAt: String(parsed.createdAt ?? '') });
      }
    }
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
  return candidates[0].path;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options['capture-only'] !== true) {
    throw new HarnessError(
      'MALFORMED_INPUT',
      '--capture-only is required: this generator only ever reads git/filesystem state and writes '
        + 'one immutable receipt, and the flag makes that caller intent explicit and checkable',
      64,
    );
  }
  const phase = options.phase;
  if (!phase || !PHASE_ALLOWLIST.has(phase)) {
    throw new HarnessError(
      'MALFORMED_INPUT',
      `--phase must be one of ${[...PHASE_ALLOWLIST].join('|')}`,
      64,
    );
  }
  const planSHAArg = options['plan-sha'];
  if (!planSHAArg || !/^[0-9a-f]{64}$/.test(planSHAArg)) {
    throw new HarnessError('MALFORMED_INPUT', '--plan-sha must be a 64-hex-character sha256', 64);
  }
  if ((options['source-manifest-path'] === undefined) !== (options['source-manifest-sha'] === undefined)) {
    throw new HarnessError(
      'MALFORMED_INPUT',
      '--source-manifest-path and --source-manifest-sha must be supplied together',
      64,
    );
  }

  const receiptDir = resolve(options['receipt-dir'] ?? DEFAULT_EVIDENCE_ROOT);
  if (!isAbsolute(receiptDir)) {
    throw new HarnessError('RECEIPT_DIR_INVALID', '--receipt-dir must be an absolute path', 66);
  }
  assertNoSymlinkAncestors(receiptDir);
  if (existsSync(receiptDir)) {
    const stat = lstatSync(receiptDir);
    if (stat.isSymbolicLink() || !stat.isDirectory()) {
      throw new HarnessError(
        'RECEIPT_DIR_INVALID',
        `--receipt-dir must be a real directory, not a symlink or file: ${receiptDir}`,
        66,
      );
    }
  }

  const repoRoot = process.cwd();
  const branch = git(['branch', '--show-current'], { cwd: repoRoot }).trim();
  if (branch !== 'dev') {
    throw new HarnessError(
      'BASELINE_INPUT_DRIFT',
      `Release-candidate receipts may only be generated from the dev branch; observed ${branch}`,
      68,
    );
  }

  const ledger = parseLedger(resolve(repoRoot, options.ledger ?? DEFAULT_LEDGER));
  if (ledger.baselineSHA !== TASK_ONE_BASELINE_SHA) {
    throw new HarnessError(
      'CANDIDATE_BINDING_MISMATCH',
      "Ledger baselineSHA no longer matches the wrapper's frozen TASK_ONE_BASELINE_SHA",
      68,
    );
  }

  const plan = readPlan(repoRoot);
  const selectedPlanSHA = process.env.OMO_SELECTED_PLAN_SHA;
  if (!selectedPlanSHA || selectedPlanSHA !== plan.normalizedSHA) {
    throw new HarnessError(
      'PLAN_DIGEST_MISMATCH',
      'OMO_SELECTED_PLAN_SHA must exactly match the checkbox-normalized live plan',
      65,
    );
  }
  if (planSHAArg !== selectedPlanSHA) {
    throw new HarnessError('PLAN_DIGEST_MISMATCH', '--plan-sha must equal OMO_SELECTED_PLAN_SHA', 65);
  }
  const planSHA = selectedPlanSHA;

  const liveHead = git(['rev-parse', 'HEAD'], { cwd: repoRoot }).trim();
  if (!/^[0-9a-f]{40}$/.test(liveHead)) {
    throw new HarnessError('GIT_STATE_UNAVAILABLE', 'HEAD did not resolve to a 40-hex commit', 69);
  }

  const ownedPaths = ownershipRow(ledger, 1).outputs;
  verifyOwnedPathsClean(repoRoot, ownedPaths);
  verifyTaskOneDirty(repoRoot, ledger);

  // Frozen Task-1 authority chain: existence + immutability + integrity only here. Their content
  // is embedded verbatim into the receipt below as {path, sha256} pairs, never copied field-by-
  // field, so the receipt cannot itself drift from what TASK_ONE_RECEIPTS declares.
  const approval = secureImmutableDescriptor(
    TASK_ONE_RECEIPTS.approval.path,
    TASK_ONE_RECEIPTS.approval.sha256,
    'CANDIDATE_BINDING_MISMATCH',
  );
  const cursor = secureImmutableDescriptor(
    TASK_ONE_RECEIPTS.cursor.path,
    TASK_ONE_RECEIPTS.cursor.sha256,
    'CANDIDATE_BINDING_MISMATCH',
  );
  const override = secureImmutableDescriptor(
    TASK_ONE_RECEIPTS.override.path,
    TASK_ONE_RECEIPTS.override.sha256,
    'CANDIDATE_BINDING_MISMATCH',
  );
  const consumption = secureImmutableDescriptor(
    TASK_ONE_RECEIPTS.consumption.path,
    TASK_ONE_RECEIPTS.consumption.sha256,
    'CANDIDATE_BINDING_MISMATCH',
  );
  // Rollback receipt: verifyCandidate() requires it exist as a valid immutable descriptor bound
  // to TASK_ONE_RECEIPTS.rollback, but never embeds it in the candidate receipt schema itself.
  secureImmutableDescriptor(
    TASK_ONE_RECEIPTS.rollback.path,
    TASK_ONE_RECEIPTS.rollback.sha256,
    'CANDIDATE_BINDING_MISMATCH',
  );

  // Same cross-chain equality checks verifyCandidate() performs on these four receipts (minus the
  // host-supervisor receipt, which is supplied at *consume* time via --require-host-supervisor-
  // receipt[-sha] and is not part of the candidate receipt's own schema). Run here so a stale
  // plan SHA or a broken authority chain fails this generator loudly instead of producing a
  // receipt that verifyCandidate() would reject anyway.
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
    consumption.receipt.overrideReceipt?.sha256 !== override.sha256
  ) {
    throw new HarnessError(
      'CANDIDATE_BINDING_MISMATCH',
      'Task-1 authority receipts do not bind the current plan SHA / clean-restart chain',
      68,
    );
  }

  // Source manifest (see file header for why this can only be reused, never generated here).
  let manifestPath = options['source-manifest-path'];
  let manifestSHA = options['source-manifest-sha'];
  if (!manifestPath) {
    const discovered = discoverQualifyingManifest(receiptDir, ownedPaths);
    if (!discovered) {
      throw new HarnessError(
        'SOURCE_MANIFEST_MISSING',
        'No Task-1-bound source manifest (schemaVersion=2, task=1, headSHA='
          + `${TASK_ONE_RESTART_HEAD_SHA}) found under ${receiptDir}/tree-sha256. One must be `
          + 'produced first by a process whose repoRoot HEAD is checked out at that exact commit, '
          + 'then passed via --source-manifest-path/--source-manifest-sha.',
        67,
      );
    }
    manifestPath = discovered;
    manifestSHA = sha256(readFileSync(discovered));
  }
  const sourceManifest = secureImmutableDescriptor(
    manifestPath,
    manifestSHA,
    'CANDIDATE_BINDING_MISMATCH',
    68,
    true,
  );
  if (
    sourceManifest.receipt.schemaVersion !== 2 ||
    sourceManifest.receipt.task !== 1 ||
    sourceManifest.receipt.baselineSHA !== TASK_ONE_BASELINE_SHA ||
    sourceManifest.receipt.headSHA !== TASK_ONE_RESTART_HEAD_SHA ||
    JSON.stringify(sourceManifest.receipt.ownedPaths) !== JSON.stringify(ownedPaths)
  ) {
    throw new HarnessError(
      'CANDIDATE_BINDING_MISMATCH',
      'Supplied source manifest does not bind the Task-1 clean-restart source tree',
      68,
    );
  }
  // This is the check that rejects a manifest whose frozen content has since drifted from live
  // HEAD (Task 1's owned files edited again after TASK_ONE_RESTART_HEAD_SHA) -- fail here rather
  // than emit a receipt verifyCandidate()'s identical downstream call would reject anyway.
  verifyCommittedSnapshot(repoRoot, sourceManifest.receipt);

  const attemptId = randomUUID();
  const snapshot = createCandidateSourceSnapshot(
    repoRoot,
    { sourceManifest, receipt: { candidateSHA: liveHead } },
    attemptId,
    receiptDir,
  );

  const postHead = git(['rev-parse', 'HEAD'], { cwd: repoRoot }).trim();
  if (postHead !== liveHead) {
    throw new HarnessError(
      'CANDIDATE_HEAD_DRIFTED',
      `HEAD moved while generating the candidate receipt: ${liveHead} -> ${postHead}`,
      68,
    );
  }

  const ownedPathBlobs = snapshot.entries.map((entry) => ({
    path: entry.path,
    mode: entry.candidate?.mode,
    blobSHA: entry.candidate?.blob,
  }));

  const receipt = {
    schemaVersion: 1,
    phase: 'candidate',
    baselineSHA: ledger.baselineSHA,
    restartHeadSHA: TASK_ONE_RESTART_HEAD_SHA,
    candidateSHA: liveHead,
    sourceTreeSHA: snapshot.sourceTreeSHA,
    sourceManifestPath: snapshot.sourceManifestPath,
    sourceManifestSHA: snapshot.sourceManifestSHA,
    planSHA,
    approvalReceipt: { path: TASK_ONE_RECEIPTS.approval.path, sha256: TASK_ONE_RECEIPTS.approval.sha256 },
    task127CursorReceipt: { path: TASK_ONE_RECEIPTS.cursor.path, sha256: TASK_ONE_RECEIPTS.cursor.sha256 },
    overrideReceipt: { path: TASK_ONE_RECEIPTS.override.path, sha256: TASK_ONE_RECEIPTS.override.sha256 },
    consumptionReceipt: {
      path: TASK_ONE_RECEIPTS.consumption.path,
      sha256: TASK_ONE_RECEIPTS.consumption.sha256,
    },
    ownedPathBlobs,
    createdAt: new Date().toISOString(),
  };

  if (!exactKeys(receipt, REQUIRED_RECEIPT_KEYS)) {
    throw new HarnessError(
      'CANDIDATE_BINDING_MISMATCH',
      'Internal: generated receipt does not have the exact 15-key candidate schema',
      70,
    );
  }

  // Byte-exact canonical JSON with NO trailing newline: verifyCandidate()'s own
  // secureImmutableDescriptor() call for this exact file omits allowCanonicalNewline (defaults to
  // false), unlike its call for the source manifest above. immutableWrite() only appends a
  // newline when given a non-Buffer value (via canonicalBytes()); passing a pre-built Buffer here
  // bypasses that path entirely, so what lands on disk is exactly what secureImmutableDescriptor()
  // will recompute (`JSON.stringify(stable(receipt))`) at consume time.
  const canonicalReceiptBytes = Buffer.from(JSON.stringify(stable(receipt)), 'utf8');
  const receiptFilePath = resolve(receiptDir, `candidate-${liveHead}-${attemptId}.json`);
  const written = immutableWrite(receiptFilePath, canonicalReceiptBytes);

  process.stdout.write(`export V1_RELEASE_CANDIDATE_ATTEMPT_ID=${attemptId}\n`);
  process.stdout.write(`export V1_CANDIDATE_RECEIPT_PATH=${written.path}\n`);
  process.stdout.write(`export V1_CANDIDATE_RECEIPT_SHA=${written.sha256}\n`);
}

main().catch((error) => {
  const code = error instanceof HarnessError ? error.code : 'V1_RELEASE_CANDIDATE_CRASH';
  process.stderr.write(`${code}: ${error.message}\n`);
  process.exitCode = error instanceof HarnessError ? error.exitCode : 70;
});
