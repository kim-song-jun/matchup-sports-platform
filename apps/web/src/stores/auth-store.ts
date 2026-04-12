import { create } from 'zustand';
import { disconnectSocket } from '@/lib/realtime-client';
import type { UserProfile } from '@/types/api';

interface AuthState {
  user: UserProfile | null;
  isAuthenticated: boolean;
  accessToken: string | null;
  setUser: (user: UserProfile | null) => void;
  login: (accessToken: string, refreshToken: string, user: UserProfile) => void;
  logout: () => void;
}

const AUTH_USER_STORAGE_KEY = 'authUser';
const EMPTY_AUTH_USER: UserProfile = {
  id: '',
  nickname: '',
  email: null,
  profileImageUrl: null,
  gender: null,
  bio: null,
  mannerScore: 0,
  totalMatches: 0,
  locationCity: null,
  locationDistrict: null,
};

function setAuthCookie(hasToken: boolean) {
  if (typeof document === 'undefined') return;
  if (hasToken) {
    document.cookie = 'accessToken=1; path=/; max-age=604800; SameSite=Lax';
  } else {
    document.cookie = 'accessToken=; path=/; max-age=0';
  }
}

function readStoredToken() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('accessToken');
}

function readStoredUser(): UserProfile | null {
  if (typeof window === 'undefined') return null;

  const raw = localStorage.getItem(AUTH_USER_STORAGE_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as UserProfile;
  } catch {
    localStorage.removeItem(AUTH_USER_STORAGE_KEY);
    return null;
  }
}

function writeStoredUser(user: UserProfile | null) {
  if (typeof window === 'undefined') return;

  if (user) {
    localStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify(user));
    return;
  }

  localStorage.removeItem(AUTH_USER_STORAGE_KEY);
}

const storedToken = readStoredToken();
const storedUser = readStoredUser();
const hasToken = !!storedToken;

export const useAuthStore = create<AuthState>((set) => ({
  user: hasToken ? storedUser ?? EMPTY_AUTH_USER : null,
  isAuthenticated: hasToken,
  accessToken: storedToken,

  setUser: (user) => {
    writeStoredUser(user);
    set((state) => ({
      user,
      isAuthenticated: !!user,
      accessToken: user ? state.accessToken : null,
    }));
  },

  login: (accessToken, refreshToken, user) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('accessToken', accessToken);
      localStorage.setItem('refreshToken', refreshToken);
      writeStoredUser(user);
      setAuthCookie(true);
    }
    set({ user, isAuthenticated: true, accessToken });
  },

  logout: () => {
    if (typeof window !== 'undefined') {
      disconnectSocket();
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      writeStoredUser(null);
      setAuthCookie(false);
    }
    set({ user: null, isAuthenticated: false, accessToken: null });
  },
}));

// Multi-tab auth sync: reflect login/logout initiated in another tab.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === 'accessToken') {
      if (!e.newValue) {
        useAuthStore.getState().logout();
        return;
      }

      const syncedUser = readStoredUser() ?? EMPTY_AUTH_USER;
      useAuthStore.setState({
        user: syncedUser,
        isAuthenticated: true,
        accessToken: e.newValue,
      });
      setAuthCookie(true);
    }

    if (e.key === AUTH_USER_STORAGE_KEY && e.newValue) {
      const syncedUser = readStoredUser();
      if (!syncedUser) return;

      useAuthStore.setState((state) => ({
        user: syncedUser,
        isAuthenticated: !!state.accessToken,
        accessToken: state.accessToken,
      }));
    }
  });
}
