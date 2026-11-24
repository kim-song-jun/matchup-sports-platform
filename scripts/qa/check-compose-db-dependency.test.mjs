import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

import { findDbDependencyViolations } from './check-compose-db-dependency.mjs';

function fixture(name, body) {
  const path = join(mkdtempSync(join(tmpdir(), 'compose-db-dep-')), name);
  writeFileSync(path, body);
  return path;
}

const HEALTHY_DB = `      v1_postgres:
        condition: service_healthy
`;

const RDS_URL = 'postgresql://u:p@${V1_DB_HOST:-}:5432/db';

const prodBase = ({ dbService = false, apiDb = '', apiUrl = RDS_URL } = {}) => `services:
${dbService ? '  v1_postgres:\n    image: postgres:16-alpine\n' : ''}  v1_api:
    image: api
    environment:
      DATABASE_URL: ${apiUrl}
    depends_on:
${apiDb}      v1_uploads_init:
        condition: service_started
  v1_game_operations_worker:
    image: api
    environment:
      DATABASE_URL: ${RDS_URL}
  v1_uploads_init:
    image: busybox
`;

const alphaOverlay = ({ dbService = true, apiUrl = 'postgresql://u:p@${V1_DB_HOST:-v1_postgres}:5432/db' } = {}) => `services:
${dbService ? '  v1_postgres:\n    image: postgres:16-alpine\n' : ''}  v1_api:
${apiUrl ? `    environment:\n      DATABASE_URL: ${apiUrl}\n` : ''}    depends_on:
${HEALTHY_DB}  v1_game_operations_worker:
    environment:
      DATABASE_URL: postgresql://u:p@v1_postgres:5432/db
    depends_on:
${HEALTHY_DB}`;

function check(prod, alpha) {
  const prodPath = fixture('prod.yml', prod);
  const alphaPath = fixture('alpha.yml', alpha);
  return findDbDependencyViolations({ prodFiles: [prodPath], alphaFiles: [prodPath, alphaPath] });
}

test('운영은 DB 컨테이너·기본 호스트 없이, alpha 는 오버레이가 컨테이너 DB 를 건다 — 통과', () => {
  assert.deepEqual(check(prodBase(), alphaOverlay()), []);
});

test('운영 DATABASE_URL 이 V1_DB_HOST 없을 때 v1_postgres 로 떨어지면 잡는다 — 옛 컨테이너로 조용히 붙는 길', () => {
  const violations = check(prodBase({ apiUrl: 'postgresql://u:p@${V1_DB_HOST:-v1_postgres}:5432/db' }), alphaOverlay());
  assert.equal(violations.length, 1);
  assert.match(violations[0], /v1_api 의 DATABASE_URL 이 V1_DB_HOST 없이 'v1_postgres' 로 떨어져요/);
});

test('운영 compose 에 DB 컨테이너를 되살리고 API 가 의존하면 둘 다 잡는다', () => {
  const violations = check(prodBase({ dbService: true, apiDb: HEALTHY_DB }), alphaOverlay());
  assert.equal(violations.length, 2);
  assert.ok(violations.some((v) => /v1_postgres 서비스가 있어요/.test(v)));
  assert.ok(violations.some((v) => /v1_api 가 v1_postgres 에 의존해요/.test(v)));
});

test('alpha 오버레이가 API 의 DATABASE_URL 을 빼먹으면 잡는다 — 운영 베이스의 빈 호스트를 물려받아 alpha 가 깨진다', () => {
  const violations = check(prodBase(), alphaOverlay({ apiUrl: '' }));
  assert.equal(violations.length, 1);
  assert.match(violations[0], /v1_api 의 DATABASE_URL 호스트가 v1_postgres 가 아니에요/);
});

test('alpha 오버레이에 DB 컨테이너 정의가 없으면 compose 가 의존을 풀지 못해 실패한다', () => {
  assert.throws(() => check(prodBase(), alphaOverlay({ dbService: false })));
});

test('alpha 의존이 service_healthy 가 아니면(service_started) 잡는다', () => {
  const alpha = alphaOverlay().replaceAll('service_healthy', 'service_started');
  assert.equal(check(prodBase(), alpha).length, 2);
});

test('실제 저장소 compose 파일이 계약을 지킨다', () => {
  assert.deepEqual(findDbDependencyViolations(), []);
});
