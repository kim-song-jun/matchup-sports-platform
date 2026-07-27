#!/usr/bin/env node

import { resolve } from 'node:path';
import { incrementVersion, loadReleaseContract } from './changeset-contract.mjs';

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
  // 미소비 changeset 이 0개여도 버전을 계산해야 한다. 예전에는 assertReleaseChangeset 을
  // 써서 0개면 exit 1 했는데, deploy-alpha.yml 이 이 스크립트를 가드 없이 호출하므로
  // "릴리스를 하면(= changeset 을 전부 소비하면) 다음 alpha 배포가 깨지는" 자기모순이
  // 됐다 — 그래서 release-main.yml 이 한 번도 실행되지 못했다.
  // 0개일 때 bump 는 'patch' 로 떨어지므로, 갓 릴리스한 0.1.0 다음 alpha 빌드는
  // 0.1.1-alpha.* 가 되어 SemVer 순서가 유지된다(0.1.0 < 0.1.1-alpha < 0.1.1).
  // "행동 변경에는 changeset 필수" 게이트는 check-changeset-policy.mjs 가 계속 담당한다.
  const contract = loadReleaseContract(repo);
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
