import { describe, expect, it } from 'vitest';
import { isSafePopupLink, isSafePopupTargetPath, resolvePopupTargetScreen } from './popup-targets';

describe('resolvePopupTargetScreen', () => {
  it('maps list, detail, and account routes to supported popup screens', () => {
    expect(resolvePopupTargetScreen('/home')).toBe('home');
    expect(resolvePopupTargetScreen('/matches/match-1')).toBe('matches');
    expect(resolvePopupTargetScreen('/team-matches/new')).toBe('team_matches');
    expect(resolvePopupTargetScreen('/settings/account')).toBe('profile');
  });

  it('does not show user popups on auth, public, or admin routes', () => {
    expect(resolvePopupTargetScreen('/login')).toBeNull();
    expect(resolvePopupTargetScreen('/landing')).toBeNull();
    expect(resolvePopupTargetScreen('/admin/popups')).toBeNull();
  });

  it('stays null instead of throwing when usePathname has not resolved yet', () => {
    expect(resolvePopupTargetScreen(null)).toBeNull();
    expect(resolvePopupTargetScreen(undefined)).toBeNull();
  });

  it('accepts internal and HTTPS links while rejecting unsafe schemes', () => {
    expect(isSafePopupLink('/matches?tab=open')).toBe(true);
    expect(isSafePopupLink('https://teameet.co.kr/matches')).toBe(true);
    expect(isSafePopupLink('//evil.example')).toBe(false);
    expect(isSafePopupLink('javascript:alert(1)')).toBe(false);
  });

  it('accepts exact user paths while rejecting admin, query, hash, and malformed targets', () => {
    expect(isSafePopupTargetPath('/tournaments/tournament-1')).toBe(true);
    expect(isSafePopupTargetPath('/admin/tournaments/tournament-1')).toBe(false);
    expect(isSafePopupTargetPath('/tournaments/tournament-1?tab=results')).toBe(false);
    expect(isSafePopupTargetPath('/tournaments/tournament-1#results')).toBe(false);
    expect(isSafePopupTargetPath('//evil.example')).toBe(false);
    // 백엔드 DTO 의 @MaxLength(500) 과 같은 상한 — 어긋나면 저장 시 400 이 난다.
    expect(isSafePopupTargetPath(`/tournaments/${'a'.repeat(500)}`)).toBe(false);
  });
});
