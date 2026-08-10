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
//   --emit-source-manifest
//     Generates the Task-1-bound source-manifest.json directly instead of requiring one produced
//     elsewhere. Internally calls the wrapper's own createSourceSnapshot(repoRoot, ledger, 1,
//     attemptId, receiptDir, /* candidateSHA */ null, /* headSHA */ TASK_ONE_RESTART_HEAD_SHA).
//     The headSHA argument only pins the manifest's own `headSHA` field (and the `head` comparison
//     column verifyCommittedSnapshot() recomputes from it) -- it does NOT touch the candidate side
//     of the manifest. createSourceSnapshot() always derives the candidate slot from
//     privateIndexTree()'s `git read-tree HEAD` + working-tree state of *this script's own*
//     repoRoot (i.e. today's live checkout), a code path that is completely independent of the
//     headSHA argument. That independence is what makes this safe: pinning headSHA to the frozen
//     commit does not require actually checking that commit out, and cannot smuggle stale content
//     into the candidate side of the receipt. Mutually exclusive with --source-manifest-path/
//     --source-manifest-sha below (pick one manifest source, not both).
//   --source-manifest-path <path> --source-manifest-sha <sha256>
//     Explicit pointer to a pre-existing, Task-1-bound source-manifest.json to bind into the
//     receipt. When neither this nor --emit-source-manifest is given, this script auto-discovers
//     one under <receipt-dir>/tree-sha256/*/attempt-*/source-manifest.json.
//   --ledger <path>
//     Overrides the Task127 ledger markdown (defaults to the wrapper's own DEFAULT_LEDGER).
//
// On the source manifest: the receipt's sourceManifestPath/sourceManifestSHA/sourceTreeSHA/
// ownedPathBlobs fields all bind to a source-manifest.json whose own `headSHA` field must equal
// the wrapper's hardcoded TASK_ONE_RESTART_HEAD_SHA (verifyCandidate() checks this literally) --
// NOT today's live candidateSHA. Before the wrapper's createSourceSnapshot() accepted an explicit
// headSHA argument, the only way to produce such a manifest was a repoRoot whose HEAD was checked
// out exactly at that frozen commit (it used to read `git rev-parse HEAD` of its repoRoot verbatim
// into the manifest's headSHA), which this script's own repoRoot -- the live `dev`/integration-
// branch checkout -- never is, and the hard rules for this task forbid creating any worktree/
// checkout to manufacture one. Now that the argument exists (see --emit-source-manifest above),
// this script can bind that field without a checkout; it still never invents the *candidate* side
// of the receipt -- that always comes from this repoRoot's own live tree, mirroring the wrapper's
// own createCandidateSourceSnapshot() reuse pattern for already-verified candidates. Either way
// (emitted here, or supplied/discovered), the manifest is re-verified via the wrapper's own
// verifyCommittedSnapshot() as a precondition, so a manifest whose frozen headSHA content has
// since drifted from live HEAD (i.e. Task 1's owned files were edited again after
// TASK_ONE_RESTART_HEAD_SHA landed) is rejected here, loudly, instead of producing a receipt that
// would only fail much later inside verifyCandidate() itself.

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
  createSourceSnapshot,
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
// createSourceSnapshot is the wrapper's write-side primitive for producing a Task-1-bound
// source-manifest.json (see createCandidateSourceSnapshot's read-side counterpart above). It is
// consumed here only under --emit-source-manifest, with its 7th (headSHA) argument pinned to
// TASK_ONE_RESTART_HEAD_SHA -- see the file header for why that does not fabricate the candidate
// side of the receipt. The wrapper must export it with that parameterized signature; this file
// does not (and, per this task's hard rules, must not) redefine or re-derive it locally.

// Mirrors the wrapper's own inline phase allow-list (main(), around the `phase` local) --
// duplicated here as a plain literal because the wrapper does not export it as a named constant
// and it is a one-line vocabulary check, not canonicalization/hashing/write logic.
const PHASE_ALLOWLIST = new Set(['initial', 'clean-restart', 'standalone', 'candidate', 'local-precleanup']);

// Which branches this generator may run from. Originally a bare literal-'dev' check. The F1-F4
// headSHA-argument work (Todo 27) is actually driven from the pre-merge integration branch
// codex/teameet-task9-ci, not dev itself -- receipts get produced and verified there before that
// branch lands on dev. Widening this to "any branch" would defeat the whole point of the check
// (refusing to mint release-candidate receipts from unvetted branches), so exactly these two
// literal branch names are allowed and nothing else -- in particular this does NOT special-case
// task-27's own working branch (codex/teameet-task27-release-gates); that branch still hits
// BASELINE_INPUT_DRIFT below like any other non-listed branch, matching the design's rejection of
// exempting it.
const ALLOWED_RELEASE_CANDIDATE_BRANCHES = new Set(['dev', 'codex/teameet-task9-ci']);

const BOOLEAN_FLAGS = new Set(['capture-only', 'emit-source-manifest']);
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
// baselineSHA, headSHA, ownedPaths). Only reached when the caller passed neither
// --source-manifest-path nor --emit-source-manifest (see the file header for the full
// precedence) -- e.g. reusing a manifest a previous --emit-source-manifest run already produced
// under this same receiptDir, without regenerating it. Returns the newest qualifying manifest's
// path (by its own createdAt), or null.
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
  // Two ways to bind a source manifest -- generate it here (--emit-source-manifest) or point at
  // one already produced (--source-manifest-path/-sha) -- must not both be given: silently
  // preferring one over the other would be exactly the kind of ambiguous-skipping this repo's
  // engineering principles forbid, so reject the combination outright instead of guessing intent.
  if (options['emit-source-manifest'] === true && options['source-manifest-path'] !== undefined) {
    throw new HarnessError(
      'MALFORMED_INPUT',
      '--emit-source-manifest and --source-manifest-path/--source-manifest-sha are mutually '
        + 'exclusive: the former generates a fresh Task-1-bound manifest, the latter binds an '
        + 'already-produced one',
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
  if (!ALLOWED_RELEASE_CANDIDATE_BRANCHES.has(branch)) {
    throw new HarnessError(
      'BASELINE_INPUT_DRIFT',
      'Release-candidate receipts may only be generated from '
        + `${[...ALLOWED_RELEASE_CANDIDATE_BRANCHES].join(' or ')}; observed ${branch}`,
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

  // Source manifest (see file header for the --emit-source-manifest / discovery / explicit-path
  // precedence and why binding headSHA here never fabricates the candidate side of the receipt).
  let manifestPath = options['source-manifest-path'];
  let manifestSHA = options['source-manifest-sha'];
  if (!manifestPath && options['emit-source-manifest'] === true) {
    // Direct generation: reuse the wrapper's own write primitive rather than hand-rolling a second
    // manifest-shaping path here (same rationale as the file header gives for reusing its
    // canonicalization/sha256/immutable-write primitives). candidateSHA stays null so
    // privateIndexTree() keeps deriving the candidate slot from *this* repoRoot's live checkout;
    // headSHA is pinned to TASK_ONE_RESTART_HEAD_SHA so the manifest's own headSHA field (and the
    // `head` comparison column verifyCommittedSnapshot() below recomputes from it) match what
    // verifyCandidate() requires downstream, without checking that frozen commit out anywhere.
    const manifestAttemptId = randomUUID();
    const generatedSnapshot = createSourceSnapshot(
      repoRoot,
      ledger,
      1,
      manifestAttemptId,
      receiptDir,
      null,
      TASK_ONE_RESTART_HEAD_SHA,
    );
    manifestPath = generatedSnapshot.sourceManifestPath;
    manifestSHA = generatedSnapshot.sourceManifestSHA;
  }
  if (!manifestPath) {
    const discovered = discoverQualifyingManifest(receiptDir, ownedPaths);
    if (!discovered) {
      throw new HarnessError(
        'SOURCE_MANIFEST_MISSING',
        'No Task-1-bound source manifest (schemaVersion=2, task=1, headSHA='
          + `${TASK_ONE_RESTART_HEAD_SHA}) found under ${receiptDir}/tree-sha256. Pass `
          + '--emit-source-manifest to generate one now, or produce it elsewhere and pass it via '
          + '--source-manifest-path/--source-manifest-sha.',
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
