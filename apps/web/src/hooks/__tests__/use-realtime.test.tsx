import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, act, waitFor } from '@testing-library/react';

// Mock socket.io-client before any imports
const mockOn = vi.fn<(event: string, handler: (...args: unknown[]) => void) => void>();
const mockOff = vi.fn<(event: string, handler: (...args: unknown[]) => void) => void>();
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
import { queryKeys } from '../use-api';
import { RealtimeProvider, useNotificationSync, useRealtime } from '../use-realtime';

/** Wraps the hook under test with RealtimeProvider + QueryClientProvider. */
function makeWrapper(queryClient?: QueryClient) {
  const qc = queryClient ?? new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={qc}>
        <RealtimeProvider>{children}</RealtimeProvider>
      </QueryClientProvider>
    );
  };
}

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
    const { result } = renderHook(() => useRealtime(), { wrapper: makeWrapper() });
    expect(result.current.connected).toBe(false);
    expect(result.current.connectionState).toBe('disconnected');
    expect(result.current.socket).toBeNull();
  });

  it('calls socket.connect() when token is present', () => {
    mockToken = 'valid-token';
    renderHook(() => useRealtime(), { wrapper: makeWrapper() });
    expect(mockConnect).toHaveBeenCalledTimes(1);
  });

  it('registers connect/disconnect/connect_error event handlers', () => {
    mockToken = 'valid-token';
    renderHook(() => useRealtime(), { wrapper: makeWrapper() });

    const registeredEvents = mockOn.mock.calls.map((c) => c[0]);
    expect(registeredEvents).toContain('connect');
    expect(registeredEvents).toContain('disconnect');
    expect(registeredEvents).toContain('connect_error');
  });

  it('transitions to connected state on connect event', () => {
    mockToken = 'valid-token';
    const { result } = renderHook(() => useRealtime(), { wrapper: makeWrapper() });

    // Simulate server sending 'connect'
    const connectHandler = mockOn.mock.calls.find((c) => c[0] === 'connect')?.[1] as (() => void) | undefined;
    act(() => {
      connectHandler?.();
    });

    expect(result.current.connected).toBe(true);
    expect(result.current.connectionState).toBe('connected');
    expect(result.current.error).toBeNull();
  });

  it('transitions to disconnected state on disconnect event', () => {
    mockToken = 'valid-token';
    const { result } = renderHook(() => useRealtime(), { wrapper: makeWrapper() });

    const connectHandler = mockOn.mock.calls.find((c) => c[0] === 'connect')?.[1] as (() => void) | undefined;
    act(() => connectHandler?.());

    const disconnectHandler = mockOn.mock.calls.find((c) => c[0] === 'disconnect')?.[1] as (() => void) | undefined;
    act(() => disconnectHandler?.());

    expect(result.current.connected).toBe(false);
    expect(result.current.connectionState).toBe('disconnected');
  });

  it('refetches notifications after the socket connects', async () => {
    mockToken = 'valid-token';
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    renderHook(() => useNotificationSync(), { wrapper: makeWrapper(queryClient) });

    const connectHandler = mockOn.mock.calls.find((c) => c[0] === 'connect')?.[1] as (() => void) | undefined;
    act(() => connectHandler?.());

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: queryKeys.notifications.all }),
      );
    });
  });

  it('refetches notifications when the tab becomes visible again', async () => {
    mockToken = 'valid-token';
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const visibilityStateSpy = vi.spyOn(document, 'visibilityState', 'get');
    visibilityStateSpy.mockReturnValue('hidden');

    renderHook(() => useNotificationSync(), { wrapper: makeWrapper(queryClient) });

    const connectHandler = mockOn.mock.calls.find((c) => c[0] === 'connect')?.[1] as (() => void) | undefined;
    act(() => connectHandler?.());
    invalidateSpy.mockClear();

    visibilityStateSpy.mockReturnValue('visible');
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: queryKeys.notifications.all }),
      );
      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: queryKeys.notifications.unreadCount }),
      );
    });

    visibilityStateSpy.mockRestore();
  });

  it('transitions to error state on connect_error event', () => {
    mockToken = 'valid-token';
    const { result } = renderHook(() => useRealtime(), { wrapper: makeWrapper() });

    const errHandler = mockOn.mock.calls.find((c) => c[0] === 'connect_error')?.[1] as ((err: Error) => void) | undefined;
    const err = new Error('Auth failed');
    act(() => errHandler?.(err));

    expect(result.current.connectionState).toBe('error');
    expect(result.current.error).toBe(err);
  });

  it('removes event listeners on cleanup', () => {
    mockToken = 'valid-token';
    const { unmount } = renderHook(() => useRealtime(), { wrapper: makeWrapper() });
    unmount();

    const offEvents = mockOff.mock.calls.map((c) => c[0]);
    expect(offEvents).toContain('connect');
    expect(offEvents).toContain('disconnect');
    expect(offEvents).toContain('connect_error');
  });

  it('does not destroy the singleton socket on cleanup (prevents reconnection spam)', () => {
    mockToken = 'valid-token';
    const { unmount } = renderHook(() => useRealtime(), { wrapper: makeWrapper() });

    mockDisconnect.mockClear();
    unmount();

    expect(mockDisconnect).not.toHaveBeenCalled();
  });
});
