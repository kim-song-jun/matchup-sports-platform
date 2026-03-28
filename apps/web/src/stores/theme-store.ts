'use client';

import { create } from 'zustand';

type Theme = 'light' | 'dark' | 'system';

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  resolvedTheme: 'light' | 'dark';
}

function getSystemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function resolveTheme(theme: Theme): 'light' | 'dark' {
  if (theme === 'system') return getSystemTheme();
  return theme;
}

function applyTheme(resolved: 'light' | 'dark') {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('dark', resolved === 'dark');
  document.documentElement.style.colorScheme = resolved;
}

export const useThemeStore = create<ThemeState>((set) => {
  // 초기값
  const savedTheme = (typeof localStorage !== 'undefined'
    ? (localStorage.getItem('theme') as Theme)
    : null) || 'light';
  const resolved = resolveTheme(savedTheme);

  // 즉시 적용 (FOUC 방지 — layout.tsx head 스크립트가 1차 방어, 여기가 2차)
  if (typeof window !== 'undefined') {
    applyTheme(resolved);
  }

  return {
    theme: savedTheme,
    resolvedTheme: resolved,
    setTheme: (theme: Theme) => {
      const resolved = resolveTheme(theme);
      localStorage.setItem('theme', theme);
      applyTheme(resolved);
      set({ theme, resolvedTheme: resolved });
    },
  };
});

// Listen for OS theme changes when theme is 'system'
if (typeof window !== 'undefined') {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    const { theme } = useThemeStore.getState();
    if (theme === 'system') {
      const resolved = getSystemTheme();
      applyTheme(resolved);
      useThemeStore.setState({ resolvedTheme: resolved });
    }
  });
}
