import { describe, expect, it } from 'vitest';
import { EMAIL_CHANGE_PATH, emailChangePath, parseEmailChangeReturnTo, PROFILE_EDIT_PATH } from './email-change-path';

describe('emailChangePath and parseEmailChangeReturnTo', () => {
  it('goes to the step screen alone when the profile edit screen has no query to restore', () => {
    expect(emailChangePath()).toBe('/my/profile/edit/email');
    expect(emailChangePath(null)).toBe(EMAIL_CHANGE_PATH);
    expect(emailChangePath(PROFILE_EDIT_PATH)).toBe(EMAIL_CHANGE_PATH);
  });

  it('carries the profile edit screen with its own query as an encoded redirect', () => {
    expect(emailChangePath('/my/profile/edit?from=%2Fmy%2Fsettings')).toBe(
      '/my/profile/edit/email?redirect=%2Fmy%2Fprofile%2Fedit%3Ffrom%3D%252Fmy%252Fsettings',
    );
    expect(parseEmailChangeReturnTo('/my/profile/edit?from=%2Fmy%2Fsettings')).toBe('/my/profile/edit?from=%2Fmy%2Fsettings');
  });

  it.each([
    ['an external address', 'https://evil.example.com'],
    ['a protocol-relative address', '//evil.example.com'],
    ['the login screen', '/login'],
    ['not a path', 'my/profile/edit'],
    ['another screen of this app', '/my/settings/login-methods'],
    ['this step screen itself', '/my/profile/edit/email'],
  ])('does not return to %s', (_label, value) => {
    expect(parseEmailChangeReturnTo(value)).toBe(PROFILE_EDIT_PATH);
    expect(emailChangePath(value)).toBe(EMAIL_CHANGE_PATH);
  });
});
