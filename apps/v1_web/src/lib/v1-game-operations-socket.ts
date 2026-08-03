import { io, type Socket } from 'socket.io-client';
import { getStoredV1Session } from './session-storage';
import { reportClientError } from './client-error-reporter';
import { randomUuid } from './uuid';

/**
 * Task 21 — dedicated Socket.IO client for the `/game-operations` namespace
 * (frozen realtime contract). Deliberately separate from `getV1Socket()`
 * (`./v1-socket.ts`, the default `/` namespace used by chat/notifications):
 * this namespace's handshake `auth` payload additionally carries
 * `clientInstanceId`/`authorizationSubjectVersion`, which the gateway's
 * `parseConnectionMetadata()` requires and the default namespace does not.
 */

const CLIENT_INSTANCE_ID_KEY = 'teameet.v1.gameOps.clientInstanceId';

/**
 * Stable per-BROWSER-TAB id, persisted in `sessionStorage` (not
 * `localStorage`): a takeover token is bound to
 * `(gameId, authorizationSubject, clientInstanceId)` (frozen realtime
 * contract) — a reload in the SAME tab must keep presenting the SAME id so
 * the reconnect is recognized as the same client re-subscribing, not a
 * foreign one. A genuinely new tab (fresh sessionStorage) gets its own id.
 */
export function getGameOperationsClientInstanceId(): string {
  if (typeof window === 'undefined') return 'server';
  const existing = window.sessionStorage.getItem(CLIENT_INSTANCE_ID_KEY);
  if (existing) return existing;
  const next = randomUuid();
  window.sessionStorage.setItem(CLIENT_INSTANCE_ID_KEY, next);
  return next;
}

let socket: Socket | null = null;
let authorizationSubjectVersion = 0;

/** The console updates this whenever it learns its current staff-assignment
 * (or platform_ops admin-grant) version, so the NEXT (re)connection presents
 * it in the handshake — a stale version is what lets the gateway's
 * `game.subscribe`/`game.takeover.request` staleness gate deny a reconnect
 * whose cached authorization is now behind reality. */
export function setGameOperationsAuthorizationSubjectVersion(version: number): void {
  authorizationSubjectVersion = version;
}

export function getV1GameOperationsSocket(): Socket {
  if (socket) return socket;

  socket = io('/game-operations', {
    path: '/socket.io',
    // 함수형 auth: 매 (재)연결 시도마다 최신 세션/버전을 반영한다 — 고정 객체는
    // 최초 연결 시점 값이 소켓 인스턴스 수명 내내 캐시된다 (v1-socket.ts와 동일 이유).
    auth: (cb: (data: Record<string, string | number>) => void) => {
      const { userId, userEmail } = getStoredV1Session();
      cb({
        ...(userId ? { 'x-v1-user-id': userId } : {}),
        ...(userEmail ? { 'x-v1-user-email': userEmail } : {}),
        clientInstanceId: getGameOperationsClientInstanceId(),
        authorizationSubjectVersion,
      });
    },
    withCredentials: true,
  });

  socket.on('connect_error', (err: Error) => {
    reportClientError({
      message: err.message || '경기 운영 실시간 연결에 실패했어요.',
      level: 'warn',
      context: { flow: 'v1-game-operations-socket', event: 'connect_error' },
    });
  });

  socket.on('disconnect', (reason: string) => {
    if (reason === 'io client disconnect') return;
    reportClientError({
      message: '경기 운영 실시간 연결이 끊겼어요.',
      level: 'warn',
      context: { flow: 'v1-game-operations-socket', event: 'disconnect', reason },
    });
  });

  return socket;
}

export function disconnectV1GameOperationsSocket(): void {
  socket?.disconnect();
  socket = null;
}
