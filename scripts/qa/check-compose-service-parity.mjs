#!/usr/bin/env node
/**
 * alpha 에만 존재하고 프로덕션에는 없는 compose 서비스를 CI 에서 잡는다.
 *
 * 왜 필요한가 (2026-08-16 실사고): `v1_game_operations_worker` 가
 * `docker-compose.alpha.yml` 에만 선언되고 `docker-compose.prod.yml` 에는 끝내 들어가지
 * 않았다. alpha 는 prod compose 를 베이스로 alpha override 를 얹어 올리므로 alpha 에서는
 * 정상 동작했고, 프로덕션만 조용히 그 워커 없이 돌았다. 그 워커는 아웃박스 디스패처라
 * `GAME_RESULT_OFFICIAL` 등 모든 핸들러가 프로덕션에서 한 번도 실행되지 않았다 —
 * 결과 확정 후 대진표 진출·순위 projection·리뷰 에스컬레이션·일정/라인업 알림이 전부
 * 멈춘 상태였고, 배포는 계속 성공으로 보고됐다.
 *
 * 그 건은 배포 검증에 워커를 명시적으로 추가해 막았지만, 그건 **그 서비스 하나에 대한**
 * 방어다. 다음에 alpha 에만 추가되는 서비스는 같은 방식으로 또 누락된다. 이 체커는
 * 서비스 집합 자체를 비교해 그 계열의 재발을 막는다.
 *
 * 규칙: alpha override 에 선언된 모든 서비스는 prod compose 에도 선언돼 있어야 한다.
 * 반대 방향(prod 에만 있는 서비스)은 정상이다 — alpha 는 override 라 베이스의 서비스를
 * 그대로 물려받는다.
 *
 * 의도적으로 alpha 전용인 서비스는 아래 allowlist 에 **이유와 함께** 등록한다.
 */
import { readFileSync } from 'node:fs';

const PROD_COMPOSE = 'deploy/docker-compose.prod.yml';
const ALPHA_COMPOSE = 'deploy/docker-compose.alpha.yml';

/**
 * 의도적 alpha 전용 서비스. 프로덕션에 없어야 하는 이유를 반드시 적는다 —
 * 이유 없는 등록은 이 체커를 무력화하는 것과 같다.
 */
const ALPHA_ONLY_ALLOWLIST = new Map([
  // 예시 형태 유지용 주석 — 현재 등록된 예외는 없다.
  // ['some_alpha_only_service', 'alpha 전용인 이유를 여기에 적는다'],
]);

/**
 * compose 파일의 최상위 `services:` 블록에서 서비스 이름만 뽑는다.
 * 외부 YAML 의존성을 새로 들이지 않으려고 최소 파싱만 한다: `services:` 는 들여쓰기 0,
 * 서비스 이름은 그 아래 들여쓰기 2 의 `name:` 키다. 이 저장소의 두 compose 파일이
 * 모두 그 형태이며, 형태가 어긋나면(=`services:` 를 못 찾으면) 조용히 통과하지 않고
 * 에러를 낸다.
 */
function parseServiceNames(path) {
  const text = readFileSync(path, 'utf8');
  const lines = text.split('\n');
  const start = lines.findIndex((line) => /^services:\s*$/.test(line));
  if (start === -1) throw new Error(`${path}: 최상위 \`services:\` 블록을 찾지 못했습니다`);

  const names = [];
  for (const line of lines.slice(start + 1)) {
    if (/^\S/.test(line)) break; // 다음 최상위 키(volumes: 등) → services 블록 종료
    const match = line.match(/^ {2}([A-Za-z0-9_.-]+):\s*$/);
    if (match) names.push(match[1]);
  }
  if (names.length === 0) throw new Error(`${path}: \`services:\` 아래에서 서비스를 하나도 읽지 못했습니다`);
  return names;
}

export function findAlphaOnlyServices(prodPath = PROD_COMPOSE, alphaPath = ALPHA_COMPOSE) {
  const prod = new Set(parseServiceNames(prodPath));
  const alpha = parseServiceNames(alphaPath);
  return alpha.filter((name) => !prod.has(name) && !ALPHA_ONLY_ALLOWLIST.has(name));
}

function main() {
  let offenders;
  try {
    offenders = findAlphaOnlyServices();
  } catch (error) {
    console.error('[compose-service-parity] failed');
    console.error(`- ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }

  if (offenders.length > 0) {
    console.error('[compose-service-parity] failed');
    for (const name of offenders) {
      console.error(
        `- \`${name}\` 가 ${ALPHA_COMPOSE} 에만 있고 ${PROD_COMPOSE} 에는 없습니다. ` +
          '프로덕션에도 선언하거나, 의도적 alpha 전용이면 ALPHA_ONLY_ALLOWLIST 에 이유와 함께 등록하세요.',
      );
    }
    process.exit(1);
  }

  console.log('[compose-service-parity] passed');
}

// 자체 테스트에서 import 할 때는 실행하지 않는다.
if (process.argv[1] && process.argv[1].endsWith('check-compose-service-parity.mjs')) main();
