// deploy/runtime/http-drain-on-shutdown.cjs 시험. 실제 Node http 서버를 자식 프로세스로 띄우고, nginx upstream
// keepalive 처럼 연결을 계속 다시 쓰는 클라이언트 아래에서 종료 신호부터 프로세스가 끝날 때까지를 잰다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
const DRAIN = `${root}deploy/runtime/http-drain-on-shutdown.cjs`;
const IMAGE_PATH = '/app/runtime/http-drain-on-shutdown.cjs';
const SLOW_MS = 1500;

// 운영 모드 Next(start-server.js)와 같은 종료: SIGTERM → server.close(cb) → exit(143).
// closeDelayMs 는 Nest 처럼 HTTP 서버를 닫기 전에 다른 종료 단계를 먼저 도는 경우다.
// 신호 뒤에 처리한 요청 수를 부모에게 알린다(대조군이 '연결이 다시 쓰여서' 안 끝나는지 가르는 데 쓴다).
const serverSource = (closeDelayMs) => `
const http = require('node:http');
let stopping = false;
const server = http.createServer((req, res) => {
  if (stopping) process.send('served-after-signal');
  setTimeout(() => res.end('ok'), req.url === '/slow' ? ${SLOW_MS} : 5);
});
server.listen(0, '127.0.0.1', () => process.send(server.address().port));
process.on('SIGTERM', () => {
  stopping = true;
  setTimeout(() => server.close(() => process.exit(143)), ${closeDelayMs});
});
`;

async function startServer({ drain, closeDelayMs = 0, source = serverSource(closeDelayMs) }) {
  const args = [...(drain ? ['--require', DRAIN] : []), '-e', source];
  const child = spawn(process.execPath, args, { stdio: ['ignore', 'ignore', 'inherit', 'ipc'] });
  const [port] = await once(child, 'message');
  const exited = new Promise((resolve) => child.once('exit', (code, signal) => resolve({ code, signal, at: Date.now() })));
  const served = { afterSignal: 0 };
  child.on('message', (m) => { if (m === 'served-after-signal') served.afterSignal += 1; });
  return { child, port, exited, served };
}

function get(agent, port, path) {
  const startedAt = Date.now();
  return new Promise((resolve) => {
    http.get({ host: '127.0.0.1', port, path, agent }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve({ startedAt, status: res.statusCode, connection: res.headers.connection, body }));
    }).on('error', (error) => resolve({ startedAt, error: error.code }));
  });
}

// 50ms 마다 요청을 보내 연결이 쉬는 틈 없이 다시 쓰이게 한다.
function steadyTraffic(agent, port) {
  const results = [];
  let stopped = false;
  (async () => {
    while (!stopped) {
      results.push(await get(agent, port, '/'));
      await new Promise((r) => setTimeout(r, 50));
    }
  })();
  return { results, stop: () => { stopped = true; } };
}

async function shutdownUnderTraffic({ drain, closeDelayMs = 0 }) {
  const server = await startServer({ drain, closeDelayMs });
  const agent = new http.Agent({ keepAlive: true, maxSockets: 2 });
  const traffic = steadyTraffic(agent, server.port);
  await new Promise((r) => setTimeout(r, 300));
  const slow = get(agent, server.port, '/slow');
  await new Promise((r) => setTimeout(r, 100));
  const sentAt = Date.now();
  server.child.kill('SIGTERM');
  const outcome = await Promise.race([server.exited, new Promise((r) => setTimeout(() => r(null), 4000))]);
  traffic.stop();
  if (!outcome) {
    server.child.kill('SIGKILL');
    await server.exited;
  }
  agent.destroy();
  // 신호 전에 시작한 요청은 keep-alive 로 답할 수 있으므로 신호 뒤에 시작한 요청만 본다.
  return {
    outcome, sentAt, slow: await slow, servedAfterSignal: server.served.afterSignal,
    afterSignal: traffic.results.filter((r) => r.startedAt > sentAt),
  };
}

test('대조군: 드레인 없이는 다시 쓰이는 keep-alive 연결 때문에 server.close() 가 끝나지 않는다', async () => {
  const { outcome, slow, servedAfterSignal } = await shutdownUnderTraffic({ drain: false });
  assert.equal(outcome, null, '드레인 없이 4초 안에 끝났다 — 이 시험이 매달림을 재현하지 못한다');
  assert.equal(slow.status, 200);
  // close() 뒤에는 새 연결을 받지 않으므로, 신호 뒤에 처리한 요청은 모두 이미 열린 연결로 들어온 것이다.
  assert.ok(servedAfterSignal >= 10, `신호 뒤 처리한 요청 ${servedAfterSignal}건 — 연결이 계속 다시 쓰이지 않았다`);
});

test('드레인: 처리 중 요청을 끝까지 응답하고, 그 뒤 바로 나간다', async () => {
  const { outcome, sentAt, slow } = await shutdownUnderTraffic({ drain: true });
  assert.ok(outcome, '종료 신호 뒤 4초 안에 끝나지 않았다');
  assert.equal(outcome.code, 143);
  assert.deepEqual([slow.status, slow.body], [200, 'ok'], `처리 중 요청이 잘렸다: ${JSON.stringify(slow)}`);
  assert.ok(outcome.at - sentAt < SLOW_MS + 1000, `종료까지 ${outcome.at - sentAt}ms`);
});

test('드레인: 처리 중이던 응답이 끝나 연결이 쉬게 되면 keep-alive 시간(5초)을 기다리지 않고 닫는다', async () => {
  const server = await startServer({ drain: true });
  const agent = new http.Agent({ keepAlive: true });
  const slow = get(agent, server.port, '/slow');
  await new Promise((r) => setTimeout(r, 100));
  const sentAt = Date.now();
  server.child.kill('SIGTERM');
  const outcome = await Promise.race([server.exited, new Promise((r) => setTimeout(() => r(null), 4000))]);
  if (!outcome) server.child.kill('SIGKILL');
  agent.destroy();
  assert.equal((await slow).status, 200);
  assert.ok(outcome && outcome.at - sentAt < SLOW_MS + 500, `종료까지 ${outcome ? outcome.at - sentAt : '4000+'}ms`);
});

test('드레인: 서버를 닫기 전 단계(Nest 의 종료 훅)에서 받은 요청은 Connection: close 로 답한다', async () => {
  const { outcome, sentAt, afterSignal } = await shutdownUnderTraffic({ drain: true, closeDelayMs: 800 });
  assert.ok(outcome, '종료 신호 뒤 4초 안에 끝나지 않았다');
  const answered = afterSignal.filter((r) => r.status === 200);
  assert.ok(answered.length > 0, '종료 훅 동안 받은 요청이 없다 — 시험 조건이 성립하지 않는다');
  assert.deepEqual([...new Set(answered.map((r) => r.connection))], ['close']);
  assert.ok(outcome.at - sentAt < SLOW_MS + 1000, `종료까지 ${outcome.at - sentAt}ms`);
});

test('앱이 종료 신호를 처리하지 않으면 Node 기본대로 신호로 끝난다', async () => {
  const source = `process.send(0); setInterval(() => {}, 1000);`;
  const server = await startServer({ drain: true, source });
  server.child.kill('SIGTERM');
  const outcome = await Promise.race([server.exited, new Promise((r) => setTimeout(() => r(null), 2000))]);
  if (!outcome) server.child.kill('SIGKILL');
  assert.deepEqual(outcome && [outcome.code, outcome.signal], [null, 'SIGTERM']);
});

test('웹·API 서버 명령은 드레인을 먼저 읽고, 같은 단계에서 그 파일을 이미지에 넣는다', () => {
  const cases = [
    ['deploy/Dockerfile.v1-web', 'apps/v1_web/server.js', 1],
    ['deploy/Dockerfile.v1-api', 'dist/src/main.js', 2],
  ];
  for (const [dockerfile, entry, expectedStages] of cases) {
    const stages = readFileSync(`${root}${dockerfile}`, 'utf8').split(/^FROM /m).slice(1);
    const serving = stages.filter((stage) => stage.includes(`"${entry}"]`));
    assert.equal(serving.length, expectedStages, `${dockerfile}: ${entry} 를 실행하는 단계 수`);
    for (const stage of serving) {
      const name = stage.split('\n')[0];
      assert.match(stage, new RegExp(`CMD \\["node", "--require", "${IMAGE_PATH}", "${entry}"\\]`), `${dockerfile} ${name}: CMD`);
      assert.match(stage, new RegExp(`^COPY deploy/runtime/http-drain-on-shutdown\\.cjs ${IMAGE_PATH}$`, 'm'), `${dockerfile} ${name}: COPY`);
    }
  }
});
