import {
  getPendingSocialSignupRoute,
  isPendingSocialSignupRequestAllowed,
} from './social-signup-access';

describe('social signup access contract', () => {
  it('maps each pending status to its required signup route', () => {
    expect(getPendingSocialSignupRoute('social_terms_required')).toBe('/terms?mode=social');
    expect(getPendingSocialSignupRoute('social_profile_required')).toBe('/signup/social');
    expect(getPendingSocialSignupRoute('signup_done')).toBeNull();
  });

  it('allows only auth me, logout, and the required social completion endpoint', () => {
    expect(isPendingSocialSignupRequestAllowed('social_terms_required', '/api/v1/auth/me')).toBe(true);
    expect(isPendingSocialSignupRequestAllowed('social_terms_required', '/api/v1/auth/social-terms')).toBe(true);
    expect(isPendingSocialSignupRequestAllowed('social_terms_required', '/api/v1/auth/social-profile')).toBe(false);
    expect(isPendingSocialSignupRequestAllowed('social_profile_required', '/api/v1/auth/social-profile')).toBe(true);
    expect(isPendingSocialSignupRequestAllowed('social_profile_required', '/api/v1/home')).toBe(false);
    expect(isPendingSocialSignupRequestAllowed('social_profile_required', '/api/v1/auth/logout')).toBe(true);
  });
});
