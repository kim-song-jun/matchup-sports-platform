import { afterEach, describe, expect, it, vi } from 'vitest';

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
const ioMock = vi.fn((_uri: string, _options: { auth: Record<string, string> }) => mockSocket);

const reportClientError = vi.hoisted(() => vi.fn());

vi.mock('socket.io-client', () => ({ io: ioMock }));
vi.mock('./session-storage', () => ({
  getStoredV1Session: () => ({ userId: 'user-1', userEmail: null }),
}));
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
    expect(options.auth).toEqual(expect.objectContaining({ 'x-v1-user-id': 'user-1' }));
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
});
