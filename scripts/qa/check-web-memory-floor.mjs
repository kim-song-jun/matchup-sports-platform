#!/usr/bin/env node
/**
 * 웹 컨테이너 메모리 한도가 heap 부족 재시작이 나던 값(512M) 아래로 돌아가지 않게 CI 에서 막는다.
 *
 * Next 웹은 NODE_OPTIONS 를 두지 않아 Node 가 컨테이너 한도의 약 절반을 JS heap 상한으로 잡는다
 * (512M → 259MB, 768M → 396MB). 서버 렌더 요청이 몰리면 512M 에서 `Ineffective mark-compacts near
 * heap limit` 으로 프로세스가 죽고 재시작까지 약 3분 502/504 가 난다. 한도를 손으로
 * `docker update` 해 두기만 하면 다음 컨테이너 재생성(배포·재부팅)에서 compose 값으로 돌아가므로,
 * 값은 compose 파일이 들고 있어야 한다.
 *
 * 규칙: prod compose 의 v1_web 은 명시적 memory 한도를 가져야 하고 WEB_MEMORY_FLOOR_MIB 이상이어야
 * 한다. alpha override 가 v1_web 한도를 다시 정하면 그 값도 같은 하한을 지켜야 한다.
 */
import { readFileSync } from 'node:fs';

const PROD_COMPOSE = 'deploy/docker-compose.prod.yml';
const ALPHA_COMPOSE = 'deploy/docker-compose.alpha.yml';
export const WEB_SERVICE = 'v1_web';
export const WEB_MEMORY_FLOOR_MIB = 768;

const UNIT_MIB = new Map([
  ['k', 1 / 1024],
  ['m', 1],
  ['g', 1024],
]);

/** compose 의 `512M` · `1G` · `805306368`(바이트) 표기를 MiB 로 바꾼다. */
export function parseMemoryMib(raw) {
  const match = String(raw).trim().match(/^(\d+(?:\.\d+)?)\s*([kmgb]?)b?$/i);
  if (!match) throw new Error(`메모리 값을 읽지 못했습니다: ${raw}`);
  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  if (unit === '') return amount / 1024 / 1024; // 단위 없음 = 바이트
  if (unit === 'b') return amount / 1024 / 1024;
  return amount * UNIT_MIB.get(unit);
}

/** `services:` 아래 서비스 하나의 블록(들여쓰기 4 이상 줄)을 돌려준다. 없으면 null. */
function serviceBlock(lines, name) {
  const start = lines.findIndex((line) => /^services:\s*$/.test(line));
  if (start === -1) throw new Error('최상위 `services:` 블록을 찾지 못했습니다');
  const body = [];
  let inService = false;
  let found = false;
  for (const line of lines.slice(start + 1)) {
    if (/^\S/.test(line)) break;
    const header = line.match(/^ {2}([A-Za-z0-9_.-]+):\s*$/);
    if (header) {
      inService = header[1] === name;
      found ||= inService;
      continue;
    }
    if (inService) body.push(line);
  }
  return found ? body : null;
}

/** 서비스 블록의 `deploy.resources.limits.memory` 값을 문자열로 돌려준다. 없으면 null. */
function limitMemory(block) {
  const text = block.join('\n');
  const match = text.match(/^ {4}deploy:\s*\n {6}resources:\s*\n {8}limits:\s*\n(?: {10}\S.*\n)*? {10}memory:\s*["']?([^\s"'#]+)/m);
  return match ? match[1] : null;
}

export function readWebMemoryMib(path, { required }) {
  const lines = readFileSync(path, 'utf8').split('\n');
  const block = serviceBlock(lines, WEB_SERVICE);
  if (!block) {
    if (required) throw new Error(`${path}: \`${WEB_SERVICE}\` 서비스를 찾지 못했습니다`);
    return null;
  }
  const raw = limitMemory(block);
  if (raw === null) {
    if (required) throw new Error(`${path}: \`${WEB_SERVICE}\` 에 deploy.resources.limits.memory 가 없습니다`);
    return null;
  }
  return parseMemoryMib(raw);
}

export function findWebMemoryViolations(prodPath = PROD_COMPOSE, alphaPath = ALPHA_COMPOSE) {
  const violations = [];
  const sources = [
    [prodPath, true],
    [alphaPath, false],
  ];
  for (const [path, required] of sources) {
    const mib = readWebMemoryMib(path, { required });
    if (mib !== null && mib < WEB_MEMORY_FLOOR_MIB) {
      violations.push(`${path}: ${WEB_SERVICE} 메모리 한도 ${mib}MiB 가 하한 ${WEB_MEMORY_FLOOR_MIB}MiB 보다 낮습니다`);
    }
  }
  return violations;
}

function main() {
  let violations;
  try {
    violations = findWebMemoryViolations();
  } catch (error) {
    console.error('[web-memory-floor] failed');
    console.error(`- ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
  if (violations.length > 0) {
    console.error('[web-memory-floor] failed');
    for (const message of violations) console.error(`- ${message}`);
    console.error('- 512M 에서는 heap 상한이 259MB 라 서버 렌더가 몰리면 웹이 반복해서 죽었습니다. 값을 낮추려면 원인을 먼저 해결하세요.');
    process.exit(1);
  }
  console.log('[web-memory-floor] passed');
}

// 자체 테스트에서 import 할 때는 실행하지 않는다.
if (process.argv[1] && process.argv[1].endsWith('check-web-memory-floor.mjs')) main();
