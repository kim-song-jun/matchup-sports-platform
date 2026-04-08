import { describe, it, expect, beforeEach } from 'vitest';
import { useAuthStore } from '../auth-store';

describe('AuthStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.setState({
      user: null,
      isAuthenticated: false,
      accessToken: null,
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
    expect(localStorage.getItem('accessToken')).toBe('access-token');
    expect(localStorage.getItem('refreshToken')).toBe('refresh-token');
    expect(localStorage.getItem('authUser')).toContain('테스트유저');
  });

  it('logout clears user state', () => {
    const mockUser = { id: 'u1', nickname: '유저', email: 'a@b.com', profileImageUrl: null, mannerScore: 3.0, totalMatches: 0 };
    useAuthStore.getState().login('t1', 't2', mockUser);
    expect(useAuthStore.getState().isAuthenticated).toBe(true);

    useAuthStore.getState().logout();

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.user).toBeNull();
    expect(localStorage.getItem('accessToken')).toBeNull();
    expect(localStorage.getItem('refreshToken')).toBeNull();
    expect(localStorage.getItem('authUser')).toBeNull();
  });

  it('setUser updates user and auth status', () => {
    const mockUser = { id: 'u2', nickname: '새유저', email: null, profileImageUrl: null, mannerScore: 3.0, totalMatches: 5 };

    useAuthStore.getState().setUser(mockUser);
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(useAuthStore.getState().user?.nickname).toBe('새유저');

    useAuthStore.getState().setUser(null);
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it('syncs login from another tab via storage event', () => {
    const mockUser = {
      id: 'sync-user',
      nickname: '동기화유저',
      email: 'sync@test.com',
      profileImageUrl: null,
      mannerScore: 4.2,
      totalMatches: 12,
    };

    localStorage.setItem('authUser', JSON.stringify(mockUser));
    window.dispatchEvent(new StorageEvent('storage', { key: 'accessToken', newValue: 'sync-token' }));

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(true);
    expect(state.accessToken).toBe('sync-token');
    expect(state.user?.nickname).toBe('동기화유저');
  });

  it('syncs logout from another tab via storage event', () => {
    const mockUser = { id: 'u1', nickname: '유저', email: 'a@b.com', profileImageUrl: null, mannerScore: 3.0, totalMatches: 0 };
    useAuthStore.getState().login('t1', 't2', mockUser);

    window.dispatchEvent(new StorageEvent('storage', { key: 'accessToken', newValue: null }));

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.accessToken).toBeNull();
    expect(state.user).toBeNull();
  });
});
