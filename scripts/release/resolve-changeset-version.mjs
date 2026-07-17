#!/usr/bin/env node

import { resolve } from 'node:path';
import { incrementVersion, assertReleaseChangeset } from './changeset-contract.mjs';

function parseArguments(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith('--') || value === undefined) {
      throw new Error('Expected --repo, --sha, and --date arguments');
    }
    values.set(key, value);
  }
  const repo = values.get('--repo');
  const sha = values.get('--sha');
  const date = values.get('--date');
  if (!repo || !sha || !date) {
    throw new Error('Expected --repo, --sha, and --date arguments');
  }
  if (!/^[0-9a-f]{40}$/.test(sha)) {
    throw new Error('Release SHA must be a full lowercase commit SHA');
  }
  const parsedDate = new Date(`${date}T00:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    Number.isNaN(parsedDate.valueOf()) ||
    parsedDate.toISOString().slice(0, 10) !== date
  ) {
    throw new Error('Release date must use YYYY-MM-DD');
  }
  return { repo: resolve(repo), sha, date };
}

try {
  const { repo, sha, date } = parseArguments(process.argv.slice(2));
  const contract = assertReleaseChangeset(repo);
  const stableVersion = incrementVersion(contract.baseVersion, contract.bump);
  const prereleaseVersion = `${stableVersion}-alpha.${date.replaceAll('-', '')}.g${sha.slice(0, 12)}`;

  process.stdout.write(
    `${JSON.stringify({
      baseVersion: contract.baseVersion,
      bump: contract.bump,
      stableVersion,
      prereleaseVersion,
      changesets: contract.changesets,
      sha,
    })}\n`,
  );
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
