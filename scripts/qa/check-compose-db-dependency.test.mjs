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

const prodBase = ({ apiDb = '', workerDb = '' } = {}) => `services:
  v1_postgres:
    image: postgres:16-alpine
  v1_api:
    image: api
    depends_on:
${apiDb}      v1_uploads_init:
        condition: service_started
  v1_game_operations_worker:
    image: api
${workerDb ? `    depends_on:\n${workerDb}` : ''}  v1_uploads_init:
    image: busybox
`;

const ALPHA_OK = `services:
  v1_api:
    depends_on:
${HEALTHY_DB}  v1_game_operations_worker:
    depends_on:
${HEALTHY_DB}`;

function check(prod, alpha) {
  const prodPath = fixture('prod.yml', prod);
  const alphaPath = fixture('alpha.yml', alpha);
  return findDbDependencyViolations({ prodFiles: [prodPath], alphaFiles: [prodPath, alphaPath] });
}

test('운영 베이스는 DB 에 의존하지 않고 alpha 오버레이가 의존을 건다 — 통과', () => {
  assert.deepEqual(check(prodBase(), ALPHA_OK), []);
});

test('운영 베이스의 API 가 v1_postgres 에 의존하면 잡는다', () => {
  const violations = check(prodBase({ apiDb: HEALTHY_DB }), ALPHA_OK);
  assert.equal(violations.length, 1);
  assert.match(violations[0], /v1_api 가 v1_postgres 에 의존해요/);
});

test('운영 베이스의 워커가 v1_postgres 에 의존하면 잡는다', () => {
  const violations = check(prodBase({ workerDb: HEALTHY_DB }), ALPHA_OK);
  assert.equal(violations.length, 1);
  assert.match(violations[0], /v1_game_operations_worker 가 v1_postgres 에 의존해요/);
});

test('alpha 오버레이가 API 의 DB 의존을 빼먹으면 잡는다 — alpha 는 로컬 DB 를 쓴다', () => {
  const alpha = `services:
  v1_game_operations_worker:
    depends_on:
${HEALTHY_DB}`;
  const violations = check(prodBase(), alpha);
  assert.equal(violations.length, 1);
  assert.match(violations[0], /v1_api 가 v1_postgres 의 service_healthy 를 기다리지 않아요/);
});

test('alpha 의존이 service_healthy 가 아니면(service_started) 잡는다', () => {
  const alpha = ALPHA_OK.replaceAll('service_healthy', 'service_started');
  assert.equal(check(prodBase(), alpha).length, 2);
});

test('실제 저장소 compose 파일이 계약을 지킨다', () => {
  assert.deepEqual(findDbDependencyViolations(), []);
});
