import { describe, expect, it } from 'vitest';
import { V1ApiError } from './api-client';
import {
  getPasswordLoginUnavailableProviders,
  isEmailSendUnavailable,
  getRecentLoginRequired,
  getSignInThenLinkHint,
  getSignupIncompleteRoute,
  getWithdrawalCancelOffer,
} from './auth-link-errors';

function apiError(statusCode: number, code: string, details?: unknown) {
  return new V1ApiError({
    status: 'error',
    statusCode,
    code,
    message: '메시지',
    details,
    timestamp: '2026-10-31T00:00:00.000Z',
  });
}

describe('getSignInThenLinkHint', () => {
  it.each(['kakao', 'apple'] as const)('reads the %s hint from a 409', (provider) => {
    const error = apiError(409, 'SOCIAL_LINK_REQUIRES_VERIFIED_EMAIL', { next: 'sign_in_then_link', provider });
    expect(getSignInThenLinkHint(error)).toEqual({ next: 'sign_in_then_link', provider });
  });

  it('carries the link token and its lifetime when both are intact', () => {
    const details = { next: 'sign_in_then_link', provider: 'kakao', linkToken: 'signed-link-token', linkTokenExpiresInSeconds: 600 };
    expect(getSignInThenLinkHint(apiError(409, 'SOCIAL_LINK_REQUIRES_VERIFIED_EMAIL', details))).toEqual(details);
  });

  it.each([
    ['a token without a lifetime', { linkToken: 'signed-link-token' }],
    ['a lifetime without a token', { linkTokenExpiresInSeconds: 600 }],
    ['an empty token', { linkToken: '', linkTokenExpiresInSeconds: 600 }],
    ['a non-string token', { linkToken: 5, linkTokenExpiresInSeconds: 600 }],
    ['a zero lifetime', { linkToken: 'signed-link-token', linkTokenExpiresInSeconds: 0 }],
    ['a string lifetime', { linkToken: 'signed-link-token', linkTokenExpiresInSeconds: '600' }],
  ])('keeps the hint but leaves the token out with %s', (_label, extra) => {
    const error = apiError(409, 'SOCIAL_LINK_CONTACT_CONFLICT', { next: 'sign_in_then_link', provider: 'apple', ...extra });
    expect(getSignInThenLinkHint(error)).toStrictEqual({ next: 'sign_in_then_link', provider: 'apple' });
  });

  it('keeps working for PHONE_CONFLICT, which carries the same details', () => {
    const error = apiError(409, 'PHONE_CONFLICT', { next: 'sign_in_then_link', provider: 'kakao' });
    expect(getSignInThenLinkHint(error)).toEqual({ next: 'sign_in_then_link', provider: 'kakao' });
  });

  it.each([
    ['no details', undefined],
    ['null details', null],
    ['string details', 'sign_in_then_link'],
    ['array details', [{ next: 'sign_in_then_link', provider: 'kakao' }]],
    ['a different next action', { next: 'verify_email', provider: 'kakao' }],
    ['a provider that cannot be linked', { next: 'sign_in_then_link', provider: 'naver' }],
    ['a missing provider', { next: 'sign_in_then_link' }],
  ])('returns null for %s', (_label, details) => {
    expect(getSignInThenLinkHint(apiError(409, 'PHONE_CONFLICT', details))).toBeNull();
  });

  it('ignores the same details on a non-409 response', () => {
    const details = { next: 'sign_in_then_link', provider: 'kakao' };
    expect(getSignInThenLinkHint(apiError(400, 'VALIDATION_ERROR', details))).toBeNull();
  });

  it('does not read the object-shaped next of SIGNUP_INCOMPLETE as a sign-in hint', () => {
    const error = apiError(403, 'SIGNUP_INCOMPLETE', { next: { route: '/signup/social' } });
    expect(getSignInThenLinkHint(error)).toBeNull();
    expect(getSignInThenLinkHint(apiError(409, 'SOCIAL_LINK_PROVIDER_IN_USE', { next: { route: '/signup/social' } }))).toBeNull();
  });

  it('ignores errors that did not come from the API client', () => {
    expect(getSignInThenLinkHint(Object.assign(new Error('x'), { statusCode: 409, details: { next: 'sign_in_then_link', provider: 'kakao' } }))).toBeNull();
    expect(getSignInThenLinkHint(null)).toBeNull();
  });
});

describe('getWithdrawalCancelOffer', () => {
  const details = { withdrawalCancelToken: 'cancel-token', expiresInSeconds: 600 };

  it('returns the token in the shape the cancel endpoint takes', () => {
    expect(getWithdrawalCancelOffer(apiError(403, 'ACCOUNT_WITHDRAWAL_PENDING', details)))
      .toEqual({ token: 'cancel-token', expiresInSeconds: 600 });
  });

  it('is null when the server sent no token (credentials were not proven)', () => {
    expect(getWithdrawalCancelOffer(apiError(403, 'ACCOUNT_WITHDRAWAL_PENDING'))).toBeNull();
    expect(getWithdrawalCancelOffer(apiError(403, 'ACCOUNT_WITHDRAWAL_PENDING', { expiresInSeconds: 600 }))).toBeNull();
  });

  it.each([
    ['an empty token', { ...details, withdrawalCancelToken: '' }],
    ['a non-string token', { ...details, withdrawalCancelToken: 7 }],
    ['a missing lifetime', { withdrawalCancelToken: 'cancel-token' }],
    ['a zero lifetime', { ...details, expiresInSeconds: 0 }],
    ['a string lifetime', { ...details, expiresInSeconds: '600' }],
  ])('rejects %s', (_label, bad) => {
    expect(getWithdrawalCancelOffer(apiError(403, 'ACCOUNT_WITHDRAWAL_PENDING', bad))).toBeNull();
  });

  it('does not offer a token for another 403 that happens to carry one', () => {
    expect(getWithdrawalCancelOffer(apiError(403, 'PERMISSION_DENIED', details))).toBeNull();
    expect(getWithdrawalCancelOffer(apiError(401, 'ACCOUNT_WITHDRAWAL_PENDING', details))).toBeNull();
  });
});

describe('getRecentLoginRequired', () => {
  it('reads the allowed session age', () => {
    expect(getRecentLoginRequired(apiError(403, 'RECENT_LOGIN_REQUIRED', { maxAgeSeconds: 300 })))
      .toEqual({ maxAgeSeconds: 300 });
  });

  it.each([
    ['no details', undefined],
    ['a string age', { maxAgeSeconds: '300' }],
    ['a negative age', { maxAgeSeconds: -1 }],
  ])('is null with %s', (_label, details) => {
    expect(getRecentLoginRequired(apiError(403, 'RECENT_LOGIN_REQUIRED', details))).toBeNull();
  });

  it('is null for other 403 codes', () => {
    expect(getRecentLoginRequired(apiError(403, 'SIGNUP_INCOMPLETE', { maxAgeSeconds: 300 }))).toBeNull();
  });
});

describe('getSignupIncompleteRoute', () => {
  it.each(['/terms?mode=social', '/signup/social'])('returns the route the server sent (%s)', (route) => {
    expect(getSignupIncompleteRoute(apiError(403, 'SIGNUP_INCOMPLETE', { next: { route } }))).toBe(route);
  });

  it.each([
    ['no details', undefined],
    ['a string next, the shape of the sign-in hint', { next: 'sign_in_then_link', provider: 'kakao' }],
    ['a route that is not a string', { next: { route: 7 } }],
    ['an off-site route', { next: { route: 'https://evil.example/signup' } }],
    ['a protocol-relative route', { next: { route: '//evil.example' } }],
  ])('is null with %s', (_label, details) => {
    expect(getSignupIncompleteRoute(apiError(403, 'SIGNUP_INCOMPLETE', details))).toBeNull();
  });

  it('is null for another code or status carrying the same details', () => {
    const details = { next: { route: '/signup/social' } };
    expect(getSignupIncompleteRoute(apiError(403, 'PERMISSION_DENIED', details))).toBeNull();
    expect(getSignupIncompleteRoute(apiError(409, 'SIGNUP_INCOMPLETE', details))).toBeNull();
  });
});

describe('getPasswordLoginUnavailableProviders', () => {
  const unavailable = (details: unknown) => apiError(400, 'PASSWORD_LOGIN_UNAVAILABLE', details);

  it('returns the providers the account really has, in server order and without repeats', () => {
    expect(getPasswordLoginUnavailableProviders(unavailable({ providers: ['apple', 'kakao', 'apple'] }))).toEqual(['apple', 'kakao']);
  });

  it('drops values that are not social providers instead of offering a login for them', () => {
    expect(getPasswordLoginUnavailableProviders(unavailable({ providers: ['kakao', 'email', 'google', 3, null] }))).toEqual(['kakao']);
  });

  it.each([
    ['no details', undefined],
    ['providers that is not a list', { providers: 'kakao' }],
    ['an empty list', { providers: [] }],
  ])('is empty with %s, so the screen falls back to guidance that names no provider', (_label, details) => {
    expect(getPasswordLoginUnavailableProviders(unavailable(details))).toEqual([]);
  });

  it('is empty for a different error that carries providers', () => {
    expect(getPasswordLoginUnavailableProviders(apiError(400, 'VALIDATION_ERROR', { providers: ['kakao'] }))).toEqual([]);
    expect(getPasswordLoginUnavailableProviders(apiError(409, 'PASSWORD_LOGIN_UNAVAILABLE', { providers: ['kakao'] }))).toEqual([]);
    expect(getPasswordLoginUnavailableProviders(new Error('x'))).toEqual([]);
  });
});

describe('isEmailSendUnavailable', () => {
  it('recognises the 503 the server gives when no mail can be sent at all', () => {
    expect(isEmailSendUnavailable(apiError(503, 'EMAIL_SEND_UNAVAILABLE'))).toBe(true);
  });

  it.each([
    ['a mail that failed to send', apiError(503, 'EMAIL_SEND_FAILED')],
    ['the same code with another status', apiError(400, 'EMAIL_SEND_UNAVAILABLE')],
    ['an unrelated error', new Error('network')],
    ['nothing', null],
  ])('does not mistake %s for it', (_name, error) => {
    expect(isEmailSendUnavailable(error)).toBe(false);
  });
});
