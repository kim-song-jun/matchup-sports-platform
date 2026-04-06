import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// Mock socket.io-client before any imports
const mockOn = vi.fn();
const mockOff = vi.fn();
const mockConnect = vi.fn();
const mockDisconnect = vi.fn();
const mockEmit = vi.fn();

const mockSocket = {
  on: mockOn,
  off: mockOff,
  connect: mockConnect,
  disconnect: mockDisconnect,
  emit: mockEmit,
  connected: false,
  auth: { token: '' },
};

vi.mock('socket.io-client', () => ({
  io: vi.fn((url: string, opts: { auth: { token: string } }) => {
    mockSocket.auth = opts.auth;
    return mockSocket;
  }),
}));

// Mock auth store
let mockToken: string | null = 'test-jwt-token';
vi.mock('@/stores/auth-store', () => ({
  useAuthStore: vi.fn((selector: (s: { accessToken: string | null }) => unknown) =>
    selector({ accessToken: mockToken }),
  ),
}));

// Must import after mocks are set up
import { useRealtime } from '../use-realtime';

describe('useRealtime', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockToken = 'test-jwt-token';
    mockSocket.connected = false;
    mockSocket.auth = { token: '' };
    // Reset the singleton in realtime-client
    vi.resetModules();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('starts in disconnected state', () => {
    mockToken = null;
    const { result } = renderHook(() => useRealtime());
    expect(result.current.connected).toBe(false);
    expect(result.current.connectionState).toBe('disconnected');
    expect(result.current.socket).toBeNull();
  });

  it('calls socket.connect() when token is present', () => {
    mockToken = 'valid-token';
    renderHook(() => useRealtime());
    expect(mockConnect).toHaveBeenCalledTimes(1);
  });

  it('registers connect/disconnect/connect_error event handlers', () => {
    mockToken = 'valid-token';
    renderHook(() => useRealtime());

    const registeredEvents = mockOn.mock.calls.map((c: [string]) => c[0]);
    expect(registeredEvents).toContain('connect');
    expect(registeredEvents).toContain('disconnect');
    expect(registeredEvents).toContain('connect_error');
  });

  it('transitions to connected state on connect event', () => {
    mockToken = 'valid-token';
    const { result } = renderHook(() => useRealtime());

    // Simulate server sending 'connect'
    const connectHandler = mockOn.mock.calls.find((c: [string]) => c[0] === 'connect')?.[1];
    act(() => {
      connectHandler?.();
    });

    expect(result.current.connected).toBe(true);
    expect(result.current.connectionState).toBe('connected');
    expect(result.current.error).toBeNull();
  });

  it('transitions to disconnected state on disconnect event', () => {
    mockToken = 'valid-token';
    const { result } = renderHook(() => useRealtime());

    const connectHandler = mockOn.mock.calls.find((c: [string]) => c[0] === 'connect')?.[1];
    act(() => connectHandler?.());

    const disconnectHandler = mockOn.mock.calls.find((c: [string]) => c[0] === 'disconnect')?.[1];
    act(() => disconnectHandler?.());

    expect(result.current.connected).toBe(false);
    expect(result.current.connectionState).toBe('disconnected');
  });

  it('transitions to error state on connect_error event', () => {
    mockToken = 'valid-token';
    const { result } = renderHook(() => useRealtime());

    const errHandler = mockOn.mock.calls.find((c: [string]) => c[0] === 'connect_error')?.[1];
    const err = new Error('Auth failed');
    act(() => errHandler?.(err));

    expect(result.current.connectionState).toBe('error');
    expect(result.current.error).toBe(err);
  });

  it('removes event listeners on cleanup', () => {
    mockToken = 'valid-token';
    const { unmount } = renderHook(() => useRealtime());
    unmount();

    const offEvents = mockOff.mock.calls.map((c: [string]) => c[0]);
    expect(offEvents).toContain('connect');
    expect(offEvents).toContain('disconnect');
    expect(offEvents).toContain('connect_error');
  });
});
