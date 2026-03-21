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
  [key: string]: unknown;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  setUser: (user: User | null) => void;
  login: (accessToken: string, refreshToken: string, user: User) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,

  setUser: (user) =>
    set({ user, isAuthenticated: !!user }),

  login: (accessToken, refreshToken, user) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('accessToken', accessToken);
      localStorage.setItem('refreshToken', refreshToken);
    }
    set({ user, isAuthenticated: true });
  },

  logout: () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
    }
    set({ user: null, isAuthenticated: false });
  },
}));
