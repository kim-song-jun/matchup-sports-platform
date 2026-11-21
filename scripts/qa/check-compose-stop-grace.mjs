#!/usr/bin/env node
/**
 * 컨테이너 종료 여유(`stop_grace_period`)가 앱이 정리에 쓰는 시간보다 짧아지지 않게 CI 에서 막는다.
 *
 * Docker 는 기본 10초 뒤에 SIGKILL 을 보낸다. 워커는 진행 중 일감을 GAME_OPERATION_SHUTDOWN_MS 까지
 * 기다린 뒤 임대를 풀게 짜여 있고, API 는 관리자 대진 트랜잭션이 45초까지 갈 수 있다. 여유가 그보다
 * 짧으면 배포·재생성마다 그 정리가 잘리고, 풀리지 않은 임대는 만료(30초)까지 일감이 멈춘다.
 *
 * 규칙: prod compose 의 워커는 (GAME_OPERATION_SHUTDOWN_MS + 5초) 이상, API 는 API_MIN_GRACE_SECONDS
 * 이상의 `stop_grace_period` 를 명시해야 한다. alpha override 가 값을 다시 정하면 같은 하한을 지킨다.
 */
import { readFileSync } from 'node:fs';

const PROD_COMPOSE = 'deploy/docker-compose.prod.yml';
const ALPHA_COMPOSE = 'deploy/docker-compose.alpha.yml';
const WORKER_SOURCE = 'apps/v1_api/src/jobs/v1-game-operations-worker.service.ts';
const MARGIN_SECONDS = 5;
/** 관리자 대진 트랜잭션 상한(45초) + 여유. 트랜잭션 timeout 을 늘리면 이 값도 같이 올린다. 이 여유가 의미를 가지려면 PrismaService 가 onApplicationShutdown 에서 연결을 끊어야 한다(prisma.service.shutdown.spec.ts). */
export const API_MIN_GRACE_SECONDS = 50;

export function readWorkerShutdownSeconds(path = WORKER_SOURCE) {
  const match = readFileSync(path, 'utf8').match(/export const GAME_OPERATION_SHUTDOWN_MS\s*=\s*([\d_]+)\s*;/);
  if (!match) throw new Error(`${path}: GAME_OPERATION_SHUTDOWN_MS 상수를 찾지 못했습니다`);
  return Number(match[1].replaceAll('_', '')) / 1000;
}

/** compose 의 `30s` · `1m` · `1m30s` · `1h` 표기를 초로 바꾼다. */
export function parseDurationSeconds(raw) {
  const text = String(raw).trim();
  const parts = [...text.matchAll(/(\d+(?:\.\d+)?)(ms|s|m|h)/g)];
  if (parts.length === 0 || parts.map((part) => part[0]).join('') !== text) {
    throw new Error(`시간 값을 읽지 못했습니다: ${raw}`);
  }
  const unit = { ms: 0.001, s: 1, m: 60, h: 3600 };
  return parts.reduce((sum, part) => sum + Number(part[1]) * unit[part[2]], 0);
}

/** `services:` 아래 서비스 하나의 블록을 돌려준다. 없으면 null. */
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

export function readStopGraceSeconds(path, service, { required }) {
  const block = serviceBlock(readFileSync(path, 'utf8').split('\n'), service);
  if (!block) {
    if (required) throw new Error(`${path}: \`${service}\` 서비스를 찾지 못했습니다`);
    return null;
  }
  const match = block.join('\n').match(/^ {4}stop_grace_period:\s*["']?([^\s"'#]+)/m);
  if (!match) {
    if (required) throw new Error(`${path}: \`${service}\` 에 stop_grace_period 가 없습니다 — Docker 기본 10초에 SIGKILL 을 받습니다`);
    return null;
  }
  return parseDurationSeconds(match[1]);
}

export function findStopGraceViolations({
  prodPath = PROD_COMPOSE,
  alphaPath = ALPHA_COMPOSE,
  workerSource = WORKER_SOURCE,
} = {}) {
  const required = new Map([
    ['v1_game_operations_worker', readWorkerShutdownSeconds(workerSource) + MARGIN_SECONDS],
    ['v1_api', API_MIN_GRACE_SECONDS],
  ]);
  const violations = [];
  for (const [path, mustExist] of [
    [prodPath, true],
    [alphaPath, false],
  ]) {
    for (const [service, floor] of required) {
      const seconds = readStopGraceSeconds(path, service, { required: mustExist });
      if (seconds !== null && seconds < floor) {
        violations.push(`${path}: ${service} stop_grace_period ${seconds}초가 하한 ${floor}초보다 짧습니다`);
      }
    }
  }
  return violations;
}

function main() {
  let violations;
  try {
    violations = findStopGraceViolations();
  } catch (error) {
    console.error('[compose-stop-grace] failed');
    console.error(`- ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
  if (violations.length > 0) {
    console.error('[compose-stop-grace] failed');
    for (const message of violations) console.error(`- ${message}`);
    process.exit(1);
  }
  console.log('[compose-stop-grace] passed');
}

if (process.argv[1] && process.argv[1].endsWith('check-compose-stop-grace.mjs')) main();
