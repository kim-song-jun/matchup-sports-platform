'use strict';
// 웹·API 서버 명령이 `node --require` 로 먼저 읽는다(deploy/Dockerfile.v1-web, deploy/Dockerfile.v1-api).
//
// Node 의 http.Server.close() 는 새 연결만 막고 열린 연결이 모두 끝나기를 기다리는데, close() 뒤에도
// 재사용되는 keep-alive 연결에는 계속 `Connection: keep-alive` 로 답한다. nginx upstream keepalive 나
// 웹의 fetch 연결 풀처럼 연결을 계속 다시 쓰는 쪽이 있으면 close() 가 끝나지 않아 Docker 유예 끝의
// SIGKILL 까지 간다. 그래서 종료 신호를 받은 뒤에는 응답마다 `Connection: close` 를 붙이고, 응답을
// 끝내 쉬게 된 연결은 바로 닫는다. 처리 중인 요청은 그대로 끝까지 응답한다.
const dc = require('node:diagnostics_channel');

const SIGNALS = ['SIGTERM', 'SIGINT'];
const servers = new Set();
let draining = false;

// 그 순간 쉬는 연결은 앱이 부르는 server.close() 가 닫는다. 신호 전에 keep-alive 로 답한 응답은 끝난 뒤
// Node 의 keep-alive 타이머(1ms)로 닫힌다. 그 사이 새 요청이 오면 타이머가 풀리고 그 응답은 Connection: close 다.
function drain(server) {
  server.keepAliveTimeout = 1;
  server.keepAliveTimeoutBuffer = 0;
}

dc.subscribe('http.server.request.start', ({ response, server }) => {
  if (!servers.has(server)) {
    servers.add(server);
    if (draining) drain(server);
  }
  if (draining && !response.headersSent) response.setHeader('Connection', 'close');
});

function startDraining() {
  if (draining) return;
  draining = true;
  for (const server of servers) drain(server);
}

for (const signal of SIGNALS) {
  process.on(signal, function onShutdownSignal() {
    startDraining();
    // 신호를 처리하는 리스너가 이것뿐이면(앱이 자기 처리를 마치고 신호를 다시 보낸 경우 포함) Node 기본 종료를 따른다.
    if (process.listenerCount(signal) === 1) {
      process.removeListener(signal, onShutdownSignal);
      process.kill(process.pid, signal);
    }
  });
}
