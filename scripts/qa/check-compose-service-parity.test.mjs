import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

import { findAlphaOnlyServices } from './check-compose-service-parity.mjs';

function fixture(name, body) {
  const dir = mkdtempSync(join(tmpdir(), 'compose-parity-'));
  const path = join(dir, name);
  writeFileSync(path, body);
  return path;
}

const PROD = `services:
  v1_postgres:
    image: postgres:16-alpine
  v1_api:
    image: \${V1_API_IMAGE}
  v1_web:
    image: \${V1_WEB_IMAGE}

volumes:
  v1_postgres_data:
`;

test('alpha 에만 있는 서비스를 잡아낸다 — 이 체커가 존재하는 이유(워커 누락 실사고)', () => {
  const alpha = `services:
  v1_api:
    image: alpha
  v1_game_operations_worker:
    image: alpha
  v1_web:
    image: alpha
`;
  const offenders = findAlphaOnlyServices(fixture('prod.yml', PROD), fixture('alpha.yml', alpha));
  assert.deepEqual(offenders, ['v1_game_operations_worker']);
});

test('양쪽에 다 있으면 통과한다', () => {
  const alpha = `services:
  v1_api:
    image: alpha
  v1_web:
    image: alpha
`;
  assert.deepEqual(findAlphaOnlyServices(fixture('prod.yml', PROD), fixture('alpha.yml', alpha)), []);
});

test('prod 에만 있는 서비스는 위반이 아니다 — alpha 는 override 라 베이스를 물려받는다', () => {
  const alpha = `services:
  v1_api:
    image: alpha
`;
  // prod 의 v1_postgres / v1_web 은 alpha override 에 없어도 정상이다.
  assert.deepEqual(findAlphaOnlyServices(fixture('prod.yml', PROD), fixture('alpha.yml', alpha)), []);
});

test('services 블록이 없으면 조용히 통과하지 않고 던진다', () => {
  const broken = `version: "3"\nvolumes:\n  x:\n`;
  assert.throws(
    () => findAlphaOnlyServices(fixture('prod.yml', PROD), fixture('alpha.yml', broken)),
    /services/,
  );
});

test('services 아래에 서비스가 하나도 없으면 던진다 — 파싱 실패를 통과로 오인하지 않는다', () => {
  const empty = `services:\n\nvolumes:\n  x:\n`;
  assert.throws(
    () => findAlphaOnlyServices(fixture('prod.yml', PROD), fixture('alpha.yml', empty)),
    /하나도 읽지 못했습니다/,
  );
});

test('실제 저장소의 두 compose 파일에는 위반이 없다', () => {
  assert.deepEqual(findAlphaOnlyServices(), []);
});
