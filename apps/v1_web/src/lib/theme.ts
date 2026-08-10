/**
 * 화면 테마 선호도. 기본값은 항상 light — OS의 prefers-color-scheme을 자동으로
 * 따라가지 않는다(제품 요구사항). 'system'을 명시적으로 선택했을 때만 OS 설정에
 * 맞춰 dark/light를 동적으로 계산한다. 백엔드 enum(V1ThemePreference, schema.prisma)
 * 과 값 집합을 맞춘다.
 */
export type ThemePreference = 'light' | 'dark' | 'system';

export const DEFAULT_THEME_PREFERENCE: ThemePreference = 'light';

/** localStorage에 선호도를 저장하는 키. FOUC 방지 인라인 스크립트(app/layout.tsx)와 값을 공유한다. */
export const THEME_STORAGE_KEY = 'tm-theme';

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system';
}

/** preference='system'일 때만 OS 설정을 참조해 실제 적용할 light/dark를 계산한다. */
export function resolveEffectiveTheme(preference: ThemePreference, prefersDarkOS: boolean): 'light' | 'dark' {
  if (preference === 'system') return prefersDarkOS ? 'dark' : 'light';
  return preference;
}

/**
 * 첫 페인트 전에 <html>에 .dark 클래스를 동기적으로 부여하는 FOUC 방지 스크립트.
 * app/layout.tsx의 <head>에 인라인으로 삽입한다 — 외부 입력을 전혀 참조하지 않는
 * 상수 문자열이라 dangerouslySetInnerHTML로 넣어도 XSS 위험이 없다.
 * localStorage 접근이 막힌 환경(프라이빗 모드 등)에서도 안전하도록 try/catch로 감싼다.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var k='${THEME_STORAGE_KEY}';var v=localStorage.getItem(k);var p=(v==='light'||v==='dark'||v==='system')?v:'${DEFAULT_THEME_PREFERENCE}';var d=p==='dark'||(p==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);if(d)document.documentElement.classList.add('dark');}catch(e){}})();`;
