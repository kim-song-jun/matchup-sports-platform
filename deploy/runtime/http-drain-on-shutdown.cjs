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

dc.subscribe('http.server.request.start', ({ response, server }) => {
  servers.add(server);
  if (draining && !response.headersSent) response.setHeader('Connection', 'close');
});

// 종료 신호 전에 헤더를 보낸 응답은 keep-alive 로 끝나므로, 끝난 직후 쉬는 연결로 바뀔 때 닫는다.
dc.subscribe('http.server.response.finish', ({ server }) => {
  if (draining) setImmediate(() => server.closeIdleConnections());
});

function startDraining() {
  if (draining) return;
  draining = true;
  for (const server of servers) server.closeIdleConnections();
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
