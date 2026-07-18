export const POPUP_TARGET_SCREENS = [
  'home',
  'matches',
  'team_matches',
  'teams',
  'tournaments',
  'lessons',
  'marketplace',
  'mercenary',
  'venues',
  'community',
  'chat',
  'notifications',
  'profile',
  'my',
] as const;

export type PopupTargetScreen = (typeof POPUP_TARGET_SCREENS)[number];

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
