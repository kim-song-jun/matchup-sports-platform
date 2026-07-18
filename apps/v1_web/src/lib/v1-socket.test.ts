import { afterEach, describe, expect, it, vi } from 'vitest';

const mockSocket = { connected: false, connect: vi.fn(), disconnect: vi.fn(), on: vi.fn(), off: vi.fn(), emit: vi.fn() };
const ioMock = vi.fn((_uri: string, _options: { auth: Record<string, string> }) => mockSocket);

vi.mock('socket.io-client', () => ({ io: ioMock }));
vi.mock('./session-storage', () => ({
  getStoredV1Session: () => ({ userId: 'user-1', userEmail: null }),
}));

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
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
