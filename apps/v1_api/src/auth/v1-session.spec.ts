import {
  V1_SESSION_COOKIE_NAME,
  V1SessionConfigurationError,
  assertV1SessionRuntimeConfiguration,
  createV1SessionToken,
  readV1SessionUserId,
  resolveV1RequestIdentity,
  clearV1SessionCookie,
  writeV1SessionCookie,
} from './v1-session';

const NOW_MS = Date.UTC(2026, 6, 15, 4, 0, 0);
const SESSION_SECRET = 'teameet-test-session-secret-32-bytes-minimum';

describe('v1 signed session', () => {
  it('reads the signed user id from the session cookie', () => {
    // Given
    const token = createV1SessionToken({
      userId: 'user-1',
      secret: SESSION_SECRET,
      issuedAtMs: NOW_MS,
    });

    // When
    const userId = readV1SessionUserId(`${V1_SESSION_COOKIE_NAME}=${token}`, {
      secret: SESSION_SECRET,
      nowMs: NOW_MS + 1_000,
    });

    // Then
    expect(userId).toBe('user-1');
  });

  it('rejects a session token whose signature was changed', () => {
    // Given
    const token = createV1SessionToken({
      userId: 'user-1',
      secret: SESSION_SECRET,
      issuedAtMs: NOW_MS,
    });
    const replacement = token.endsWith('a') ? 'b' : 'a';
    const tamperedToken = `${token.slice(0, -1)}${replacement}`;

    // When
    const userId = readV1SessionUserId(`${V1_SESSION_COOKIE_NAME}=${tamperedToken}`, {
      secret: SESSION_SECRET,
      nowMs: NOW_MS + 1_000,
    });

    // Then
    expect(userId).toBeNull();
  });

  it('ignores caller supplied identity headers in production', () => {
    // Given
    const request = createRequest({
      'x-v1-user-id': 'admin-user',
      'x-v1-user-email': 'admin@teameet.v1',
    });

    // When
    const identity = resolveV1RequestIdentity(request, {
      nodeEnv: 'production',
      sessionSecret: SESSION_SECRET,
      nowMs: NOW_MS,
    });

    // Then
    expect(identity).toBeNull();
  });

  it('accepts a signed session cookie in production', () => {
    // Given
    const token = createV1SessionToken({
      userId: 'user-1',
      secret: SESSION_SECRET,
      issuedAtMs: NOW_MS,
    });
    const request = createRequest({}, `${V1_SESSION_COOKIE_NAME}=${token}`);

    // When
    const identity = resolveV1RequestIdentity(request, {
      nodeEnv: 'production',
      sessionSecret: SESSION_SECRET,
      nowMs: NOW_MS + 1_000,
    });

    // Then
    expect(identity).toEqual({ kind: 'user_id', userId: 'user-1' });
  });

  it('keeps identity headers available for local development', () => {
    // Given
    const request = createRequest({ 'x-v1-user-email': 'host@teameet.v1' });

    // When
    const identity = resolveV1RequestIdentity(request, {
      nodeEnv: 'development',
      sessionSecret: null,
      nowMs: NOW_MS,
    });

    // Then
    expect(identity).toEqual({ kind: 'email', email: 'host@teameet.v1' });
  });

  it('requires a strong session secret in production', () => {
    // Given
    const configuration = { nodeEnv: 'production', sessionSecret: 'too-short' };

    // When
    const configure = () => assertV1SessionRuntimeConfiguration(configuration);

    // Then
    expect(configure).toThrow(V1SessionConfigurationError);
  });

  it('writes an HttpOnly secure cookie in production', () => {
    // Given
    const response = { cookie: jest.fn() };

    // When
    writeV1SessionCookie(response, 'user-1', {
      nodeEnv: 'production',
      sessionSecret: SESSION_SECRET,
      nowMs: NOW_MS,
    });

    // Then
    expect(response.cookie).toHaveBeenCalledWith(
      V1_SESSION_COOKIE_NAME,
      expect.any(String),
      expect.objectContaining({
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        path: '/',
      }),
    );
  });

  it('scopes the session cookie to path "/" so it also attaches to Socket.IO handshakes', () => {
    // Given: the Socket.IO handshake lives at /socket.io, outside the
    // /api/v1 REST prefix. RFC6265 cookie path matching is a strict prefix
    // match, so a cookie scoped to '/api/v1' would never be sent on that
    // request — every realtime connection would silently fail auth.
    const response = { cookie: jest.fn() };

    // When
    writeV1SessionCookie(response, 'user-1', {
      nodeEnv: 'production',
      sessionSecret: SESSION_SECRET,
      nowMs: NOW_MS,
    });

    // Then
    const [, , options] = response.cookie.mock.calls[0] as [
      string,
      string,
      { path: string },
    ];
    expect(options.path).toBe('/');
  });

  it('clears the session cookie even when no authenticated identity is available', () => {
    // Given
    const response = { cookie: jest.fn(), clearCookie: jest.fn() };

    // When
    clearV1SessionCookie(response, 'production');

    // Then
    expect(response.clearCookie).toHaveBeenCalledWith(
      V1_SESSION_COOKIE_NAME,
      expect.objectContaining({
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        path: '/',
      }),
    );
  });

  it('also clears legacy parent-domain cookies so a stale wildcard-domain session cannot survive logout', () => {
    // Given
    const response = { cookie: jest.fn(), clearCookie: jest.fn() };

    // When
    clearV1SessionCookie(response, 'production');

    // Then
    expect(response.clearCookie).toHaveBeenCalledWith(
      V1_SESSION_COOKIE_NAME,
      expect.objectContaining({ domain: '.teameet.co.kr' }),
    );
    expect(response.clearCookie).toHaveBeenCalledWith(
      V1_SESSION_COOKIE_NAME,
      expect.objectContaining({ domain: 'teameet.co.kr' }),
    );
    expect(response.clearCookie).toHaveBeenCalledTimes(3);
  });
});

type RequestHeaders = Readonly<Record<string, string>>;

function createRequest(headers: RequestHeaders, cookie?: string) {
  return {
    headers: cookie ? { cookie } : {},
    header(name: string) {
      return headers[name];
    },
  };
}
