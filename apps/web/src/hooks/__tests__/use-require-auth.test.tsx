import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

// Mock next/navigation before imports
const mockReplace = vi.fn();
let mockPathname = '/some/protected/page';

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({ replace: mockReplace })),
  usePathname: vi.fn(() => mockPathname),
}));

// Mock auth store
let mockIsAuthenticated = false;

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: vi.fn((selector?: (s: { isAuthenticated: boolean }) => unknown) => {
    const state = { isAuthenticated: mockIsAuthenticated };
    return selector ? selector(state) : state;
  }),
}));

// Must import after mocks
import { useRequireAuth } from '../use-require-auth';

describe('useRequireAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsAuthenticated = false;
    mockPathname = '/some/protected/page';
  });

  it('returns isAuthenticated: false when not authenticated', () => {
    mockIsAuthenticated = false;
    const { result } = renderHook(() => useRequireAuth());
    expect(result.current.isAuthenticated).toBe(false);
  });

  it('redirects to /login with redirect param when not authenticated', () => {
    mockIsAuthenticated = false;
    mockPathname = '/my/matches';
    renderHook(() => useRequireAuth());
    expect(mockReplace).toHaveBeenCalledWith('/login?redirect=%2Fmy%2Fmatches');
  });

  it('does not redirect when authenticated', () => {
    mockIsAuthenticated = true;
    renderHook(() => useRequireAuth());
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('returns isAuthenticated: true when authenticated', () => {
    mockIsAuthenticated = true;
    const { result } = renderHook(() => useRequireAuth());
    expect(result.current.isAuthenticated).toBe(true);
  });

  it('encodes pathname with special characters in redirect param', () => {
    mockIsAuthenticated = false;
    mockPathname = '/team-matches/new';
    renderHook(() => useRequireAuth());
    expect(mockReplace).toHaveBeenCalledWith('/login?redirect=%2Fteam-matches%2Fnew');
  });
});
