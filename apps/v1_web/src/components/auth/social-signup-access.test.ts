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
  });

  it('does not treat pending sessions as logged-out guests', () => {
    expect(isPendingSocialSignupRouteAllowed('social_terms_required', '/terms', 'social')).toBe(true);
    expect(isPendingSocialSignupRouteAllowed('social_terms_required', '/home', null)).toBe(false);
    expect(isPendingSocialSignupRouteAllowed('social_profile_required', '/signup/social', null)).toBe(true);
    expect(isPendingSocialSignupRouteAllowed('social_profile_required', '/landing', null)).toBe(false);
  });
});
