import { create } from 'zustand';

interface SportProfile {
  id: string;
  sportType: string;
  level: number;
  eloRating: number;
  preferredPositions: string[];
  matchCount: number;
  winCount: number;
  mvpCount: number;
}

interface User {
  id: string;
  nickname: string;
  email: string | null;
  profileImageUrl: string | null;
  mannerScore: number;
  totalMatches: number;
  bio?: string | null;
  gender?: string | null;
  locationCity?: string | null;
  locationDistrict?: string | null;
  sportProfiles?: SportProfile[];
  createdAt?: string;
  lastLoginAt?: string;
  city?: string | null;
  district?: string | null;
  teamCount?: number;
  oauthProvider?: string;
  role?: string;
  [key: string]: unknown;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  setUser: (user: User | null) => void;
  login: (accessToken: string, refreshToken: string, user: User) => void;
  logout: () => void;
}

function setAuthCookie(hasToken: boolean) {
  if (typeof document === 'undefined') return;
  if (hasToken) {
    document.cookie = 'accessToken=1; path=/; max-age=604800; SameSite=Lax';
  } else {
    document.cookie = 'accessToken=; path=/; max-age=0';
  }
}

// localStorage 토큰이 있으면 초기 상태를 인증됨으로 설정 (SSR 안전)
const hasToken = typeof window !== 'undefined' && !!localStorage.getItem('accessToken');

export const useAuthStore = create<AuthState>((set) => ({
  user: hasToken ? { id: '', nickname: '', email: null, profileImageUrl: null, mannerScore: 0, totalMatches: 0 } : null,
  isAuthenticated: hasToken,

  setUser: (user) =>
    set({ user, isAuthenticated: !!user }),

  login: (accessToken, refreshToken, user) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('accessToken', accessToken);
      localStorage.setItem('refreshToken', refreshToken);
      setAuthCookie(true);
    }
    set({ user, isAuthenticated: true });
  },

  logout: () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      setAuthCookie(false);
    }
    set({ user: null, isAuthenticated: false });
  },
}));

// Multi-tab auth sync: detect logout/login in other tabs
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === 'accessToken') {
      if (!e.newValue) {
        useAuthStore.getState().logout();
      }
    }
  });
}
