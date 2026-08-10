'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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

// 프라이빗 모드·스토리지 접근이 차단된 WebView(Capacitor 포함) 등에서는 localStorage
// 접근 자체가 throw할 수 있다 — FOUC 방지 인라인 스크립트(theme.ts)와 동일하게 방어한다.
function readStoredPreference(): ThemePreference {
  if (typeof window === 'undefined') return DEFAULT_THEME_PREFERENCE;
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(stored) ? stored : DEFAULT_THEME_PREFERENCE;
  } catch {
    return DEFAULT_THEME_PREFERENCE;
  }
}

function writeStoredPreference(next: ThemePreference) {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, next);
  } catch {
    // 스토리지 접근이 막힌 환경 — 이번 세션 동안만 메모리 상태로 적용되고 다음 로드 시 기본값으로 돌아간다.
  }
}

function safeHasStoredV1Session() {
  try {
    return hasStoredV1Session();
  } catch {
    return false;
  }
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

  const hasSession = safeHasStoredV1Session();
  const settings = useV1Settings({ enabled: hasSession });
  const updateSettings = useV1UpdateSettings();

  useEffect(() => {
    // 일부 구형 WebView는 matchMedia 자체가 없다 — 없으면 시스템 설정 추적을 그냥 건너뛴다
    // (system 선호도는 light로 취급됨, 기본값이 light인 것과 일관적).
    if (typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    setPrefersDarkOS(media.matches);
    const listener = (event: MediaQueryListEvent) => setPrefersDarkOS(event.matches);
    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', listener);
      return () => media.removeEventListener('change', listener);
    }
    // Safari < 14 등 addEventListener 미지원 MediaQueryList 폴백.
    type LegacyMediaQueryList = MediaQueryList & {
      addListener?: (listener: (event: MediaQueryListEvent) => void) => void;
      removeListener?: (listener: (event: MediaQueryListEvent) => void) => void;
    };
    const legacyMedia = media as LegacyMediaQueryList;
    legacyMedia.addListener?.(listener);
    return () => legacyMedia.removeListener?.(listener);
  }, []);

  // 로그아웃을 감지해 serverSynced를 리셋한다 — 안 그러면 계정 A로 동기화한 뒤 같은 기기에서
  // 로그아웃하고 다른 계정 B로 로그인해도(풀 리로드 없는 SPA 내비게이션) A의 테마가 B에게도
  // 그대로 남는다. 다음 로그인 때 새 계정의 서버 값으로 한 번 더 동기화되도록 한다.
  const previousHasSessionRef = useRef(hasSession);
  useEffect(() => {
    if (previousHasSessionRef.current && !hasSession) {
      setServerSynced(false);
    }
    previousHasSessionRef.current = hasSession;
  }, [hasSession]);

  useEffect(() => {
    if (serverSynced) return;
    // 로그아웃 상태에서는 동기화하지 않는다 — enabled:false로 바뀌어도 React Query
    // 캐시엔 이전 로그인 사용자의 settings.data가 그대로 남아 있을 수 있고(예: 탈퇴
    // 처리 후 router.replace만 하고 풀 리로드는 안 하는 흐름), 그 값을 로그아웃 상태에
    // 다시 적용하면 안 된다.
    if (!hasSession) return;
    const serverTheme = settings.data?.theme;
    if (!serverTheme) return;
    setServerSynced(true);
    if (serverTheme !== readStoredPreference()) {
      setPreferenceState(serverTheme);
      writeStoredPreference(serverTheme);
    }
  }, [serverSynced, hasSession, settings.data?.theme]);

  const effectiveTheme = useMemo(() => resolveEffectiveTheme(preference, prefersDarkOS), [preference, prefersDarkOS]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', effectiveTheme === 'dark');
  }, [effectiveTheme]);

  const setPreference = useCallback(
    (next: ThemePreference) => {
      // 이미 선택된 값을 다시 눌러도 매번 PATCH가 나가지 않도록 no-op 처리.
      if (next === preference) return;
      setPreferenceState(next);
      writeStoredPreference(next);
      // 로그아웃 상태에서는 기기 로컬로만 저장한다 — 로그인하면 계정에 반영되고,
      // 이후 다른 기기에서도 이 값을 그대로 불러온다.
      if (safeHasStoredV1Session()) {
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
    [preference, updateSettings],
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
