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
 */
import { readFileSync, readdirSync } from 'node:fs';

const DEPLOY_SCRIPT = 'deploy/deploy-alpha.sh';
const SEED_DIR = 'apps/v1_api/prisma';
const RUNTIME_DOCKERFILE = 'deploy/Dockerfile.v1-api';

/** 런타임 이미지가 싣지 않는 워크스페이스 디렉터리를 가리키는 상대 import. */
const CROSSES_INTO_SRC = /from\s+['"]\.\.\/src\//;

export function findOffenders({ deployScript, seeds }) {
  const offenders = [];

  for (const { name, source } of seeds) {
    if (!CROSSES_INTO_SRC.test(source)) continue;

    const base = name.replace(/\.ts$/, '');
    const tsNodeInvocation = new RegExp(`ts-node\\s+prisma/${escapeRegExp(base)}\\.ts`);
    const compiledInvocation = new RegExp(`node\\s+dist/prisma/${escapeRegExp(base)}\\.js`);

    if (!deployScript.includes(base)) continue; // 배포에서 안 돌리는 시드는 대상이 아니다

    if (tsNodeInvocation.test(deployScript)) {
      offenders.push({
        seed: name,
        reason: 'ts-node 로 .ts 를 직접 돌린다 — 런타임 이미지에 `src` 가 없어 import 가 깨진다',
      });
    } else if (!compiledInvocation.test(deployScript)) {
      offenders.push({
        seed: name,
        reason: `배포 스크립트에서 \`node dist/prisma/${base}.js\` 로 실행되지 않는다`,
      });
    }
  }

  return offenders;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

  const offenders = findOffenders({ deployScript, seeds });

  if (offenders.length > 0) {
    console.error('[alpha-seed-runtime] failed');
    for (const { seed, reason } of offenders) {
      console.error(
        `- \`prisma/${seed}\` 는 \`../src/\` 를 import 하는데 ${reason}. ` +
          `\`node dist/prisma/${seed.replace(/\.ts$/, '')}.js\` 로 바꾸세요.`,
      );
    }
    process.exit(1);
  }

  console.log('[alpha-seed-runtime] passed');
}

// 자체 테스트에서 import 할 때는 실행하지 않는다.
if (process.argv[1] && process.argv[1].endsWith('check-alpha-seed-runtime.mjs')) main();
