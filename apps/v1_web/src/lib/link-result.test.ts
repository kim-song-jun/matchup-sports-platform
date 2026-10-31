import { describe, expect, it } from 'vitest';
import { V1ApiError } from './api-client';
import {
  buildLinkResultPath,
  LINK_RESULTS,
  linkResultFromError,
  linkResultFromSuccess,
  LOGIN_METHODS_PATH,
  readLinkResultQuery,
  withoutLinkResultQuery,
} from './link-result';

function apiError(statusCode: number, code: string) {
  return new V1ApiError({ status: 'error', statusCode, code, message: '메시지', timestamp: '2026-10-31T00:00:00.000Z' });
}

describe('linkResultFromSuccess', () => {
  it.each([
    [{ alreadyLinked: false, mergedPendingAccount: false }, 'linked'],
    [{ alreadyLinked: false, mergedPendingAccount: true }, 'merged'],
    [{ alreadyLinked: true, mergedPendingAccount: false }, 'already'],
  ] as const)('%j -> %s', (response, expected) => {
    expect(linkResultFromSuccess(response)).toBe(expected);
  });

  it('reports an idempotent repeat as already even if the flags disagree', () => {
    expect(linkResultFromSuccess({ alreadyLinked: true, mergedPendingAccount: true })).toBe('already');
  });
});

describe('linkResultFromError', () => {
  it.each([
    [409, 'SOCIAL_LINK_PROVIDER_IN_USE', 'in_use'],
    [409, 'SOCIAL_LINK_PROVIDER_EXISTS', 'exists'],
    [403, 'RECENT_LOGIN_REQUIRED', 'recent_login'],
    [409, 'SOCIAL_LINK_TOKEN_ACCOUNT_MISMATCH', 'mismatch'],
    [400, 'SOCIAL_LINK_TOKEN_INVALID', 'failed'],
    [403, 'SIGNUP_INCOMPLETE', 'failed'],
    [401, 'UNAUTHENTICATED', 'failed'],
    [500, 'INTERNAL_ERROR', 'failed'],
  ])('%i %s -> %s', (statusCode, code, expected) => {
    expect(linkResultFromError(apiError(statusCode, code))).toBe(expected);
  });

  it('does not trust a code on the wrong status, or an error that is not from the API client', () => {
    expect(linkResultFromError(apiError(500, 'SOCIAL_LINK_PROVIDER_IN_USE'))).toBe('failed');
    expect(linkResultFromError(apiError(409, 'RECENT_LOGIN_REQUIRED'))).toBe('failed');
    expect(linkResultFromError(apiError(400, 'SOCIAL_LINK_TOKEN_ACCOUNT_MISMATCH'))).toBe('failed');
    expect(linkResultFromError(new Error('SOCIAL_LINK_PROVIDER_IN_USE'))).toBe('failed');
    expect(linkResultFromError(undefined)).toBe('failed');
  });
});

describe('buildLinkResultPath and readLinkResultQuery', () => {
  it.each(LINK_RESULTS.flatMap((linkResult) => (['kakao', 'apple'] as const).map((provider) => ({ linkResult, provider }))))(
    'round-trips $linkResult for $provider through the address',
    (outcome) => {
      const path = buildLinkResultPath(outcome);
      const url = new URL(path, 'https://teameet.test');

      expect(url.pathname).toBe(LOGIN_METHODS_PATH);
      expect(readLinkResultQuery(url.searchParams)).toEqual(outcome);
    },
  );

  it('appends to the page it returns to and keeps what is already in the address', () => {
    expect(buildLinkResultPath({ linkResult: 'linked', provider: 'kakao' }, '/my/settings/login-methods?tab=a#top'))
      .toBe('/my/settings/login-methods?tab=a&linkResult=linked&provider=kakao#top');
  });

  it('replaces a previous result instead of stacking a second one', () => {
    const path = buildLinkResultPath({ linkResult: 'failed', provider: 'apple' }, '/my/settings/login-methods?linkResult=linked&provider=kakao');
    expect(path).toBe('/my/settings/login-methods?linkResult=failed&provider=apple');
  });

  it.each(['https://evil.example/x', '//evil.example/x', '/login', '', null, undefined])(
    'falls back to the login methods screen for the return path %j',
    (returnTo) => {
      expect(buildLinkResultPath({ linkResult: 'merged', provider: 'kakao' }, returnTo))
        .toBe(`${LOGIN_METHODS_PATH}?linkResult=merged&provider=kakao`);
    },
  );

  it.each([
    ['an unknown result', '?linkResult=exploded&provider=kakao'],
    ['an unknown provider', '?linkResult=linked&provider=naver'],
    ['a missing provider', '?linkResult=linked'],
    ['a missing result', '?provider=kakao'],
    ['a different case', '?linkResult=LINKED&provider=kakao'],
    ['nothing', ''],
  ])('reads %s as no result', (_label, search) => {
    expect(readLinkResultQuery(new URLSearchParams(search))).toBeNull();
  });
});

describe('withoutLinkResultQuery', () => {
  it('drops only the result keys', () => {
    const params = new URLSearchParams('tab=a&linkResult=linked&provider=kakao&x=1');
    expect(withoutLinkResultQuery(LOGIN_METHODS_PATH, params)).toBe(`${LOGIN_METHODS_PATH}?tab=a&x=1`);
    expect(params.get('linkResult')).toBe('linked');
  });

  it('returns the bare path when nothing else is left', () => {
    expect(withoutLinkResultQuery(LOGIN_METHODS_PATH, new URLSearchParams('linkResult=linked&provider=kakao'))).toBe(LOGIN_METHODS_PATH);
  });
});
