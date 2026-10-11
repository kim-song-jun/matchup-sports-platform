import { afterEach, describe, expect, it } from 'vitest';
import { buildActivityProfileHref, currentReturnPath } from './activity-profile-required';
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
