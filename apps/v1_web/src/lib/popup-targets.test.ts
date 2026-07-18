import { describe, expect, it } from 'vitest';
import { isSafePopupLink, resolvePopupTargetScreen } from './popup-targets';

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

  it('accepts internal and HTTPS links while rejecting unsafe schemes', () => {
    expect(isSafePopupLink('/matches?tab=open')).toBe(true);
    expect(isSafePopupLink('https://teameet.co.kr/v1/matches')).toBe(true);
    expect(isSafePopupLink('//evil.example')).toBe(false);
    expect(isSafePopupLink('javascript:alert(1)')).toBe(false);
  });
});
