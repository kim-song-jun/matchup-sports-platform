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

test('the Changesets version commit itself is not blocked by the changeset gate', () => {
  // 릴리스 커밋은 매니페스트 버전만 올리고 changeset 을 소비한다. 행동 변경이 아니므로
  // changeset 동반 요구가 성립하지 않는데, 소비 직후엔 미소비 changeset 이 0개라
  // 예전 게이트는 항상 실패했다 — 게이트가 릴리스 자체를 막고 있었다.
  const root = createFixture({ apiVersion: '0.1.0', webVersion: '0.1.0' });
  try {
    const changedFiles = join(root, 'changed-files.txt');
    writeFileSync(
      changedFiles,
      [
        'apps/v1_api/package.json',
        'apps/v1_web/package.json',
        '.changeset/consumed-one.md',
        '.changeset/consumed-two.md',
      ].join('\n'),
    );

    const result = runNode(policyPath, ['--repo', root, '--changed-files-file', changedFiles]);

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /release commit detected/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a real behavior change cannot pose as a release commit', () => {
  // 예외는 "매니페스트(+lockfile)만 바뀐 경우"로 좁혀야 한다. 소스 파일이 섞여 있으면
  // changeset 을 지웠다는 이유로 게이트를 통과해선 안 된다.
  const root = createFixture({ apiVersion: '0.1.0', webVersion: '0.1.0' });
  try {
    const changedFiles = join(root, 'changed-files.txt');
    writeFileSync(
      changedFiles,
      [
        'apps/v1_api/package.json',
        'apps/v1_web/src/app/tournaments/page.tsx',
        '.changeset/consumed-one.md',
      ].join('\n'),
    );

    const result = runNode(policyPath, ['--repo', root, '--changed-files-file', changedFiles]);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /release changeset is required/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a half-bumped release commit does not get the release exemption', () => {
  // v1_api·v1_web 은 fixed 그룹이라 changesets version 이 항상 둘을 함께 올린다. 한쪽만
  // 바뀐 diff 를 통과시키면 두 버전이 갈라진 채 머지되고, 그 드리프트는 릴리스 직후
  // (changeset 0개 → "Validate planned SemVer" skip) CI 를 통과해 alpha 배포에서야 터진다.
  const root = createFixture({ apiVersion: '0.1.0', webVersion: '0.1.0' });
  try {
    const changedFiles = join(root, 'changed-files.txt');
    writeFileSync(
      changedFiles,
      ['apps/v1_api/package.json', '.changeset/consumed-one.md'].join('\n'),
    );

    const result = runNode(policyPath, ['--repo', root, '--changed-files-file', changedFiles]);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /release changeset is required/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('resolver still labels an alpha build after every changeset has been released', () => {
  // 릴리스 직후 상태: changeset 0개 + 버전이 이미 올라간 package.json.
  // deploy-alpha.yml 은 이 리졸버를 가드 없이 호출하므로, 여기서 실패하면 릴리스를 한
  // 순간부터 alpha 배포가 전부 깨진다 — release-main.yml 이 한 번도 실행되지 못한 이유다.
  const root = createFixture({ apiVersion: '0.1.0', webVersion: '0.1.0' });
  try {
    const result = runNode(resolverPath, [
      '--repo',
      root,
      '--sha',
      'abcdef1234567890abcdef1234567890abcdef12',
      '--date',
      '2026-07-28',
    ]);

    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), {
      baseVersion: '0.1.0',
      bump: 'patch',
      // 갓 릴리스한 0.1.0 보다 뒤에 오도록 다음 patch 를 기준으로 붙인다
      // (0.1.0 < 0.1.1-alpha.* < 0.1.1).
      stableVersion: '0.1.1',
      prereleaseVersion: '0.1.1-alpha.20260728.gabcdef123456',
      changesets: [],
      sha: 'abcdef1234567890abcdef1234567890abcdef12',
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Changesets keeps a changelog generator so the release action can build its PR body', () => {
  // changelog: false 는 changesets/action 과 호환되지 않는다. version 커맨드 자체는 성공하지만
  // action 이 PR 본문을 만들려고 각 패키지의 CHANGELOG.md 를 읽다가 ENOENT 로 죽는다
  // (실측: PR #208 이후 첫 dispatch 가 apps/v1_api/CHANGELOG.md 없음으로 실패).
  // 이걸 다시 false 로 돌리면 릴리스 경로가 또 막히므로 설정을 고정한다.
  const config = JSON.parse(readFileSync(join(repoRoot, '.changeset/config.json'), 'utf8'));

  assert.notEqual(
    config.changelog,
    false,
    'changelog: false breaks changesets/action — it reads each package CHANGELOG.md to build the PR body',
  );
  assert.ok(config.changelog, 'a changelog generator must be configured');
});

test('release PR workflow refuses to run when there is nothing to release', () => {
  // 리졸버가 0개를 허용하게 됐으므로, 빈 릴리스 PR 이 열리지 않도록 워크플로가 직접 막아야 한다.
  const releaseWorkflow = readFileSync(join(repoRoot, '.github/workflows/release-main.yml'), 'utf8');

  assert.match(releaseWorkflow, /\.changesets \| length > 0/);
  assert.match(releaseWorkflow, /nothing to release/i);
  // 통합·배포 브랜치가 dev 하나이므로 릴리스 PR 도 dev 를 base 로 만든다.
  assert.match(releaseWorkflow, /github\.ref == 'refs\/heads\/dev'/);
  assert.doesNotMatch(releaseWorkflow, /github\.ref == 'refs\/heads\/main'/);
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
  const releaseHelper = readFileSync(join(repoRoot, 'deploy/alpha-release-common.sh'), 'utf8');

  assert.match(deployScript, /ALPHA_RELEASE_VERSION:\?ALPHA_RELEASE_VERSION is required/);
  assert.doesNotMatch(deployScript, /release_version="dev\.\$\{next_number\}"/);
  assert.match(deployScript, /write_release_metadata "\$\{ALPHA_MANIFEST_FILE\}"/);
  assert.match(releaseHelper, /release_version="\$\(jq -er '\.release\.version' "\$\{manifest_file\}"\)"/);
  assert.match(releaseHelper, /printf 'release=%s\\nsha=%s\\ndeployed_at=%s\\n'/);
});

test('alpha deploy recreates nginx after replacing the release metadata bind mount', () => {
  const deployScript = readFileSync(join(repoRoot, 'deploy/deploy-alpha.sh'), 'utf8');
  const metadataReplacement = deployScript.indexOf('write_release_metadata "${ALPHA_MANIFEST_FILE}"');
  const nginxRecreate = deployScript.indexOf(
    'up -d --force-recreate --no-deps nginx',
    metadataReplacement,
  );

  assert.notEqual(metadataReplacement, -1);
  assert.ok(nginxRecreate > metadataReplacement);
});
