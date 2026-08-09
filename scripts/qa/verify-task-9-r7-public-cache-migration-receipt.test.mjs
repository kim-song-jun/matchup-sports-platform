import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, cpSync, existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  MIGRATION_PATH,
  PLAN_PATH,
  R6_RECEIPT_PATH,
  R7_RECEIPT_PATH,
  TERMINAL_DONE_CLAIM_PATH,
  descriptorReadRegular,
  runBoundedChild,
  runExactReceiptHarness,
} from './verify-task-9-r7-public-cache-migration-receipt.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const verifier = path.join(repoRoot, 'scripts/qa/verify-task-9-r7-public-cache-migration-receipt.mjs');

function port18130Listeners() {
  const result = spawnSync('lsof', ['-nP', '-iTCP:18130', '-sTCP:LISTEN'], { encoding: 'utf8' });
  if (result.status === 1) return 0;
  assert.equal(result.status, 0, result.stderr || 'lsof failed');
  return result.stdout.trim().split('\n').filter(Boolean).length - 1;
}

function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'task9-r7-receipt-'));
  for (const relative of [PLAN_PATH, '.github/tasks/127-v1-team-tournament-operations-game-record.md', R6_RECEIPT_PATH, R7_RECEIPT_PATH, TERMINAL_DONE_CLAIM_PATH]) {
    const source = path.join(repoRoot, relative);
    const target = path.join(root, relative);
    mkdirSync(path.dirname(target), { recursive: true });
    cpSync(source, target);
  }
  mkdirSync(path.join(root, MIGRATION_PATH), { recursive: true });
  chmodSync(path.join(root, R6_RECEIPT_PATH), 0o444);
  chmodSync(path.join(root, R7_RECEIPT_PATH), 0o444);
  return root;
}

function changeReceipt(root, change) {
  const receiptPath = path.join(root, R7_RECEIPT_PATH);
  chmodSync(receiptPath, 0o644);
  const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
  change(receipt);
  writeFileSync(receiptPath, JSON.stringify(receipt));
  chmodSync(receiptPath, 0o444);
}

async function withFixture(run) {
  const root = fixture();
  try {
    return await run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
    assert.equal(existsSync(root), false, 'temporary fixture must be removed');
  }
}

test('default exact descriptor invocation passes three serial runs without residue', async () => {
  const result = await runExactReceiptHarness({ repoRoot });
  assert.equal(result.verdict, 'PASS');
  assert.equal(result.runs.length, 3);
  assert.deepEqual(result.interactions, { prompts: 0, cancellations: 0 });
  assert.equal(result.cleanup.childClosures.length, 3);
  assert.equal(result.cleanup.noLiveOwnedChildren, true);
  assert.ok(result.cleanup.childClosures.every((closure) => closure.closeObserved && !closure.processAliveAfterClose));
});

test('rejects missing migration, path order, stale R6, session, plan, and load-authority drift', async () => {
  await withFixture(async (root) => {
    rmSync(path.join(root, MIGRATION_PATH), { recursive: true });
    await assert.rejects(runExactReceiptHarness({ repoRoot: root }), { code: 'PUBLIC_CACHE_MIGRATION_MISSING' });
  });
  await withFixture(async (root) => {
    changeReceipt(root, (receipt) => { [receipt.ownedPaths[19], receipt.ownedPaths[20]] = [receipt.ownedPaths[20], receipt.ownedPaths[19]]; });
    await assert.rejects(runExactReceiptHarness({ repoRoot: root }), { code: 'R7_OWNERSHIP_ORDER' });
  });
  await withFixture(async (root) => {
    const r7 = path.join(root, R7_RECEIPT_PATH);
    chmodSync(r7, 0o644);
    cpSync(path.join(root, R6_RECEIPT_PATH), r7);
    chmodSync(r7, 0o444);
    await assert.rejects(runExactReceiptHarness({ repoRoot: root }), { code: 'RECEIPT_PLAN_SHA' });
  });
  for (const [name, change, code] of [
    ['session', (receipt) => { receipt.sessionId = 'codex:wrong'; }, 'RECEIPT_SESSION'],
    ['plan', (receipt) => { receipt.planPath = '.omo/plans/wrong.md'; }, 'RECEIPT_PLAN_PATH'],
    ['load', (receipt) => { receipt.scope = 'anything'; }, 'RECEIPT_LOAD_SCOPE'],
  ]) {
    await withFixture(async (root) => {
      changeReceipt(root, change);
      await assert.rejects(runExactReceiptHarness({ repoRoot: root }), { code });
    });
  }
});

test('rejects malformed payloads, symlinks, hardlinks, malformed CLI arguments, and success-shaped nonzero children', async () => {
  await withFixture(async (root) => {
    const receiptPath = path.join(root, R7_RECEIPT_PATH);
    chmodSync(receiptPath, 0o644);
    writeFileSync(receiptPath, '{"schemaVersion":1,"schemaVersion":1}');
    chmodSync(receiptPath, 0o444);
    await assert.rejects(runExactReceiptHarness({ repoRoot: root }), { code: 'DUPLICATE_JSON_KEY' });
  });
  const linkRoot = mkdtempSync(path.join(os.tmpdir(), 'task9-r7-links-'));
  try {
    const source = path.join(repoRoot, R7_RECEIPT_PATH);
    const hard = path.join(linkRoot, 'receipt-hard.json');
    const sym = path.join(linkRoot, 'receipt-sym.json');
    linkSync(source, hard);
    symlinkSync(source, sym);
    assert.throws(() => descriptorReadRegular(hard, { immutable: true }), { code: 'RECEIPT_LINK_COUNT' });
    assert.throws(() => descriptorReadRegular(sym, { immutable: true }), { code: 'DESCRIPTOR_NOT_REGULAR' });
  } finally {
    rmSync(linkRoot, { recursive: true, force: true });
    assert.equal(existsSync(linkRoot), false, 'hardlink/symlink temp directory must be removed');
  }
  const malformed = spawnSync(process.execPath, [verifier, '--dry-run'], { encoding: 'utf8' });
  assert.notEqual(malformed.status, 0);
  assert.match(malformed.stderr, /MALFORMED_ARGUMENTS/);
  await assert.rejects(
    runBoundedChild({ command: process.execPath, args: ['-e', 'console.log("PASS"); process.exit(1)'] }),
    (error) => {
      assert.equal(error.code, 'CHILD_NONZERO');
      assert.deepEqual(error.cleanup, {
        pid: error.cleanup.pid,
        closeObserved: true,
        exitCode: 1,
        signal: null,
        processAliveAfterClose: false,
        termination: { termSent: false, killSent: false },
        stdout: 'PASS',
        stderr: '',
      });
      return true;
    },
  );
});

test('forces SIGKILL after a real hanging child ignores SIGTERM, then leaves no residue', async () => {
  let timeoutCleanup;
  await assert.rejects(
    runBoundedChild({ command: process.execPath, args: ['-e', 'process.on("SIGTERM", () => process.stdout.write("SIGTERM_IGNORED\\n")); setInterval(() => {}, 1_000)'], timeoutMs: 100 }),
    (error) => {
      assert.equal(error.code, 'CHILD_TIMEOUT');
      timeoutCleanup = error.cleanup;
      assert.equal(timeoutCleanup.closeObserved, true);
      assert.equal(timeoutCleanup.processAliveAfterClose, false);
      assert.equal(timeoutCleanup.signal, 'SIGKILL');
      assert.deepEqual(timeoutCleanup.termination, { termSent: true, killSent: true });
      assert.equal(timeoutCleanup.stdout, 'SIGTERM_IGNORED');
      return true;
    },
  );
  const postTestCleanup = {
    timedOutChildPid: timeoutCleanup.pid,
    timedOutChildAlive: timeoutCleanup.processAliveAfterClose,
    termSent: timeoutCleanup.termination.termSent,
    killSent: timeoutCleanup.termination.killSent,
    closeSignal: timeoutCleanup.signal,
    port18130Listeners: port18130Listeners(),
  };
  process.stdout.write(`TASK9_R7_POST_TEST_CLEANUP=${JSON.stringify(postTestCleanup)}\n`);
  assert.deepEqual(postTestCleanup, {
    timedOutChildPid: timeoutCleanup.pid,
    timedOutChildAlive: false,
    termSent: true,
    killSent: true,
    closeSignal: 'SIGKILL',
    port18130Listeners: 0,
  });
});

test('CLI default remains the exact no-argument descriptor invocation', () => {
  const output = execFileSync(process.execPath, [verifier], { encoding: 'utf8', timeout: 30_000 });
  const result = JSON.parse(output);
  assert.equal(result.verdict, 'PASS');
  assert.equal(result.runs.length, 3);
  assert.equal(result.cleanup.noLiveOwnedChildren, true);
});
