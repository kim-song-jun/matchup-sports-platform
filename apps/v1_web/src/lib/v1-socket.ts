import { io, type Socket } from 'socket.io-client';
import { getStoredV1Session } from './session-storage';
import { reportClientError } from './client-error-reporter';

let socket: Socket | null = null;

export function getV1Socket(): Socket {
  if (socket) return socket;

  const { userId, userEmail } = getStoredV1Session();
  socket = io('/', {
    path: '/socket.io',
    auth: {
      ...(userId ? { 'x-v1-user-id': userId } : {}),
      ...(userEmail ? { 'x-v1-user-email': userEmail } : {}),
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
