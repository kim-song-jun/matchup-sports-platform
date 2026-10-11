import { describe, expect, it } from 'vitest';
import {
  getPendingSocialSignupRoute,
  isPendingSocialSignupRouteAllowed,
} from './social-signup-access';

describe('pending social signup access', () => {
  it('routes pending sessions to the required signup screen', () => {
    expect(getPendingSocialSignupRoute('social_terms_required')).toBe('/terms?mode=social');
    expect(getPendingSocialSignupRoute('social_profile_required')).toBe('/signup/social');
    expect(getPendingSocialSignupRoute('signup_done')).toBeNull();
    // 정보 입력을 미룬 계정은 쓸 수 있는 계정이라 가입 화면으로 끌려가면 안 된다.
    expect(getPendingSocialSignupRoute('social_profile_deferred')).toBeNull();
    expect(isPendingSocialSignupRouteAllowed('social_profile_deferred', '/home', null)).toBe(true);
  });

  it('does not treat pending sessions as logged-out guests', () => {
    expect(isPendingSocialSignupRouteAllowed('social_terms_required', '/terms', 'social')).toBe(true);
    expect(isPendingSocialSignupRouteAllowed('social_terms_required', '/home', null)).toBe(false);
    expect(isPendingSocialSignupRouteAllowed('social_profile_required', '/signup/social', null)).toBe(true);
    expect(isPendingSocialSignupRouteAllowed('social_profile_required', '/landing', null)).toBe(false);
  });
});
