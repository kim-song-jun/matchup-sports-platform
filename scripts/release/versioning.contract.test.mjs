import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const repoRoot = resolve(import.meta.dirname, '../..');
const resolverPath = join(repoRoot, 'scripts/release/resolve-changeset-version.mjs');
const policyPath = join(repoRoot, 'scripts/release/check-changeset-policy.mjs');

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function writeChangeset(root, name, releases, summary = 'Release contract fixture.') {
  const header = releases
    .map(({ packageName, bump }) => `"${packageName}": ${bump}`)
    .join('\n');
  mkdirSync(join(root, '.changeset'), { recursive: true });
  writeFileSync(
    join(root, '.changeset', `${name}.md`),
    `---\n${header}\n---\n\n${summary}\n`,
  );
}

function createFixture({ changesets = [], apiVersion = '0.0.1', webVersion = '0.0.1' } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'teameet-version-contract-'));
  writeJson(join(root, 'apps/v1_api/package.json'), {
    name: 'v1_api',
    version: apiVersion,
    private: true,
  });
  writeJson(join(root, 'apps/v1_web/package.json'), {
    name: 'v1_web',
    version: webVersion,
    private: true,
  });
  writeJson(join(root, '.changeset/config.json'), {
    fixed: [['v1_api', 'v1_web']],
    privatePackages: { version: true, tag: true },
  });
  for (const [index, releases] of changesets.entries()) {
    writeChangeset(root, `fixture-${index + 1}`, releases);
  }
  return root;
}

function runNode(script, args) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
}

test('behavior changes fail when no release changeset is present', () => {
  const root = createFixture();
  try {
    const changedFiles = join(root, 'changed-files.txt');
    writeFileSync(changedFiles, 'apps/v1_web/src/app/events/page.tsx\n');

    const result = runNode(policyPath, [
      '--repo',
      root,
      '--changed-files-file',
      changedFiles,
    ]);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /release changeset is required/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('an older unreleased changeset does not satisfy a new behavior change', () => {
  const root = createFixture({
    changesets: [[{ packageName: 'v1_web', bump: 'minor' }]],
  });
  try {
    const changedFiles = join(root, 'changed-files.txt');
    writeFileSync(changedFiles, 'apps/v1_web/src/app/events/page.tsx\n');

    const result = runNode(policyPath, [
      '--repo',
      root,
      '--changed-files-file',
      changedFiles,
    ]);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /must include its own \.changeset/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a behavior change passes when the same diff includes a valid changeset', () => {
  const root = createFixture({
    changesets: [[{ packageName: 'v1_web', bump: 'minor' }]],
  });
  try {
    const changedFiles = join(root, 'changed-files.txt');
    writeFileSync(
      changedFiles,
      ['apps/v1_web/src/app/events/page.tsx', '.changeset/fixture-1.md'].join('\n'),
    );

    const result = runNode(policyPath, [
      '--repo',
      root,
      '--changed-files-file',
      changedFiles,
    ]);

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /1 changed changeset/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('test-only and documentation-only changes do not require a release changeset', () => {
  const root = createFixture();
  try {
    const changedFiles = join(root, 'changed-files.txt');
    writeFileSync(
      changedFiles,
      [
        'apps/v1_web/src/app/events/page.test.tsx',
        'apps/v1_api/src/tournaments/tournaments-read.service.spec.ts',
        'docs/ops/v1-alpha-environment.md',
      ].join('\n'),
    );

    const result = runNode(policyPath, [
      '--repo',
      root,
      '--changed-files-file',
      changedFiles,
    ]);

    assert.equal(result.status, 0, result.stderr);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('fixed v1 apps resolve the highest grouped bump into one deterministic alpha version', () => {
  const root = createFixture({
    changesets: [
      [{ packageName: 'v1_api', bump: 'patch' }],
      [{ packageName: 'v1_web', bump: 'minor' }],
    ],
  });
  try {
    const result = runNode(resolverPath, [
      '--repo',
      root,
      '--sha',
      'abcdef1234567890abcdef1234567890abcdef12',
      '--date',
      '2026-07-18',
    ]);

    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), {
      baseVersion: '0.0.1',
      bump: 'minor',
      stableVersion: '0.1.0',
      prereleaseVersion: '0.1.0-alpha.20260718.gabcdef123456',
      changesets: ['fixture-1.md', 'fixture-2.md'],
      sha: 'abcdef1234567890abcdef1234567890abcdef12',
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('resolver rejects a release when the fixed app versions have drifted', () => {
  const root = createFixture({
    apiVersion: '0.0.2',
    webVersion: '0.0.1',
    changesets: [[{ packageName: 'v1_api', bump: 'patch' }]],
  });
  try {
    const result = runNode(resolverPath, [
      '--repo',
      root,
      '--sha',
      'abcdef1234567890abcdef1234567890abcdef12',
      '--date',
      '2026-07-18',
    ]);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /fixed package versions must match/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('alpha deploy consumes a supplied SemVer prerelease instead of incrementing dev.N', () => {
  const deployScript = readFileSync(join(repoRoot, 'deploy/deploy-alpha.sh'), 'utf8');

  assert.match(deployScript, /ALPHA_RELEASE_VERSION:\?ALPHA_RELEASE_VERSION is required/);
  assert.doesNotMatch(deployScript, /release_version="dev\.\$\{next_number\}"/);
  assert.match(deployScript, /readonly release_version="\$\{ALPHA_RELEASE_VERSION\}"/);
  assert.match(deployScript, /printf 'release=%s\\nsha=%s\\ndeployed_at=%s\\n'/);
});
