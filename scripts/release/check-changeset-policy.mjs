#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { assertReleaseChangeset } from './changeset-contract.mjs';

function parseArguments(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith('--') || value === undefined) {
      throw new Error('Expected --repo and --changed-files-file arguments');
    }
    values.set(key, value);
  }
  const repo = values.get('--repo');
  const changedFilesFile = values.get('--changed-files-file');
  if (!repo || !changedFilesFile) {
    throw new Error('Expected --repo and --changed-files-file arguments');
  }
  return { repo: resolve(repo), changedFilesFile: resolve(changedFilesFile) };
}

function isTestOrDocumentation(path) {
  return (
    path.startsWith('docs/') ||
    path.startsWith('.github/tasks/') ||
    path.startsWith('e2e/') ||
    path.startsWith('scripts/qa/') ||
    path.startsWith('scripts/docs/') ||
    /(^|\/)(test|tests|__tests__|fixtures)\//.test(path) ||
    /\.(test|spec)\.[^.]+$/.test(path) ||
    /\.md$/.test(path)
  );
}

function affectsRelease(path) {
  if (!path || isTestOrDocumentation(path) || path.startsWith('.changeset/')) return false;
  return (
    path.startsWith('apps/v1_api/') ||
    path.startsWith('apps/v1_web/') ||
    path.startsWith('deploy/') ||
    path.startsWith('.github/workflows/') ||
    path.startsWith('scripts/release/') ||
    ['docker-compose.yml', 'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml'].includes(path)
  );
}

/**
 * Changesets `version` 커밋을 알아본다.
 *
 * 그 커밋은 앱 매니페스트의 버전만 올리고 `.changeset/*.md` 를 소비(삭제)한다. 행동 변경이
 * 아니므로 "changeset 을 동반하라"는 요구가 성립하지 않는데, 매니페스트가 release-affecting
 * 경로라서 게이트에 걸렸다 — 게다가 소비 직후에는 미소비 changeset 이 0개이므로
 * assertReleaseChangeset 이 항상 실패했다. 즉 게이트가 릴리스 자체를 막고 있었다.
 */
const RELEASE_COMMIT_MANIFESTS = ['apps/v1_api/package.json', 'apps/v1_web/package.json'];
const RELEASE_COMMIT_ALLOWED_FILES = [
  ...RELEASE_COMMIT_MANIFESTS,
  // 버전 bump 가 lockfile 을 건드리는 경우까지 허용한다. 여기서 막히면 릴리스가
  // 또 진행 불가가 되는데, 그건 게이트가 잡으려던 위험보다 훨씬 큰 손해다.
  'pnpm-lock.yaml',
];

function isChangesetsReleaseCommit(changedFiles, releaseFiles) {
  const consumesChangesets = changedFiles.some(
    (path) => /^\.changeset\/[^/]+\.md$/.test(path) && path !== '.changeset/README.md',
  );
  const onlyVersionManifests = releaseFiles.every((path) =>
    RELEASE_COMMIT_ALLOWED_FILES.includes(path),
  );
  // v1_api·v1_web 은 fixed 그룹이라 changesets version 이 항상 둘을 함께 올린다.
  // 한쪽만 바뀐 diff 는 정상 릴리스가 아니므로 예외를 주지 않는다 — 통과시키면 두 버전이
  // 갈라진 채 머지되고, 그 드리프트는 CI 가 아니라 alpha 배포 시점에야 터진다
  // (loadReleaseContract 의 "Fixed package versions must match"). 릴리스 직후에는
  // changeset 이 0개라 CI 의 "Validate planned SemVer" 스텝이 skip 되므로 CI 는 못 잡는다.
  // 즉 PR red 가 아니라 배포 red 가 되어 훨씬 늦게 발견된다.
  const bumpsEveryFixedApp = RELEASE_COMMIT_MANIFESTS.every((path) => changedFiles.includes(path));
  return consumesChangesets && onlyVersionManifests && bumpsEveryFixedApp;
}

try {
  const { repo, changedFilesFile } = parseArguments(process.argv.slice(2));
  const changedFiles = readFileSync(changedFilesFile, 'utf8')
    .split(/\r?\n/)
    .map((path) => path.trim())
    .filter(Boolean);
  const releaseFiles = changedFiles.filter(affectsRelease);
  if (releaseFiles.length > 0 && isChangesetsReleaseCommit(changedFiles, releaseFiles)) {
    process.stdout.write(
      'Changesets release commit detected (version bump + consumed Changesets); changeset not required\n',
    );
  } else if (releaseFiles.length > 0) {
    const contract = assertReleaseChangeset(repo);
    const changedChangesets = changedFiles.filter(
      (path) => /^\.changeset\/[^/]+\.md$/.test(path) && path !== '.changeset/README.md',
    );
    if (changedChangesets.length === 0) {
      throw new Error('This behavior-affecting change must include its own .changeset/*.md file');
    }
    process.stdout.write(
      `Release changeset accepted (${contract.bump}): ${releaseFiles.length} behavior file(s), ${changedChangesets.length} changed Changeset(s)\n`,
    );
  } else {
    process.stdout.write('No release-impacting files detected; changeset not required\n');
  }
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
