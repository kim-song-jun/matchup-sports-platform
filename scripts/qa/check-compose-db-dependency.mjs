#!/usr/bin/env node
/**
 * 운영·alpha 의 DB 연결을 compose 병합 결과로 검사한다.
 *
 * - 운영(docker-compose.prod.yml): DB 는 RDS 다. DB 컨테이너(`v1_postgres`)를 정의하지 않고, API/워커가
 *   그 컨테이너에 의존하지 않으며, DATABASE_URL 호스트가 `V1_DB_HOST` 없이 그 컨테이너로 떨어지지 않는다.
 *   옛 컨테이너가 서버에 남아 있으면 이름이 그대로 풀리므로, 기본값이 있으면 앱이 조용히 옛 DB 를 쓴다.
 * - alpha(운영 + docker-compose.alpha.yml): DB 가 같은 호스트의 `v1_postgres` 라 API/워커가 그 컨테이너의
 *   service_healthy 를 기다리고, DATABASE_URL 이 그 컨테이너를 가리켜야 한다.
 *
 * 텍스트 파싱 대신 `docker compose config` 로 병합된 결과를 읽는다 — 오버레이 병합 규칙까지 그대로 반영된다.
 */
import { execFileSync } from 'node:child_process';

const PROD_COMPOSE = 'deploy/docker-compose.prod.yml';
const ALPHA_COMPOSE = 'deploy/docker-compose.alpha.yml';
const DB_SERVICE = 'v1_postgres';
const APP_SERVICES = ['v1_api', 'v1_game_operations_worker'];

// 보간만 통과시키는 자리표시 값이다. V1_DB_HOST 는 일부러 비운다 — 값이 없을 때 어디로 떨어지는지를 본다.
const INTERPOLATION_ENV = {
  V1_API_IMAGE: 'placeholder/api:0',
  V1_WEB_IMAGE: 'placeholder/web:0',
  ALPHA_API_IMAGE: 'placeholder/api:0',
  ALPHA_WEB_IMAGE: 'placeholder/web:0',
  DB_PASSWORD: 'placeholder',
  JWT_SECRET: 'placeholder',
};

export function readServices(files) {
  const args = ['compose', ...files.flatMap((file) => ['-f', file]), 'config', '--format', 'json'];
  const env = { ...process.env, ...INTERPOLATION_ENV };
  delete env.V1_DB_HOST;
  const raw = execFileSync('docker', args, {
    env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const { services } = JSON.parse(raw);
  for (const name of APP_SERVICES) {
    if (!services?.[name]) throw new Error(`${files.join(' + ')}: ${name} 서비스를 찾지 못했습니다`);
  }
  return services;
}

// `postgresql://user:pass@host:5432/db` 의 host. 비밀번호 부분은 보지 않는다.
export function databaseUrlHost(url) {
  const match = /^postgres(?:ql)?:\/\/[^@]*@([^:/?]*)/.exec(url ?? '');
  return match ? match[1] : null;
}

export function findDbDependencyViolations({ prodFiles = [PROD_COMPOSE], alphaFiles = [PROD_COMPOSE, ALPHA_COMPOSE] } = {}) {
  const violations = [];
  const prod = readServices(prodFiles);
  const alpha = readServices(alphaFiles);
  const prodLabel = prodFiles.join(' + ');
  const alphaLabel = alphaFiles.join(' + ');

  if (DB_SERVICE in prod) {
    violations.push(`${prodLabel}: ${DB_SERVICE} 서비스가 있어요 — 운영 DB 는 RDS 라 앱이 쓰지 않는 옛 DB 컨테이너가 계속 떠요`);
  }
  for (const name of APP_SERVICES) {
    if (DB_SERVICE in (prod[name].depends_on ?? {})) {
      violations.push(`${prodLabel}: ${name} 가 ${DB_SERVICE} 에 의존해요 — 운영 DB 는 RDS 예요`);
    }
    const prodHost = databaseUrlHost(prod[name].environment?.DATABASE_URL);
    if (prodHost === null) {
      violations.push(`${prodLabel}: ${name} 의 DATABASE_URL 을 읽지 못했어요`);
    } else if (prodHost !== '') {
      violations.push(`${prodLabel}: ${name} 의 DATABASE_URL 이 V1_DB_HOST 없이 '${prodHost}' 로 떨어져요 — 운영은 기본값 없이 RDS 호스트만 받아요`);
    }
    if (alpha[name].depends_on?.[DB_SERVICE]?.condition !== 'service_healthy') {
      violations.push(`${alphaLabel}: ${name} 가 ${DB_SERVICE} 의 service_healthy 를 기다리지 않아요 — alpha DB 가 그 컨테이너예요`);
    }
    const alphaHost = databaseUrlHost(alpha[name].environment?.DATABASE_URL);
    if (alphaHost !== DB_SERVICE) {
      violations.push(`${alphaLabel}: ${name} 의 DATABASE_URL 호스트가 ${DB_SERVICE} 가 아니에요('${alphaHost ?? '읽지 못함'}') — alpha DB 가 그 컨테이너예요`);
    }
  }
  if (!(DB_SERVICE in alpha)) {
    violations.push(`${alphaLabel}: ${DB_SERVICE} 서비스가 없어요 — alpha DB 컨테이너는 오버레이가 정의해요`);
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
