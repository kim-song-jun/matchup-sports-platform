import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  API_MIN_GRACE_SECONDS,
  findStopGraceViolations,
  parseDurationSeconds,
  readWorkerShutdownSeconds,
} from './check-compose-stop-grace.mjs';

const dir = mkdtempSync(join(tmpdir(), 'compose-stop-grace-'));
let counter = 0;
function fixture(body) {
  const path = join(dir, `f${counter++}.yml`);
  writeFileSync(path, body);
  return path;
}

function workerSource(ms) {
  const path = join(dir, `worker${counter++}.ts`);
  writeFileSync(path, `export const GAME_OPERATION_SHUTDOWN_MS = ${ms};\n`);
  return path;
}

function compose({ api, worker }) {
  const grace = (value) => (value === null ? '' : `    stop_grace_period: ${value}\n`);
  return `services:
  v1_api:
    image: api
${grace(api)}    restart: always

  v1_game_operations_worker:
    image: api
${grace(worker)}    restart: always

  nginx:
    image: nginx
    stop_grace_period: 1s
`;
}

const OK = { api: '60s', worker: '30s' };
const SRC = workerSource('20_000');

function check(prod, alpha = 'services:\n  v1_api:\n    image: api\n') {
  return findStopGraceViolations({ prodPath: fixture(compose(prod)), alphaPath: fixture(alpha), workerSource: SRC });
}

test('워커 종료 대기 + 여유, API 트랜잭션 상한 이상이면 통과', () => {
  assert.deepEqual(check(OK), []);
});

test('워커 stop_grace_period 가 없으면 Docker 기본 10초라 거절한다', () => {
  assert.throws(() => check({ ...OK, worker: null }), /v1_game_operations_worker.*stop_grace_period 가 없습니다/);
});

test('API stop_grace_period 가 없으면 거절한다', () => {
  assert.throws(() => check({ ...OK, api: null }), /v1_api.*stop_grace_period 가 없습니다/);
});

test('워커 여유가 종료 대기(20초)보다 짧으면 잡는다', () => {
  const violations = check({ ...OK, worker: '20s' });
  assert.equal(violations.length, 1);
  assert.match(violations[0], /v1_game_operations_worker.*20초.*25초/);
});

test('워커 종료 대기 상수를 늘리면 하한도 같이 올라간다', () => {
  const longer = workerSource('40_000');
  const violations = findStopGraceViolations({
    prodPath: fixture(compose(OK)),
    alphaPath: fixture('services:\n  v1_api:\n    image: api\n'),
    workerSource: longer,
  });
  assert.equal(violations.length, 1);
  assert.match(violations[0], /v1_game_operations_worker.*30초.*45초/);
});

test('API 여유가 45초 트랜잭션보다 짧으면 잡는다', () => {
  const violations = check({ ...OK, api: '30s' });
  assert.equal(violations.length, 1);
  assert.match(violations[0], new RegExp(`v1_api.*30초.*${API_MIN_GRACE_SECONDS}초`));
});

test('alpha 오버레이가 여유를 다시 낮추면 잡는다', () => {
  const alpha = `services:
  v1_api:
    stop_grace_period: 10s
`;
  const violations = check(OK, alpha);
  assert.equal(violations.length, 1);
  assert.match(violations[0], /v1_api.*10초/);
});

test('시간 표기 1m · 1m30s · 500ms 를 초로 읽는다', () => {
  assert.equal(parseDurationSeconds('1m'), 60);
  assert.equal(parseDurationSeconds('1m30s'), 90);
  assert.equal(parseDurationSeconds('500ms'), 0.5);
  assert.throws(() => parseDurationSeconds('30'), /시간 값을 읽지 못했습니다/);
});

test('실제 워커 소스의 종료 대기 상수를 읽는다', () => {
  assert.equal(readWorkerShutdownSeconds(), 20);
});

test('이 저장소의 compose 가 규칙을 지킨다', () => {
  assert.deepEqual(findStopGraceViolations(), []);
});
