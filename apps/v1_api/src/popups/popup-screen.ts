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

/** ActivePopupQueryDto/CreateAdminPopupDto 의 @MaxLength(500) 과 맞춘 상한. */
export const POPUP_TARGET_PATH_MAX_LENGTH = 500;

export function isSafePopupTargetPath(value: string) {
  if (value.length > POPUP_TARGET_PATH_MAX_LENGTH) return false;
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return false;
  if (value.startsWith('/admin')) return false;
  if (value.includes('?') || value.includes('#')) return false;
  return !Array.from(value).some((character) => character.trim() === '');
}
