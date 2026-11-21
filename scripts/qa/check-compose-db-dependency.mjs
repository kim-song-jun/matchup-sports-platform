#!/usr/bin/env node
/**
 * 운영 API/워커가 로컬 `v1_postgres` 컨테이너의 건강 상태에 묶이지 않도록 compose 의존 그래프를 검사한다.
 *
 * 운영 DB 는 RDS 라 `v1_postgres` 는 앱이 접속하지 않는 유휴 컨테이너다. API/워커가 그 컨테이너의
 * `service_healthy` 를 기다리면 유휴 컨테이너가 unhealthy 일 때 전체 `up -d` 에서 API 가 뜨지 않는다.
 * 반대로 alpha 는 DB 가 그 컨테이너라 의존이 반드시 있어야 한다.
 *
 * 텍스트 파싱 대신 `docker compose config` 로 병합된 결과를 읽는다 — 오버레이 병합 규칙까지 그대로 반영된다.
 */
import { execFileSync } from 'node:child_process';

const PROD_COMPOSE = 'deploy/docker-compose.prod.yml';
const ALPHA_COMPOSE = 'deploy/docker-compose.alpha.yml';
const DB_SERVICE = 'v1_postgres';
const APP_SERVICES = ['v1_api', 'v1_game_operations_worker'];

// 보간만 통과시키는 자리표시 값이다. 의존 그래프에는 영향을 주지 않는다.
const INTERPOLATION_ENV = {
  V1_API_IMAGE: 'placeholder/api:0',
  V1_WEB_IMAGE: 'placeholder/web:0',
  ALPHA_API_IMAGE: 'placeholder/api:0',
  ALPHA_WEB_IMAGE: 'placeholder/web:0',
  DB_PASSWORD: 'placeholder',
  JWT_SECRET: 'placeholder',
};

export function readDependsOn(files) {
  const args = ['compose', ...files.flatMap((file) => ['-f', file]), 'config', '--format', 'json'];
  const raw = execFileSync('docker', args, {
    env: { ...process.env, ...INTERPOLATION_ENV },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const { services } = JSON.parse(raw);
  const result = {};
  for (const name of APP_SERVICES) {
    if (!services?.[name]) throw new Error(`${files.join(' + ')}: ${name} 서비스를 찾지 못했습니다`);
    result[name] = services[name].depends_on ?? {};
  }
  return result;
}

export function findDbDependencyViolations({ prodFiles = [PROD_COMPOSE], alphaFiles = [PROD_COMPOSE, ALPHA_COMPOSE] } = {}) {
  const violations = [];
  const prod = readDependsOn(prodFiles);
  const alpha = readDependsOn(alphaFiles);
  for (const name of APP_SERVICES) {
    if (DB_SERVICE in prod[name]) {
      violations.push(`${prodFiles.join(' + ')}: ${name} 가 ${DB_SERVICE} 에 의존해요 — 운영 DB 는 RDS 라 유휴 컨테이너의 건강 상태에 묶이면 안 돼요`);
    }
    if (alpha[name][DB_SERVICE]?.condition !== 'service_healthy') {
      violations.push(`${alphaFiles.join(' + ')}: ${name} 가 ${DB_SERVICE} 의 service_healthy 를 기다리지 않아요 — alpha DB 가 그 컨테이너예요`);
    }
  }
  return violations;
}

function main() {
  let violations;
  try {
    violations = findDbDependencyViolations();
  } catch (error) {
    console.error('[compose-db-dependency] failed');
    console.error(`- ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
  if (violations.length > 0) {
    console.error('[compose-db-dependency] failed');
    for (const violation of violations) console.error(`- ${violation}`);
    process.exit(1);
  }
  console.log('[compose-db-dependency] passed');
}

if (process.argv[1] && process.argv[1].endsWith('check-compose-db-dependency.mjs')) main();
