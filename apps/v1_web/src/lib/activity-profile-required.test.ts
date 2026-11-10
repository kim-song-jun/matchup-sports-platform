import { afterEach, describe, expect, it } from 'vitest';
import {
  activityMissingFromAuthMe,
  buildActivityGateHref,
  buildActivityProfileHref,
  currentReturnPath,
  parseActivityMissing,
} from './activity-profile-required';
import { sanitizeRedirectPath } from './session-storage';

describe('activity profile return path', () => {
  afterEach(() => window.history.replaceState(null, '', '/'));

  it('keeps the hash and round-trips through the redirect query and sanitizeRedirectPath', () => {
    window.history.replaceState(null, '', '/teams/abc?tab=members#member-list');
    const href = buildActivityProfileHref(currentReturnPath());
    const redirect = new URL(href, 'http://localhost').searchParams.get('redirect');
    expect(sanitizeRedirectPath(redirect)).toBe('/teams/abc?tab=members#member-list');
  });

  it('keeps a bare hash without a query', () => {
    window.history.replaceState(null, '', '/teams/abc#member-list');
    expect(currentReturnPath()).toBe('/teams/abc#member-list');
  });
});

describe('activity gate checklist helpers', () => {
  it('parseActivityMissing keeps only known items in checklist order', () => {
    expect(parseActivityMissing({ missing: ['interestSport', 'bogus', 'phone'] })).toEqual(['phone', 'interestSport']);
    expect(parseActivityMissing(undefined)).toEqual([]);
    expect(parseActivityMissing({ missing: 'phone' })).toEqual([]);
  });

  it('sends the user to the first missing item and carries the return path', () => {
    expect(buildActivityGateHref('/teams/new', ['interestSport'])).toBe('/onboarding/sport?redirect=%2Fteams%2Fnew');
    expect(buildActivityGateHref('/teams/new', ['basicProfile', 'interestSport'])).toBe('/signup/social?redirect=%2Fteams%2Fnew');
    expect(buildActivityGateHref('/teams/new', [])).toBe('/signup/social?redirect=%2Fteams%2Fnew');
  });

  it('the redirect round-trips through sanitizeRedirectPath (open redirect guard)', () => {
    const href = buildActivityGateHref('//evil.example/x', ['interestSport']);
    const redirect = new URL(href, 'http://localhost').searchParams.get('redirect');
    expect(sanitizeRedirectPath(redirect)).toBeNull();
  });

  const me = (status: string, extra: Record<string, unknown> = {}) => ({
    user: { onboardingStatus: status, authProviders: ['kakao'] },
    verification: { phoneVerified: true },
    onboarding: { missing: [] },
    ...extra,
  });

  it('computes what is left from /auth/me', () => {
    expect(activityMissingFromAuthMe(me('social_profile_deferred', { onboarding: { missing: ['sports'] } }))).toEqual([
      'basicProfile',
      'interestSport',
    ]);
    expect(activityMissingFromAuthMe(me('social_profile_deferred', { verification: { phoneVerified: false } }))).toEqual([
      'phone',
      'basicProfile',
    ]);
    expect(activityMissingFromAuthMe(me('deferred', { onboarding: { missing: ['sports'] } }))).toEqual(['interestSport']);
  });

  it('leaves email signups, completed accounts and guests alone', () => {
    expect(activityMissingFromAuthMe(me('deferred', { user: { onboardingStatus: 'deferred', authProviders: ['email'] }, onboarding: { missing: ['sports'] } }))).toEqual([]);
    expect(activityMissingFromAuthMe(me('deferred', { user: { onboardingStatus: 'deferred', authProviders: ['email', 'kakao'] }, onboarding: { missing: ['sports'] } }))).toEqual([]);
    expect(activityMissingFromAuthMe(me('completed', { onboarding: { missing: ['sports'] } }))).toEqual([]);
    expect(activityMissingFromAuthMe(me('deferred'))).toEqual([]);
    expect(activityMissingFromAuthMe(undefined)).toEqual([]);
  });
});
