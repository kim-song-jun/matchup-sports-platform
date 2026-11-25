import { detectNativeShell } from './native-bridge';

/** 캘린더 연결 화면이 어느 기기 기준으로 안내할지. */
export type CalendarPlatform = 'ios' | 'mac' | 'android' | 'other';

/**
 * 앱 안에서는 셸이 알려 주는 값(`detectNativeShell`)을 그대로 쓴다 — 아이폰 앱이면 항상 ios, 안드로이드 앱이면 항상 android.
 * 브라우저에서는 접속 기기 정보(userAgent)로 나눈다 — 맥(사파리·크롬, iPad 데스크톱 모드 포함)은 `webcal` 을 캘린더 앱이 바로 받으므로
 * `mac`, 윈도우·리눅스 같은 그 밖의 데스크톱은 `other`(공통 안내)다.
 */
export function detectCalendarPlatform(userAgent: string, shell: 'ios' | 'android' | null): CalendarPlatform {
  if (shell !== null) return shell;
  if (/iPhone|iPod|iPad/i.test(userAgent)) return 'ios';
  if (/Android/i.test(userAgent)) return 'android';
  if (/Macintosh|Mac OS X/i.test(userAgent)) return 'mac';
  return 'other';
}

export function currentCalendarPlatform(): CalendarPlatform {
  if (typeof window === 'undefined') return 'other';
  return detectCalendarPlatform(window.navigator.userAgent, detectNativeShell());
}

/**
 * 구글 캘린더에 구독을 추가하는 링크. 구글 캘린더 앱에서는 URL 구독을 못 더하고 웹(브라우저)에서만 되는데,
 * 이 링크는 그 「캘린더 추가」 확인 화면을 바로 연다. 구글 계정 동기화가 켜져 있으면 갤럭시(삼성) 캘린더에도 보인다.
 */
export function googleCalendarAddUrl(webcalUrl: string): string {
  return `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcalUrl)}`;
}
