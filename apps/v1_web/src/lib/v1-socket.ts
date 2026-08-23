import { io, type Socket } from 'socket.io-client';
import { getStoredV1Session } from './session-storage';
import { reportClientError } from './client-error-reporter';
import { randomUuid } from './uuid';

/**
 * 알림·채팅 소켓.
 *
 * **루트('/')가 아니라 `/game-operations` 에 붙는다.** 서버의 게이트웨이(RealtimeGateway)는
 * 레포 전체에서 하나뿐이고 그 네임스페이스에만 바인딩돼 있다 — 루트에는 아무 핸들러도 없다.
 * 루트로 붙으면 **연결은 성공하는데**(socket.io 는 루트 네임스페이스를 기본 제공한다)
 * `handleConnection` 이 돌지 않아 `user:<id>` 룸에 들어가지 못하고, `emitToUser` 가 보내는
 * `notification:new`·`chat:message` 가 한 건도 도달하지 않는다. 에러도 안 난다 — 조용히 죽는다.
 *
 * 핸드셰이크 `auth` 에 `clientInstanceId`/`authorizationSubjectVersion` 을 함께 싣는다.
 * 게이트웨이의 `parseConnectionMetadata()` 가 이 둘을 요구하고, 없으면 연결이
 * `SOCKET_METADATA_INVALID` → `SOCKET_AUTH_FAILED` 로 거부된다.
 */
const NOTIFICATION_CLIENT_INSTANCE_ID_KEY = 'teameet.v1.notifications.clientInstanceId';

/**
 * 이 탭의 알림 소켓 식별자. 경기 콘솔 소켓과 **다른 키**를 쓴다 — takeover 토큰이
 * `(gameId, authorizationSubject, clientInstanceId)` 에 묶이므로 두 소켓이 같은 id 를
 * 제시하면 콘솔의 재접속 판정이 흔들린다.
 */
function getNotificationClientInstanceId(): string {
  if (typeof window === 'undefined') return 'server';
  const existing = window.sessionStorage.getItem(NOTIFICATION_CLIENT_INSTANCE_ID_KEY);
  if (existing) return existing;
  const next = randomUuid();
  window.sessionStorage.setItem(NOTIFICATION_CLIENT_INSTANCE_ID_KEY, next);
  return next;
}

let socket: Socket | null = null;

export function getV1Socket(): Socket {
  if (socket) return socket;

  socket = io('/game-operations', {
    path: '/socket.io',
    // auth를 고정 객체가 아닌 함수로 넘겨야 socket.io-client가 매 (재)연결 시도마다
    // 호출해 최신 localStorage 세션을 반영한다 — 고정 객체는 최초 연결 시점 값이
    // 소켓 인스턴스 수명 내내 캐시되어, 재연결 시 세션이 갱신돼도 반영되지 않는다.
    auth: (cb: (data: Record<string, string | number>) => void) => {
      const { userId, userEmail } = getStoredV1Session();
      cb({
        ...(userId ? { 'x-v1-user-id': userId } : {}),
        ...(userEmail ? { 'x-v1-user-email': userEmail } : {}),
        clientInstanceId: getNotificationClientInstanceId(),
        // 이 소켓은 game.subscribe/takeover 를 쓰지 않는다 — 그 staleness 게이트에만
        // 쓰이는 값이라 0 으로 고정한다.
        authorizationSubjectVersion: 0,
      });
    },
    withCredentials: true,
  });

  socket.on('connect_error', (err: Error) => {
    reportClientError({
      message: err.message || '실시간 연결에 실패했어요.',
      level: 'warn',
      context: { flow: 'v1-socket', event: 'connect_error' },
    });
  });

  socket.on('disconnect', (reason: string) => {
    // 'io client disconnect'는 disconnectV1Socket()(로그아웃 등 의도된 세션 종료)이
    // 만드는 정상 흐름이다 — 에러로 리포트하지 않는다. 메시지는 reason별로 dedupe가
    // 갈라지지 않도록 고정값으로 두고, reason은 context에만 남긴다.
    if (reason === 'io client disconnect') return;
    reportClientError({
      message: '실시간 연결이 끊겼어요.',
      level: 'warn',
      context: { flow: 'v1-socket', event: 'disconnect', reason },
    });
  });

  return socket;
}

export function disconnectV1Socket(): void {
  socket?.disconnect();
  socket = null;
}
