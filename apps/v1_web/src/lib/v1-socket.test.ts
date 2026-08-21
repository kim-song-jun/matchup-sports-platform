import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StoredV1Session } from './session-storage';

// on() 리스너를 실제로 저장해 두어, 테스트에서 handshake 실패/연결 끊김을 재현할 수 있게 한다
// (jsdom 환경에는 실제 소켓 서버가 없으므로 socket.io-client 자체를 목킹한다).
const listeners = new Map<string, (...args: unknown[]) => void>();
const mockSocket = {
  connected: false,
  connect: vi.fn(),
  disconnect: vi.fn(),
  on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
    listeners.set(event, handler);
  }),
  off: vi.fn(),
  emit: vi.fn(),
};
type AuthCallback = (data: Record<string, string | number>) => void;
const ioMock = vi.fn((_uri: string, _options: { auth: (cb: AuthCallback) => void }) => mockSocket);

const reportClientError = vi.hoisted(() => vi.fn());
const getStoredV1Session = vi.hoisted(() =>
  vi.fn<() => StoredV1Session>(() => ({ userId: 'user-1', userEmail: null })),
);

vi.mock('socket.io-client', () => ({ io: ioMock }));
vi.mock('./session-storage', () => ({ getStoredV1Session }));
vi.mock('./client-error-reporter', () => ({ reportClientError }));

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  listeners.clear();
});

describe('getV1Socket', () => {
  it('creates exactly one socket across repeated calls', async () => {
    const { getV1Socket } = await import('./v1-socket');

    const a = getV1Socket();
    const b = getV1Socket();

    expect(a).toBe(b);
    expect(ioMock).toHaveBeenCalledTimes(1);
  });

  it('passes dev auth headers as the handshake auth payload', async () => {
    const { getV1Socket } = await import('./v1-socket');

    getV1Socket();

    const [, options] = ioMock.mock.calls[0];
    expect(typeof options.auth).toBe('function');

    const cb = vi.fn();
    options.auth(cb);
    expect(cb).toHaveBeenCalledWith(expect.objectContaining({ 'x-v1-user-id': 'user-1' }));
  });

  it('re-reads the stored session on every (re)connection attempt instead of caching the first value', async () => {
    const { getV1Socket } = await import('./v1-socket');

    getV1Socket();

    const [, options] = ioMock.mock.calls[0];

    // 최초 연결 시점 세션은 user-1
    const firstCb = vi.fn();
    options.auth(firstCb);
    expect(firstCb).toHaveBeenCalledWith(expect.objectContaining({ 'x-v1-user-id': 'user-1' }));

    // 세션이 갱신된 뒤(예: 로그인 전환) socket.io-client가 재연결을 시도하며 auth를 다시 호출한다.
    getStoredV1Session.mockReturnValue({ userId: 'user-2', userEmail: 'user2@teameet.v1' });
    const secondCb = vi.fn();
    options.auth(secondCb);

    expect(secondCb).toHaveBeenCalledWith(
      expect.objectContaining({
        'x-v1-user-id': 'user-2',
        'x-v1-user-email': 'user2@teameet.v1',
      }),
    );
  });
});

describe('getV1Socket — 네임스페이스와 핸드셰이크 메타데이터', () => {
  it('게이트웨이가 있는 네임스페이스에 붙는다', async () => {
    // 루트('/')에는 게이트웨이가 없다. 거기 붙으면 연결은 되지만 user 룸에 못 들어가고
    // notification:new / chat:message 가 한 건도 도달하지 않는다(에러도 없이 조용히).
    const { getV1Socket } = await import('./v1-socket');
    getV1Socket();
    expect(ioMock.mock.calls[0][0]).toBe('/game-operations');
  });

  it('게이트웨이가 요구하는 연결 메타데이터를 함께 보낸다', async () => {
    // parseConnectionMetadata() 가 이 둘을 요구한다 — 없으면 SOCKET_METADATA_INVALID 로 거부된다.
    const { getV1Socket } = await import('./v1-socket');
    getV1Socket();
    const cb = vi.fn();
    ioMock.mock.calls[0][1].auth(cb);
    expect(cb).toHaveBeenCalledWith(
      expect.objectContaining({
        clientInstanceId: expect.any(String),
        authorizationSubjectVersion: 0,
      }),
    );
  });

  it('경기 콘솔 소켓과 다른 clientInstanceId 를 쓴다', async () => {
    // takeover 토큰이 (gameId, authorizationSubject, clientInstanceId) 에 묶인다 —
    // 두 소켓이 같은 id 를 제시하면 콘솔의 재접속 판정이 흔들린다.
    const { getV1Socket } = await import('./v1-socket');
    getV1Socket();
    const cb = vi.fn();
    ioMock.mock.calls[0][1].auth(cb);
    const notificationId = cb.mock.calls[0][0].clientInstanceId;
    expect(window.sessionStorage.getItem('teameet.v1.notifications.clientInstanceId')).toBe(notificationId);
    expect(window.sessionStorage.getItem('teameet.v1.gameOps.clientInstanceId')).toBeNull();
  });
});

describe('disconnectV1Socket', () => {
  it('disconnects and clears the singleton so the next call reconnects', async () => {
    const { getV1Socket, disconnectV1Socket } = await import('./v1-socket');
    getV1Socket();

    disconnectV1Socket();
    getV1Socket();

    expect(mockSocket.disconnect).toHaveBeenCalledTimes(1);
    expect(ioMock).toHaveBeenCalledTimes(2);
  });
});

describe('connection failure reporting', () => {
  it('reports a warn-level client error when the handshake fails with connect_error', async () => {
    const { getV1Socket } = await import('./v1-socket');
    getV1Socket();

    const handler = listeners.get('connect_error');
    expect(handler).toBeDefined();
    handler?.(new Error('handshake rejected'));

    expect(reportClientError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'handshake rejected',
        level: 'warn',
        context: expect.objectContaining({ flow: 'v1-socket', event: 'connect_error' }),
      }),
    );
  });

  it('reports a warn-level client error when the transport disconnects', async () => {
    const { getV1Socket } = await import('./v1-socket');
    getV1Socket();

    const handler = listeners.get('disconnect');
    expect(handler).toBeDefined();
    handler?.('transport close');

    expect(reportClientError).toHaveBeenCalledWith(
      expect.objectContaining({
        level: 'warn',
        context: expect.objectContaining({ flow: 'v1-socket', event: 'disconnect', reason: 'transport close' }),
      }),
    );
  });

  it('does not report an intentional client-initiated disconnect (e.g. logout) as an error', async () => {
    const { getV1Socket } = await import('./v1-socket');
    getV1Socket();

    const handler = listeners.get('disconnect');
    handler?.('io client disconnect');

    expect(reportClientError).not.toHaveBeenCalled();
  });
});
