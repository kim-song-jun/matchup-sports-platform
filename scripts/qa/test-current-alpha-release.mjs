#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '../..');
const temp = mkdtempSync(join(tmpdir(), 'alpha-current-'));
const sha = 'a'.repeat(40);
try {
  // Stub only the GitHub transport; exercise the production shell and output contract.
  writeFileSync(join(temp, 'gh'), '#!/usr/bin/env bash\n[[ "$*" == "api repos/test/repo/git/ref/heads/dev --jq .object.sha" ]] || exit 90\nprintf "%s\\n" "$TEST_DEV_SHA"\nexit "$TEST_API_STATUS"\n', { mode: 0o700 });
  function check(name, overrides, expected) {
    const output = join(temp, 'output');
    const summary = join(temp, 'summary');
    writeFileSync(output, '');
    writeFileSync(summary, '');
    const result = spawnSync('bash', [join(root, 'scripts/release/check-current-alpha-release.sh')], {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${temp}:${process.env.PATH}`, RELEASE_SHA: sha,
        REPOSITORY: 'test/repo', TASK168_STAGE: 'final', GITHUB_OUTPUT: output,
        GITHUB_STEP_SUMMARY: summary, TEST_DEV_SHA: sha, TEST_API_STATUS: '0', ...overrides },
    });
    if (expected === 'error') {
      assert.notEqual(result.status, 0, name);
      assert.equal(readFileSync(output, 'utf8'), '', `${name}: must fail closed`);
    } else {
      assert.equal(result.status, 0, `${name}: ${result.stderr}`);
      assert.equal(readFileSync(output, 'utf8'), `current=${expected}\n`, name);
      if (expected === 'false') assert.match(readFileSync(summary, 'utf8'), /Skipped superseded Alpha release/);
    }
    console.log(`PASS ${name}`);
  }
  check('latest commit activates', {}, 'true');
  check('superseded commit skips activation', { TEST_DEV_SHA: 'b'.repeat(40) }, 'false');
  check('GitHub failure refuses activation', { TEST_API_STATUS: '1' }, 'error');
  check('invalid GitHub response refuses activation', { TEST_DEV_SHA: 'null' }, 'error');
  check('invalid release refuses activation', { RELEASE_SHA: 'main' }, 'error');
  check('unknown stage refuses activation', { TASK168_STAGE: 'unknown' }, 'error');
  for (const stage of ['stageBFinal', 'stageBRecover']) {
    check(`${stage} retains pinned transition`, { TASK168_STAGE: stage, TEST_API_STATUS: '1' }, 'true');
  }

  // Guard the actual workflow consumers, so removing an if: cannot leave a passing helper test.
  const workflow = readFileSync(join(root, '.github/workflows/deploy-alpha.yml'), 'utf8');
  assert.match(workflow, /group: deploy-alpha\s+cancel-in-progress: false/);
  const steps = workflow.split(/(?=      - (?:name:|uses:))/);
  const named = (name) => {
    const step = steps.find((text) => text.startsWith(`      - name: ${name}\n`));
    assert.ok(step, `missing workflow step: ${name}`);
    return step;
  };
  for (const step of steps.filter((text) => text.startsWith('      - name: Sync '))) {
    assert.match(step, /if: steps\.deployment-current\.outputs\.current == 'true'/);
  }
  for (const name of ['Deploy through AWS Systems Manager', 'Verify public alpha release identity']) {
    assert.match(named(name), /if: steps\.activation-current\.outputs\.current == 'true'/);
  }
  const first = named('Check latest dev before runtime changes');
  const second = named('Recheck latest dev before server activation');
  for (const step of [first, second]) {
    assert.match(step, /run: bash scripts\/release\/check-current-alpha-release\.sh/);
    assert.match(step, /TASK168_STAGE: \$\{\{ steps\.task168\.outputs\.stage \}\}/);
  }
  assert.match(second, /if: steps\.deployment-current\.outputs\.current == 'true'/);
  assert.ok(workflow.indexOf(first) < workflow.indexOf(named('Sync inquiry Slack runtime env')));
  assert.ok(workflow.indexOf(second) > workflow.indexOf(named('Sync Kakao OAuth runtime env')));
  assert.ok(workflow.indexOf(second) < workflow.indexOf(named('Deploy through AWS Systems Manager')));
  const ci = readFileSync(join(root, '.github/workflows/deploy.yml'), 'utf8');
  assert.match(ci, /cancel-in-progress: \$\{\{ github\.event_name == 'pull_request' \|\| github\.ref == 'refs\/heads\/dev' \}\}/);
  assert.match(ci, /run: node scripts\/qa\/test-current-alpha-release\.mjs/);
  console.log('PASS protected workflow activation and latest-dev CI wiring');
} finally {
  rmSync(temp, { recursive: true, force: true });
}
