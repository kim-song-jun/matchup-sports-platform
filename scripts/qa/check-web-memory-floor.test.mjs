import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  WEB_MEMORY_FLOOR_MIB,
  findWebMemoryViolations,
  parseMemoryMib,
  readWebMemoryMib,
} from './check-web-memory-floor.mjs';

function fixture(name, body) {
  const dir = mkdtempSync(join(tmpdir(), 'web-memory-floor-'));
  const path = join(dir, name);
  writeFileSync(path, body);
  return path;
}

function prodCompose({ apiMemory = '512M', webMemory = '768M' } = {}) {
  const webLimit = webMemory === null ? '' : `    deploy:
      resources:
        limits:
          memory: ${webMemory}
`;
  return `services:
  v1_api:
    image: api
    deploy:
      resources:
        limits:
          memory: ${apiMemory}

  v1_web:
    image: web
    ports:
      - "127.0.0.1:3013:3013"
${webLimit}
  nginx:
    image: nginx
    deploy:
      resources:
        limits:
          memory: 256M

volumes:
  data:
`;
}

const ALPHA_WITHOUT_LIMIT = `services:
  v1_web:
    image: alpha-web
`;

test('parseMemoryMib — 단위별로 MiB 로 바꾼다', () => {
  assert.equal(parseMemoryMib('512M'), 512);
  assert.equal(parseMemoryMib('768m'), 768);
  assert.equal(parseMemoryMib('1G'), 1024);
  assert.equal(parseMemoryMib('805306368'), 768);
  assert.throws(() => parseMemoryMib('lots'), /읽지 못했습니다/);
});

test('웹 한도가 하한 미만(512M, 사고 당시 값)이면 위반으로 잡는다', () => {
  const prod = fixture('prod.yml', prodCompose({ webMemory: '512M' }));
  const violations = findWebMemoryViolations(prod, fixture('alpha.yml', ALPHA_WITHOUT_LIMIT));
  assert.equal(violations.length, 1);
  assert.match(violations[0], /512MiB.*768MiB/);
});

test('웹 한도가 하한 이상이면 통과한다 — 하한 값 자체와 더 큰 값 모두', () => {
  for (const webMemory of ['768M', '1G']) {
    const prod = fixture('prod.yml', prodCompose({ webMemory }));
    assert.deepEqual(findWebMemoryViolations(prod, fixture('alpha.yml', ALPHA_WITHOUT_LIMIT)), [], webMemory);
  }
});

test('다른 서비스의 한도를 웹 한도로 읽지 않는다 — 웹만 낮을 때와 웹만 높을 때 모두', () => {
  const lowWeb = fixture('low.yml', prodCompose({ apiMemory: '1G', webMemory: '512M' }));
  assert.equal(readWebMemoryMib(lowWeb, { required: true }), 512);
  const highWeb = fixture('high.yml', prodCompose({ apiMemory: '512M', webMemory: '768M' }));
  assert.equal(readWebMemoryMib(highWeb, { required: true }), 768);
});

test('prod 의 웹에 한도가 없으면 조용히 통과하지 않고 던진다', () => {
  const prod = fixture('prod.yml', prodCompose({ webMemory: null }));
  assert.throws(() => findWebMemoryViolations(prod, fixture('alpha.yml', ALPHA_WITHOUT_LIMIT)), /limits\.memory 가 없습니다/);
});

test('alpha override 가 웹 한도를 하한 아래로 다시 정하면 잡는다', () => {
  const alpha = `services:
  v1_web:
    image: alpha-web
    deploy:
      resources:
        limits:
          memory: 384M
`;
  const violations = findWebMemoryViolations(fixture('prod.yml', prodCompose()), fixture('alpha.yml', alpha));
  assert.equal(violations.length, 1);
  assert.match(violations[0], /384MiB/);
});

test('실제 compose 파일이 하한을 지킨다', () => {
  assert.deepEqual(findWebMemoryViolations(), []);
  assert.ok(readWebMemoryMib('deploy/docker-compose.prod.yml', { required: true }) >= WEB_MEMORY_FLOOR_MIB);
});
