import { describe, it, expect, beforeEach } from 'vitest';
import { useAuthStore } from '../auth-store';

describe('AuthStore', () => {
  beforeEach(() => {
    useAuthStore.setState({
      user: null,
      isAuthenticated: false,
    });
  });

  it('starts unauthenticated', () => {
    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.user).toBeNull();
  });

  it('login sets user and stores tokens', () => {
    const mockUser = {
      id: 'user-1',
      nickname: '테스트유저',
      email: 'test@test.com',
      profileImageUrl: null,
      mannerScore: 4.5,
      totalMatches: 10,
    };

    useAuthStore.getState().login('access-token', 'refresh-token', mockUser);

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(true);
    expect(state.user?.nickname).toBe('테스트유저');
    expect(state.user?.mannerScore).toBe(4.5);
  });

  it('logout clears user state', () => {
    const mockUser = { id: 'u1', nickname: '유저', email: 'a@b.com', profileImageUrl: null, mannerScore: 3.0, totalMatches: 0 };
    useAuthStore.getState().login('t1', 't2', mockUser);
    expect(useAuthStore.getState().isAuthenticated).toBe(true);

    useAuthStore.getState().logout();

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.user).toBeNull();
  });

  it('setUser updates user and auth status', () => {
    const mockUser = { id: 'u2', nickname: '새유저', email: null, profileImageUrl: null, mannerScore: 3.0, totalMatches: 5 };

    useAuthStore.getState().setUser(mockUser);
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(useAuthStore.getState().user?.nickname).toBe('새유저');

    useAuthStore.getState().setUser(null);
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });
});
