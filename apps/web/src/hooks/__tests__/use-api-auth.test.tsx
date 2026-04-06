import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

// Mock auth store
const mockLogin = vi.fn();
let mockIsAuthenticated = true;

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: vi.fn((selector?: (s: { isAuthenticated: boolean; login: typeof mockLogin }) => unknown) => {
    const state = { isAuthenticated: mockIsAuthenticated, login: mockLogin };
    return selector ? selector(state) : state;
  }),
}));

// Mock api module — MSW intercepts at network level but axios uses /api/v1 baseURL.
// For unit tests we mock the api module directly to avoid baseURL issues in jsdom.
vi.mock('@/lib/api', () => {
  const mockApi = {
    post: vi.fn(),
    get: vi.fn(),
  };
  return { api: mockApi };
});

import { useDevLogin, useEmailLogin, useEmailRegister, useMe } from '../use-api';
import { api } from '@/lib/api';

const mockApi = api as unknown as { post: ReturnType<typeof vi.fn>; get: ReturnType<typeof vi.fn> };

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe('useDevLogin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsAuthenticated = true;
  });

  it('calls auth/dev-login and invokes login on success', async () => {
    const mockData = {
      status: 'success',
      data: {
        accessToken: 'at',
        refreshToken: 'rt',
        user: { id: 'u1', nickname: '테스트', email: null, profileImageUrl: null, mannerScore: 0, totalMatches: 0 },
      },
    };
    mockApi.post.mockResolvedValueOnce(mockData);

    const wrapper = makeWrapper();
    const { result } = renderHook(() => useDevLogin(), { wrapper });

    result.current.mutate('테스트');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockApi.post).toHaveBeenCalledWith('/auth/dev-login', { nickname: '테스트' });
    expect(mockLogin).toHaveBeenCalledWith('at', 'rt', expect.objectContaining({ id: 'u1' }));
  });
});

describe('useEmailLogin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls auth/login and invokes login on success', async () => {
    const mockData = {
      status: 'success',
      data: {
        accessToken: 'at2',
        refreshToken: 'rt2',
        user: { id: 'u2', nickname: '이메일유저', email: 'a@b.com', profileImageUrl: null, mannerScore: 0, totalMatches: 0 },
      },
    };
    mockApi.post.mockResolvedValueOnce(mockData);

    const wrapper = makeWrapper();
    const { result } = renderHook(() => useEmailLogin(), { wrapper });

    result.current.mutate({ email: 'a@b.com', password: 'pw' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockApi.post).toHaveBeenCalledWith('/auth/login', { email: 'a@b.com', password: 'pw' });
    expect(mockLogin).toHaveBeenCalledWith('at2', 'rt2', expect.objectContaining({ id: 'u2' }));
  });
});

describe('useEmailRegister', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls auth/register and invokes login on success', async () => {
    const mockData = {
      status: 'success',
      data: {
        accessToken: 'at3',
        refreshToken: 'rt3',
        user: { id: 'u3', nickname: '새유저', email: 'new@b.com', profileImageUrl: null, mannerScore: 0, totalMatches: 0 },
      },
    };
    mockApi.post.mockResolvedValueOnce(mockData);

    const wrapper = makeWrapper();
    const { result } = renderHook(() => useEmailRegister(), { wrapper });

    result.current.mutate({ email: 'new@b.com', password: 'pw', nickname: '새유저' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockApi.post).toHaveBeenCalledWith('/auth/register', { email: 'new@b.com', password: 'pw', nickname: '새유저' });
    expect(mockLogin).toHaveBeenCalledWith('at3', 'rt3', expect.objectContaining({ id: 'u3' }));
  });
});

describe('useMe', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches user profile when authenticated', async () => {
    mockIsAuthenticated = true;
    mockApi.get.mockResolvedValueOnce({
      status: 'success',
      data: { id: 'u1', nickname: '테스트', email: null, profileImageUrl: null, mannerScore: 0, totalMatches: 0 },
    });

    const wrapper = makeWrapper();
    const { result } = renderHook(() => useMe(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockApi.get).toHaveBeenCalledWith('/auth/me');
  });

  it('is disabled when not authenticated', () => {
    mockIsAuthenticated = false;

    const wrapper = makeWrapper();
    const { result } = renderHook(() => useMe(), { wrapper });

    // enabled: false → query never fires
    expect(result.current.fetchStatus).toBe('idle');
    expect(mockApi.get).not.toHaveBeenCalled();
  });
});
