import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

import { findOffenders } from './check-alpha-seed-runtime.mjs';

const CROSSING_SEED = `
import { PrismaClient } from '@prisma/client';
import { participantDisplayName } from '../src/tournaments/participant-display-name';
`;

const PLAIN_SEED = `
import { PrismaClient } from '@prisma/client';
import { helper } from './seed-shared';
`;

test('앱 코드를 import 하는 시드를 ts-node 로 돌리면 잡는다', () => {
  const offenders = findOffenders({
    deployScript: "v1_api sh -c 'cd /app/apps/v1_api && ./node_modules/.bin/ts-node prisma/seed-x.ts'",
    seeds: [{ name: 'seed-x.ts', source: CROSSING_SEED }],
  });

  assert.equal(offenders.length, 1);
  assert.equal(offenders[0].seed, 'seed-x.ts');
  assert.match(offenders[0].reason, /ts-node/);
});

test('컴파일본으로 돌리면 통과한다', () => {
  const offenders = findOffenders({
    deployScript: "v1_api sh -c 'cd /app/apps/v1_api && node dist/prisma/seed-x.js'",
    seeds: [{ name: 'seed-x.ts', source: CROSSING_SEED }],
  });

  assert.deepEqual(offenders, []);
});

test('앱 코드를 import 하지 않는 시드는 ts-node 여도 통과한다', () => {
  const offenders = findOffenders({
    deployScript: "v1_api sh -c 'cd /app/apps/v1_api && ./node_modules/.bin/ts-node prisma/seed-y.ts'",
    seeds: [{ name: 'seed-y.ts', source: PLAIN_SEED }],
  });

  assert.deepEqual(offenders, []);
});

test('배포에서 아예 안 돌리는 시드는 대상이 아니다', () => {
  const offenders = findOffenders({
    deployScript: "v1_api sh -c 'cd /app/apps/v1_api && node dist/prisma/other.js'",
    seeds: [{ name: 'seed-local-only.ts', source: CROSSING_SEED }],
  });

  assert.deepEqual(offenders, []);
});

const ALIAS_SEED = `
import { PrismaClient } from '@prisma/client';
import { participantDisplayName } from '@/tournaments/participant-display-name';
`;

test('@/ 별칭은 컴파일본으로 돌려도 잡는다 — 런타임 매퍼가 없다', () => {
  const offenders = findOffenders({
    deployScript: "v1_api sh -c 'cd /app/apps/v1_api && node dist/prisma/seed-z.js'",
    seeds: [{ name: 'seed-z.ts', source: ALIAS_SEED }],
  });

  assert.equal(offenders.length, 1, '컴파일본으로 돌려도 @/ 는 해석되지 않는다');
  assert.match(offenders[0].reason, /@\//);
});

test('@/ 별칭은 배포에서 안 돌리는 시드여도 잡는다', () => {
  // 상대 경로 규칙과 달리 실행 방식과 무관하므로 배포 등록 여부를 따지지 않는다.
  const offenders = findOffenders({
    deployScript: "아무 관련 없는 내용",
    seeds: [{ name: 'seed-local.ts', source: ALIAS_SEED }],
  });

  assert.equal(offenders.length, 1);
});

test('실제 저장소 상태가 규칙을 지킨다', () => {
  const deployScript = readFileSync('deploy/deploy-alpha.sh', 'utf8');
  const seeds = readdirSync('apps/v1_api/prisma')
    .filter((name) => name.endsWith('.ts'))
    .map((name) => ({ name, source: readFileSync(`apps/v1_api/prisma/${name}`, 'utf8') }));

  assert.deepEqual(findOffenders({ deployScript, seeds }), []);
});

test('실사고 그대로 재현하면 잡힌다 — 이 규칙이 그 배포 실패를 막는다', () => {
  // 2026-09-08 실패 시점의 배포 스크립트 한 줄을 그대로 넣는다.
  const brokenLine =
    "  'cd /app/apps/v1_api && ./node_modules/.bin/ts-node prisma/seed-alpha-showcase-results.ts'";
  const source = readFileSync('apps/v1_api/prisma/seed-alpha-showcase-results.ts', 'utf8');

  const offenders = findOffenders({
    deployScript: brokenLine,
    seeds: [{ name: 'seed-alpha-showcase-results.ts', source }],
  });

  assert.equal(offenders.length, 1, '실패했던 그 호출 형태를 잡지 못한다');
});
