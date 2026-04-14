import axios from 'axios';
import { useAuthStore } from '@/stores/auth-store';

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || '/api/v1';

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor - JWT 토큰 자동 첨부
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('accessToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

// Response interceptor - 토큰 갱신
api.interceptors.response.use(
  (response) => response.data,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      const refreshToken = localStorage.getItem('refreshToken');
      if (refreshToken) {
        try {
          const { data } = await axios.post(`${API_BASE_URL}/auth/refresh`, {
            refreshToken,
          });
          localStorage.setItem('accessToken', data.data.accessToken);
          localStorage.setItem('refreshToken', data.data.refreshToken);
          originalRequest.headers.Authorization = `Bearer ${data.data.accessToken}`;
          return api(originalRequest);
        } catch {
          // Refresh failed — clear auth state and redirect to login
        }
      }

      // No valid session — logout and redirect with current path for post-login return
      useAuthStore.getState().logout();
      const redirect = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.href = `/login?redirect=${redirect}`;
      return Promise.reject(error);
    }

    return Promise.reject(error);
  },
);
