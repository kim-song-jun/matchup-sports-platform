#!/usr/bin/env node
/**
 * alpha 배포 시드가 **이미지에 없는 파일**을 참조하는 것을 CI 에서 잡는다.
 *
 * 왜 필요한가 (2026-09-08 실사고): `prisma/seed-alpha-showcase-results.ts` 가 앱 코드
 * (`../src/tournaments/participant-display-name`)를 import 하는데, 배포 스크립트는 그 시드를
 * `ts-node prisma/…ts` 로 돌렸다. 런타임 이미지는 `dist`·`prisma` 만 싣고 **`src` 는 싣지
 * 않으므로**(deploy/Dockerfile.v1-api) 컨테이너 안에서 `MODULE_NOT_FOUND` 로 죽었고,
 * 배포가 실패한 뒤 활성 릴리스 복구까지 실패했다.
 *
 * 로컬에서는 `src` 가 있어 잘 돌기 때문에 **배포해 봐야만 드러나는 종류**다.
 *
 * 규칙: `apps/v1_api/prisma/*.ts` 중 `../src/` 를 import 하는 시드는 배포 스크립트에서
 * **컴파일본**(`node dist/prisma/<이름>.js`)으로 실행해야 한다. 컴파일본은 `dist/prisma/…js`
 * 에서 `dist/src/…js` 를 참조하므로 둘 다 이미지 안에 있다.
 *
 * 앱 코드를 import 하지 않는 시드는 ts-node 로 돌려도 된다 — 이 체커가 건드리지 않는다.
 *
 * `@/` 별칭은 **더 나쁘다.** `tsconfig.json` 에 `"@/*": ["src/*"]` 가 선언돼 있지만 런타임
 * 매퍼(`tsconfig-paths`·`module-alias`)가 **어디에도 등록돼 있지 않고**, `src/` 자신도 그 별칭을
 * 한 번도 쓰지 않는다(실측 0건). tsc 는 import 지정자를 다시 쓰지 않으므로 컴파일본도
 * `require("@/...")` 를 그대로 뿜는다 — **ts-node 든 컴파일본이든 양쪽 다 죽는다.** 그래서
 * `@/` 는 실행 방식과 무관하게 금지한다. 지금 prisma/ 에는 0건이라 잠복 상태다.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';

const DEPLOY_SCRIPT = 'deploy/deploy-alpha.sh';
const SEED_DIR = 'apps/v1_api/prisma';
const RUNTIME_DOCKERFILE = 'deploy/Dockerfile.v1-api';
const API_TSCONFIG = 'apps/v1_api/tsconfig.json';
const API_BUILD_TSCONFIG = 'apps/v1_api/tsconfig.build.json';
const DEPLOY_SCRIPTS = ['deploy/deploy-alpha.sh', 'deploy/deploy-prod.sh'];

/**
 * 모듈 지정자는 **문자열 리터럴 자체**로 본다. `from '…'` 만 보면
 * side-effect import(`import '../src/x'`) · `require('../src/x')` · 동적 `import('../src/x')`
 * 를 전부 놓쳐 **fail-open** 된다(실측: 세 형태 다 통과했다).
 */
const moduleSpecifier = (prefix) => new RegExp(`['"\`]${prefix}`);

/**
 * 주석을 걷어낸다. 이 저장소의 시드들은 **"여기서 `../src/` 를 import 하면 안 된다"** 는
 * 경고를 주석으로 달고 있어(seed-alpha-league-qa · seed-alpha-tournament-qa), 그대로 두면
 * 그 경고문 자체를 위반으로 잡는다. 문자열 리터럴 안의 `//`(URL 등)는 건드리지 않는다.
 */
export function stripComments(source) {
  let out = '';
  let quote = '';
  for (let i = 0; i < source.length; i += 1) {
    const c = source[i];
    const next = source[i + 1];
    if (quote) {
      out += c;
      if (c === '\\') { out += next ?? ''; i += 1; continue; }
      if (c === quote) quote = '';
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { quote = c; out += c; continue; }
    if (c === '/' && next === '/') { while (i < source.length && source[i] !== '\n') i += 1; out += '\n'; continue; }
    if (c === '/' && next === '*') {
      i += 2;
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) i += 1;
      i += 1;
      out += ' ';
      continue;
    }
    out += c;
  }
  return out;
}

/** 런타임 이미지가 싣지 않는 워크스페이스 디렉터리를 가리키는 상대 지정자. */
const CROSSES_INTO_SRC = moduleSpecifier('\\.\\./src/');

/** `@/` 별칭. 런타임 매퍼가 없어 어떤 실행 방식으로도 해석되지 않는다. */
const USES_PATH_ALIAS = moduleSpecifier('@/');

export function findOffenders({ deployScript, seeds }) {
  const offenders = [];

  for (const { name, source: raw } of seeds) {
    const source = stripComments(raw);

    // `@/` 는 실행 방식과 무관하게 깨진다 — 배포에 등록됐는지도 따지지 않는다.
    if (USES_PATH_ALIAS.test(source)) {
      offenders.push({
        seed: name,
        reason:
          '`@/` 별칭을 쓴다 — 런타임 매퍼가 등록돼 있지 않아 ts-node 도 컴파일본도 해석하지 못한다. ' +
          '상대 경로로 바꾸세요',
      });
      continue;
    }

    if (!CROSSES_INTO_SRC.test(source)) continue;

    const base = name.replace(/\.ts$/, '');
    const tsNodeInvocation = new RegExp(`ts-node\\s+prisma/${escapeRegExp(base)}\\.ts`);
    const compiledInvocation = new RegExp(`node\\s+dist/prisma/${escapeRegExp(base)}\\.js`);

    // 배포에서 안 돌리는 시드는 대상이 아니다. 이름 부분일치로 보면 `prisma/seed.ts`(base='seed')가
    // 스크립트 어디의 "seed" 에나 걸려 **항상 돈다**고 오판한다 — 실제 호출 형태로만 센다.
    if (!tsNodeInvocation.test(deployScript) && !compiledInvocation.test(deployScript)) continue;

    if (tsNodeInvocation.test(deployScript)) {
      offenders.push({
        seed: name,
        reason:
          '`../src/` 를 import 하는데 ts-node 로 .ts 를 직접 돌린다 — 런타임 이미지에 `src` 가 없다. ' +
          `\`node dist/prisma/${base}.js\` 로 바꾸세요`,
      });
    } else if (!compiledInvocation.test(deployScript)) {
      offenders.push({
        seed: name,
        reason: `\`../src/\` 를 import 하는데 배포에서 \`node dist/prisma/${base}.js\` 로 실행되지 않는다`,
      });
    }
  }

  return offenders;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 이 규칙 전체가 **`dist/prisma/` 가 만들어진다**는 전제 위에 서 있다. 그 전제는 암묵적이다:
 * `nest build` 의 기본 tsConfig 는 `tsconfig.build.json` 인데 이 저장소엔 그 파일이 **없어서**
 * `tsconfig.json` 으로 폴백하고, 그 `include` 에 `prisma/**\/*` 가 있어서 나온다.
 * 누가 `tsconfig.build.json` 을 추가하거나 `include` 를 좁히면 `dist/prisma/` 가 통째로
 * 사라져 배포가 또 죽는데, 호출 형태만 보는 검사는 **녹색인 채로** 지나간다.
 */
export function findPremiseBreak({ tsconfig, buildTsconfig }) {
  const includesPrisma = (raw) => /"include"\s*:\s*\[[^\]]*prisma\//.test(raw);

  if (buildTsconfig !== null) {
    return includesPrisma(buildTsconfig)
      ? null
      : '`tsconfig.build.json` 이 생겼는데 `include` 에 `prisma/**/*` 가 없다 — `dist/prisma/` 가 만들어지지 않는다';
  }
  return includesPrisma(tsconfig)
    ? null
    : '`apps/v1_api/tsconfig.json` 의 `include` 에 `prisma/**/*` 가 없다 — `dist/prisma/` 가 만들어지지 않는다';
}

/**
 * 규칙을 대칭으로 만든다. 지금까지는 "소스가 `../src/` 를 넘으면 컴파일본으로 불러라"
 * 한 방향만 봤다. 반대 방향 — **배포가 `node dist/<rel>.js` 로 부르는 것은 빌드가 실제로
 * 그 자리에 만드는 파일이어야 한다** — 이 비어 있었다. 오타 하나면 체커는 녹색인 채로
 * 배포가 죽는다.
 *
 * `include` 글롭까지 확인한다 — 소스가 있어도 빌드 대상이 아니면 dist 에 안 생긴다.
 */
export function findMissingEntrypoints({ deployScripts, sourceExists, includeGlobs }) {
  const missing = [];
  const seen = new Set();

  for (const script of deployScripts) {
    for (const match of script.matchAll(/node\s+dist\/([A-Za-z0-9._/-]+)\.js/g)) {
      const rel = match[1];
      if (seen.has(rel)) continue;
      seen.add(rel);

      if (!sourceExists(`${rel}.ts`)) {
        missing.push({ entrypoint: `dist/${rel}.js`, reason: `\`${rel}.ts\` 가 없다` });
        continue;
      }
      const topDir = rel.split('/')[0];
      if (!includeGlobs.some((glob) => glob.startsWith(`${topDir}/`))) {
        missing.push({
          entrypoint: `dist/${rel}.js`,
          reason: `\`${rel}.ts\` 가 tsconfig 의 include 에 잡히지 않는다 — dist 에 생기지 않는다`,
        });
      }
    }
  }

  return missing;
}

function main() {
  const deployScript = readFileSync(DEPLOY_SCRIPT, 'utf8');
  const dockerfile = readFileSync(RUNTIME_DOCKERFILE, 'utf8');

  // 전제가 바뀌면(이미지가 src 를 싣기 시작하면) 이 체커는 의미가 없다 — 전제부터 확인한다.
  if (/COPY --from=builder [^\n]*\/apps\/v1_api\/src /.test(dockerfile)) {
    console.log('[alpha-seed-runtime] skipped — 런타임 이미지가 이제 src 를 싣습니다');
    return;
  }

  const seeds = readdirSync(SEED_DIR)
    .filter((name) => name.endsWith('.ts'))
    .map((name) => ({ name, source: readFileSync(`${SEED_DIR}/${name}`, 'utf8') }));

  const premiseBreak = findPremiseBreak({
    tsconfig: readFileSync(API_TSCONFIG, 'utf8'),
    buildTsconfig: existsSync(API_BUILD_TSCONFIG) ? readFileSync(API_BUILD_TSCONFIG, 'utf8') : null,
  });
  if (premiseBreak) {
    console.error('[alpha-seed-runtime] failed');
    console.error(`- ${premiseBreak}. 컴파일본 실행이 성립하지 않는다.`);
    process.exit(1);
  }

  const includeGlobs = JSON.parse(
    readFileSync(API_TSCONFIG, 'utf8').match(/"include"\s*:\s*(\[[^\]]*\])/)?.[1] ?? '[]',
  );
  const missing = findMissingEntrypoints({
    deployScripts: DEPLOY_SCRIPTS.filter(existsSync).map((path) => readFileSync(path, 'utf8')),
    sourceExists: (rel) => existsSync(`apps/v1_api/${rel}`),
    includeGlobs,
  });
  if (missing.length > 0) {
    console.error('[alpha-seed-runtime] failed');
    for (const { entrypoint, reason } of missing) {
      console.error(`- 배포가 \`${entrypoint}\` 를 부르는데 ${reason}.`);
    }
    process.exit(1);
  }

  const offenders = findOffenders({ deployScript, seeds });

  if (offenders.length > 0) {
    console.error('[alpha-seed-runtime] failed');
    for (const { seed, reason } of offenders) {
      console.error(`- \`prisma/${seed}\`: ${reason}.`);
    }
    process.exit(1);
  }

  console.log('[alpha-seed-runtime] passed');
}

// 자체 테스트에서 import 할 때는 실행하지 않는다.
if (process.argv[1] && process.argv[1].endsWith('check-alpha-seed-runtime.mjs')) main();
