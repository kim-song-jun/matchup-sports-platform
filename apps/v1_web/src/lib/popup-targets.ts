import type { V1PopupTargetScreen } from '@/types/api';

export const POPUP_TARGET_OPTIONS: Array<{
  value: V1PopupTargetScreen;
  label: string;
  description: string;
  prefixes: string[];
}> = [
  { value: 'home', label: '홈', description: '홈 대시보드', prefixes: ['/home'] },
  { value: 'matches', label: '개인 매치', description: '목록·상세·등록', prefixes: ['/matches'] },
  { value: 'team_matches', label: '팀 매칭', description: '목록·상세·등록', prefixes: ['/team-matches'] },
  { value: 'teams', label: '팀', description: '팀 탐색·상세·관리', prefixes: ['/teams'] },
  { value: 'tournaments', label: '대회', description: '대회 목록·상세', prefixes: ['/tournaments'] },
  { value: 'lessons', label: '레슨', description: '레슨 목록·상세', prefixes: ['/lessons'] },
  { value: 'marketplace', label: '마켓', description: '마켓 목록·상세', prefixes: ['/marketplace'] },
  { value: 'mercenary', label: '용병', description: '용병 모집·지원', prefixes: ['/mercenary'] },
  { value: 'venues', label: '경기장', description: '경기장 목록·상세', prefixes: ['/venues'] },
  { value: 'community', label: '커뮤니티', description: '커뮤니티 화면', prefixes: ['/community'] },
  { value: 'chat', label: '채팅', description: '채팅 목록·대화방', prefixes: ['/chat'] },
  { value: 'notifications', label: '알림', description: '알림 목록', prefixes: ['/notifications'] },
  { value: 'profile', label: '프로필·설정', description: '프로필·설정·리뷰', prefixes: ['/profile', '/settings', '/reviews'] },
  { value: 'my', label: '내 활동', description: '내 매치·팀·활동', prefixes: ['/my'] },
];

export const POPUP_TARGET_LABELS = Object.fromEntries(
  POPUP_TARGET_OPTIONS.map((option) => [option.value, option.label]),
) as Record<V1PopupTargetScreen, string>;

export function resolvePopupTargetScreen(pathname: string | null | undefined): V1PopupTargetScreen | null {
  if (typeof pathname !== 'string') return null;
  const match = POPUP_TARGET_OPTIONS.find((option) =>
    option.prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)),
  );
  return match?.value ?? null;
}

export function isSafePopupLink(value: string) {
  const hasWhitespace = Array.from(value).some((character) => character.trim() === '');
  if (hasWhitespace) return false;
  if (value.startsWith('/')) return !value.startsWith('//') && !value.includes('\\');
  if (!value.toLowerCase().startsWith('https://')) return false;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}
