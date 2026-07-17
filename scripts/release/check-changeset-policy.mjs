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

try {
  const { repo, changedFilesFile } = parseArguments(process.argv.slice(2));
  const changedFiles = readFileSync(changedFilesFile, 'utf8')
    .split(/\r?\n/)
    .map((path) => path.trim())
    .filter(Boolean);
  const releaseFiles = changedFiles.filter(affectsRelease);
  if (releaseFiles.length > 0) {
    const changedChangesets = changedFiles.filter(
      (path) => /^\.changeset\/[^/]+\.md$/.test(path) && path !== '.changeset/README.md',
    );
    if (changedChangesets.length === 0) {
      throw new Error('This behavior-affecting change must include its own .changeset/*.md file');
    }
    const contract = assertReleaseChangeset(repo);
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
