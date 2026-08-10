'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useV1Settings, useV1UpdateSettings } from '@/hooks/use-v1-api';
import { hasStoredV1Session } from '@/lib/session-storage';
import {
  DEFAULT_THEME_PREFERENCE,
  THEME_STORAGE_KEY,
  isThemePreference,
  resolveEffectiveTheme,
  type ThemePreference,
} from '@/lib/theme';

type ThemeContextValue = {
  preference: ThemePreference;
  effectiveTheme: 'light' | 'dark';
  setPreference: (next: ThemePreference) => void;
  isSaving: boolean;
  saveError: boolean;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readStoredPreference(): ThemePreference {
  if (typeof window === 'undefined') return DEFAULT_THEME_PREFERENCE;
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  return isThemePreference(stored) ? stored : DEFAULT_THEME_PREFERENCE;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(readStoredPreference);
  const [prefersDarkOS, setPrefersDarkOS] = useState(false);
  // 로그인 사용자가 이 기기에서 처음 로드될 때 한 번만 계정에 저장된 값으로
  // 로컬 값을 덮어쓴다 — 그 뒤로는 이 기기에서의 로컬 선택이 우선이다(예: 방금
  // 이 기기에서 바꿨는데 느린 응답으로 다시 덮어써지는 걸 방지).
  const [serverSynced, setServerSynced] = useState(false);
  // 알림 설정 페이지의 toggleError와 동일 패턴 — 저장 실패를 3초간 알리고 자동으로 사라진다.
  const [saveError, setSaveError] = useState(false);

  const settings = useV1Settings({ enabled: hasStoredV1Session() });
  const updateSettings = useV1UpdateSettings();

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    setPrefersDarkOS(media.matches);
    const listener = (event: MediaQueryListEvent) => setPrefersDarkOS(event.matches);
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, []);

  useEffect(() => {
    if (serverSynced) return;
    const serverTheme = settings.data?.theme;
    if (!serverTheme) return;
    setServerSynced(true);
    if (serverTheme !== readStoredPreference()) {
      setPreferenceState(serverTheme);
      window.localStorage.setItem(THEME_STORAGE_KEY, serverTheme);
    }
  }, [serverSynced, settings.data?.theme]);

  const effectiveTheme = useMemo(() => resolveEffectiveTheme(preference, prefersDarkOS), [preference, prefersDarkOS]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', effectiveTheme === 'dark');
  }, [effectiveTheme]);

  const setPreference = useCallback(
    (next: ThemePreference) => {
      setPreferenceState(next);
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
      // 로그아웃 상태에서는 기기 로컬로만 저장한다 — 로그인하면 계정에 반영되고,
      // 이후 다른 기기에서도 이 값을 그대로 불러온다.
      if (hasStoredV1Session()) {
        setSaveError(false);
        updateSettings.mutate(
          { theme: next },
          {
            onError: () => {
              setSaveError(true);
              window.setTimeout(() => setSaveError(false), 3000);
            },
          },
        );
      }
    },
    [updateSettings],
  );

  const value = useMemo<ThemeContextValue>(
    () => ({ preference, effectiveTheme, setPreference, isSaving: updateSettings.isPending, saveError }),
    [preference, effectiveTheme, setPreference, updateSettings.isPending, saveError],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
