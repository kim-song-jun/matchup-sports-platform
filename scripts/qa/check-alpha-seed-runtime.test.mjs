import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  findMissingEntrypoints,
  findOffenders,
  findPremiseBreak,
  stripComments,
} from './check-alpha-seed-runtime.mjs';

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

test('이름이 다른 시드의 부분 문자열이어도 대상으로 오판하지 않는다', () => {
  // `prisma/seed.ts` → base='seed' 는 스크립트의 어떤 "seed" 에나 부분일치한다.
  // 실제 호출 형태로만 세지 않으면 "배포에서 돈다"고 잘못 판정해 만족 불가능한 요구를 낸다.
  const offenders = findOffenders({
    deployScript: "node dist/prisma/seed-alpha-showcase-results.js",
    seeds: [{ name: 'seed.ts', source: CROSSING_SEED }],
  });

  assert.deepEqual(offenders, [], "seed-alpha-showcase-results 의 'seed' 에 부분일치하면 안 된다");
});

test('tsconfig 의 include 가 prisma 를 잃으면 잡는다 — dist/prisma 가 안 생긴다', () => {
  const broken = findPremiseBreak({
    tsconfig: '{ "include": ["src/**/*"] }',
    buildTsconfig: null,
  });

  assert.ok(broken, 'include 에서 prisma 가 빠졌는데 통과시켰다');
  assert.match(broken, /prisma/);
});

test('tsconfig.build.json 이 생기면 그쪽 include 를 본다', () => {
  // nest build 는 tsconfig.build.json 이 있으면 그걸 쓴다 — 폴백 전제가 깨진다.
  assert.ok(
    findPremiseBreak({ tsconfig: '{ "include": ["src/**/*", "prisma/**/*"] }', buildTsconfig: '{ "include": ["src/**/*"] }' }),
    'build 설정이 prisma 를 빼면 잡아야 한다',
  );
  assert.equal(
    findPremiseBreak({ tsconfig: '{ "include": ["src/**/*"] }', buildTsconfig: '{ "include": ["src/**/*", "prisma/**/*"] }' }),
    null,
    'build 설정이 prisma 를 담으면 통과해야 한다',
  );
});

test('실제 저장소가 그 전제를 만족한다', () => {
  const tsconfig = readFileSync('apps/v1_api/tsconfig.json', 'utf8');
  const buildPath = 'apps/v1_api/tsconfig.build.json';
  const buildTsconfig = existsSync(buildPath) ? readFileSync(buildPath, 'utf8') : null;

  assert.equal(findPremiseBreak({ tsconfig, buildTsconfig }), null);
});

test('side-effect import · require · 동적 import 도 잡는다 — from 절만 보면 fail-open', () => {
  const forms = [
    "import '../src/x';",
    "const x = require('../src/x');",
    "await import('../src/x');",
  ];

  for (const body of forms) {
    const offenders = findOffenders({
      deployScript: "ts-node prisma/seed-f.ts",
      seeds: [{ name: 'seed-f.ts', source: body }],
    });
    assert.equal(offenders.length, 1, `놓쳤다: ${body}`);
  }
});

test('경고 주석은 위반이 아니다 — 실제 시드 둘이 그 경고를 달고 있다', () => {
  const warned = `
// **여기서 \`../src/...\` 를 import 하면 안 된다.** 이미지에 없다.
/* 블록 주석에서도 '../src/foo' 를 언급할 수 있다 */
import { PrismaClient } from '@prisma/client';
`;

  const offenders = findOffenders({
    deployScript: "ts-node prisma/seed-w.ts",
    seeds: [{ name: 'seed-w.ts', source: warned }],
  });

  assert.deepEqual(offenders, [], '경고 주석을 위반으로 잡으면 안 된다');
});

test('주석 제거가 문자열 안의 // 를 건드리지 않는다', () => {
  const kept = stripComments(`const url = 'https://example.com/a'; // 이건 주석`);

  assert.match(kept, /https:\/\/example\.com\/a/);
  assert.doesNotMatch(kept, /이건 주석/);
});

test('주석 뒤에 진짜 import 가 있으면 여전히 잡는다', () => {
  const mixed = `
// 여기서 '../src/x' 를 쓰면 안 된다
import { y } from '../src/y';
`;

  const offenders = findOffenders({
    deployScript: "ts-node prisma/seed-m.ts",
    seeds: [{ name: 'seed-m.ts', source: mixed }],
  });

  assert.equal(offenders.length, 1, '주석 제거가 실제 위반까지 지우면 안 된다');
});

const INCLUDE = ['src/**/*', 'prisma/**/*'];

test('배포가 부르는 dist 진입점의 소스가 없으면 잡는다', () => {
  const missing = findMissingEntrypoints({
    deployScripts: ['node dist/prisma/seed-typo.js'],
    sourceExists: () => false,
    includeGlobs: INCLUDE,
  });

  assert.equal(missing.length, 1);
  assert.match(missing[0].reason, /없다/);
});

test('소스는 있지만 include 밖이면 잡는다 — dist 에 안 생긴다', () => {
  const missing = findMissingEntrypoints({
    deployScripts: ['node dist/prisma/seed-x.js'],
    sourceExists: () => true,
    includeGlobs: ['src/**/*'],
  });

  assert.equal(missing.length, 1);
  assert.match(missing[0].reason, /include/);
});

test('소스가 있고 include 안이면 통과한다', () => {
  assert.deepEqual(
    findMissingEntrypoints({
      deployScripts: ['node dist/prisma/seed-x.js', 'node dist/src/a/b.cli.js'],
      sourceExists: () => true,
      includeGlobs: INCLUDE,
    }),
    [],
  );
});

test('실제 배포 스크립트의 진입점 전부가 소스를 갖는다', () => {
  const scripts = ['deploy/deploy-alpha.sh', 'deploy/deploy-prod.sh']
    .filter((path) => existsSync(path))
    .map((path) => readFileSync(path, 'utf8'));
  const includeGlobs = JSON.parse(
    readFileSync('apps/v1_api/tsconfig.json', 'utf8').match(/"include"\s*:\s*(\[[^\]]*\])/)[1],
  );

  assert.deepEqual(
    findMissingEntrypoints({
      deployScripts: scripts,
      sourceExists: (rel) => existsSync(`apps/v1_api/${rel}`),
      includeGlobs,
    }),
    [],
  );
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

/**
 * 위 테스트들은 순수 함수만 본다. `main()` 이 `process.exit(1)` 을 멈춰도 전부 통과하고
 * **CI 는 녹색인데 게이트는 아무것도 막지 않는다.** 그래서 CLI 를 실제로 띄워 종료코드를 센다.
 * (병렬 세션이 배포 복구 스파이크에서 정확히 이 실패 모드를 만났다 — 단계 이름은 찍히는데
 * 종료코드가 전파되지 않아 로그만 보면 정상으로 보였다.)
 */
function fixtureRepo(files) {
  const root = mkdtempSync(join(tmpdir(), 'seed-runtime-'));
  for (const [rel, body] of Object.entries(files)) {
    const path = join(root, rel);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, body);
  }
  return root;
}

const CHECKER = resolve('scripts/qa/check-alpha-seed-runtime.mjs');
const DOCKERFILE_WITHOUT_SRC = 'COPY --from=builder /app/apps/v1_api/dist ./apps/v1_api/dist\n';
const TSCONFIG = '{ "include": ["src/**/*", "prisma/**/*"] }';
const SEED_WITH_APP_IMPORT = "import { x } from '../src/tournaments/x';\n";

test('CLI 가 위반을 만나면 종료코드 1 로 끝난다', () => {
  const root = fixtureRepo({
    'deploy/deploy-alpha.sh': "ts-node prisma/seed-bad.ts\n",
    'deploy/Dockerfile.v1-api': DOCKERFILE_WITHOUT_SRC,
    'apps/v1_api/tsconfig.json': TSCONFIG,
    'apps/v1_api/prisma/seed-bad.ts': SEED_WITH_APP_IMPORT,
  });

  const run = spawnSync(process.execPath, [CHECKER], { cwd: root, encoding: 'utf8' });

  assert.equal(run.status, 1, `종료코드가 전파되지 않는다: ${run.stdout}${run.stderr}`);
  assert.match(run.stderr, /seed-bad/);
});

test('CLI 가 깨끗한 저장소에서는 종료코드 0 으로 끝난다', () => {
  const root = fixtureRepo({
    'deploy/deploy-alpha.sh': "node dist/prisma/seed-ok.js\n",
    'deploy/Dockerfile.v1-api': DOCKERFILE_WITHOUT_SRC,
    'apps/v1_api/tsconfig.json': TSCONFIG,
    'apps/v1_api/prisma/seed-ok.ts': SEED_WITH_APP_IMPORT,
  });

  const run = spawnSync(process.execPath, [CHECKER], { cwd: root, encoding: 'utf8' });

  assert.equal(run.status, 0, `${run.stdout}${run.stderr}`);
});

test('CLI 가 실제 저장소에서 종료코드 0 으로 끝난다', () => {
  const run = spawnSync(process.execPath, [CHECKER], { encoding: 'utf8' });

  assert.equal(run.status, 0, `${run.stdout}${run.stderr}`);
});
