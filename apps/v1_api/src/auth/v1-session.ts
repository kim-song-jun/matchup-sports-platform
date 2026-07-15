import { createHmac, timingSafeEqual } from 'node:crypto';

export const V1_SESSION_COOKIE_NAME = 'teameet_v1_session';

const SESSION_TOKEN_VERSION = 'v1';
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
const MINIMUM_SESSION_SECRET_LENGTH = 32;
const SESSION_COOKIE_PATH = '/api/v1';

type V1SessionPayload = {
  readonly sub: string;
  readonly iat: number;
  readonly exp: number;
};

export type V1RequestIdentity =
  | { readonly kind: 'user_id'; readonly userId: string }
  | { readonly kind: 'email'; readonly email: string };

type V1SessionRuntimeConfiguration = {
  readonly nodeEnv: string | undefined;
  readonly sessionSecret: string | null | undefined;
  readonly legacyHeaderAuthEnabled?: boolean;
  readonly nowMs?: number;
};

type V1SessionRequest = {
  readonly headers: { readonly cookie?: string };
  header(name: string): string | undefined;
};

type V1SessionCookieOptions = {
  readonly httpOnly: true;
  readonly secure: boolean;
  readonly sameSite: 'lax';
  readonly path: string;
  readonly maxAge: number;
};

type V1SessionClearCookieOptions = Omit<V1SessionCookieOptions, 'httpOnly' | 'maxAge'> & {
  readonly httpOnly: true;
};

export type V1SessionCookieResponse = {
  cookie(name: string, value: string, options: V1SessionCookieOptions): unknown;
  clearCookie(name: string, options: V1SessionClearCookieOptions): unknown;
};

export class V1SessionConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'V1SessionConfigurationError';
  }
}

export function assertV1SessionRuntimeConfiguration(
  configuration: V1SessionRuntimeConfiguration,
): void {
  if (configuration.nodeEnv !== 'production') return;

  if (!isStrongSessionSecret(configuration.sessionSecret)) {
    throw new V1SessionConfigurationError(
      'V1_SESSION_SECRET must contain at least 32 characters in production',
    );
  }

  if (configuration.legacyHeaderAuthEnabled) {
    throw new V1SessionConfigurationError(
      'V1_ALLOW_HEADER_AUTH is not supported in production',
    );
  }
}

export function createV1SessionToken(input: {
  readonly userId: string;
  readonly secret: string;
  readonly issuedAtMs?: number;
}): string {
  if (!isStrongSessionSecret(input.secret)) {
    throw new V1SessionConfigurationError(
      'A v1 session secret must contain at least 32 characters',
    );
  }

  const issuedAt = Math.floor((input.issuedAtMs ?? Date.now()) / 1_000);
  const payload: V1SessionPayload = {
    sub: input.userId,
    iat: issuedAt,
    exp: issuedAt + SESSION_TTL_SECONDS,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signedValue = `${SESSION_TOKEN_VERSION}.${encodedPayload}`;
  const signature = sign(signedValue, input.secret);
  return `${signedValue}.${signature}`;
}

export function readV1SessionUserId(
  cookieHeader: string | undefined,
  configuration: { readonly secret: string; readonly nowMs?: number },
): string | null {
  const token = readCookie(cookieHeader, V1_SESSION_COOKIE_NAME);
  if (!token) return null;

  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [version, encodedPayload, suppliedSignature] = parts;
  if (
    version !== SESSION_TOKEN_VERSION ||
    !encodedPayload ||
    !suppliedSignature
  ) {
    return null;
  }

  const signedValue = `${version}.${encodedPayload}`;
  const expectedSignature = sign(signedValue, configuration.secret);
  if (!signaturesMatch(suppliedSignature, expectedSignature)) return null;

  const payload = parsePayload(encodedPayload);
  if (!payload) return null;

  const now = Math.floor((configuration.nowMs ?? Date.now()) / 1_000);
  if (payload.iat > now + 60 || payload.exp <= now) return null;
  if (payload.exp - payload.iat !== SESSION_TTL_SECONDS) return null;
  return payload.sub;
}

export function resolveV1RequestIdentity(
  request: V1SessionRequest,
  configuration: V1SessionRuntimeConfiguration,
): V1RequestIdentity | null {
  const sessionUserId = isStrongSessionSecret(configuration.sessionSecret)
    ? readV1SessionUserId(request.headers.cookie, {
        secret: configuration.sessionSecret,
        nowMs: configuration.nowMs,
      })
    : null;

  if (sessionUserId) return { kind: 'user_id', userId: sessionUserId };
  if (configuration.nodeEnv === 'production') return null;

  const userId = readHeader(request, 'x-v1-user-id');
  if (userId) return { kind: 'user_id', userId };

  const email = readHeader(request, 'x-v1-user-email');
  return email ? { kind: 'email', email } : null;
}

export function writeV1SessionCookie(
  response: Pick<V1SessionCookieResponse, 'cookie'>,
  userId: string,
  configuration: V1SessionRuntimeConfiguration = currentRuntimeConfiguration(),
): boolean {
  if (!isStrongSessionSecret(configuration.sessionSecret)) {
    assertV1SessionRuntimeConfiguration(configuration);
    return false;
  }

  const token = createV1SessionToken({
    userId,
    secret: configuration.sessionSecret,
    issuedAtMs: configuration.nowMs,
  });
  response.cookie(V1_SESSION_COOKIE_NAME, token, cookieOptions(configuration.nodeEnv));
  return true;
}

export function clearV1SessionCookie(
  response: Pick<V1SessionCookieResponse, 'clearCookie'>,
  nodeEnv: string | undefined = process.env.NODE_ENV,
): void {
  response.clearCookie(V1_SESSION_COOKIE_NAME, {
    httpOnly: true,
    secure: nodeEnv === 'production',
    sameSite: 'lax',
    path: SESSION_COOKIE_PATH,
  });
}

export function currentRuntimeConfiguration(): V1SessionRuntimeConfiguration {
  return {
    nodeEnv: process.env.NODE_ENV,
    sessionSecret: process.env.V1_SESSION_SECRET,
    legacyHeaderAuthEnabled: process.env.V1_ALLOW_HEADER_AUTH === 'true',
  };
}

function cookieOptions(nodeEnv: string | undefined): V1SessionCookieOptions {
  return {
    httpOnly: true,
    secure: nodeEnv === 'production',
    sameSite: 'lax',
    path: SESSION_COOKIE_PATH,
    maxAge: SESSION_TTL_SECONDS * 1_000,
  };
}

function isStrongSessionSecret(secret: string | null | undefined): secret is string {
  return typeof secret === 'string' && secret.length >= MINIMUM_SESSION_SECRET_LENGTH;
}

function sign(value: string, secret: string): string {
  return createHmac('sha256', secret).update(value).digest('base64url');
}

function signaturesMatch(supplied: string, expected: string): boolean {
  const suppliedBytes = Buffer.from(supplied);
  const expectedBytes = Buffer.from(expected);
  return (
    suppliedBytes.length === expectedBytes.length &&
    timingSafeEqual(suppliedBytes, expectedBytes)
  );
}

function parsePayload(encodedPayload: string): V1SessionPayload | null {
  try {
    const value: unknown = JSON.parse(
      Buffer.from(encodedPayload, 'base64url').toString('utf8'),
    );
    if (!isV1SessionPayload(value)) return null;
    return value;
  } catch (error) {
    if (error instanceof SyntaxError) return null;
    throw error;
  }
}

function isV1SessionPayload(value: unknown): value is V1SessionPayload {
  return (
    typeof value === 'object' &&
    value !== null &&
    'sub' in value &&
    typeof value.sub === 'string' &&
    value.sub.length > 0 &&
    'iat' in value &&
    typeof value.iat === 'number' &&
    Number.isInteger(value.iat) &&
    'exp' in value &&
    typeof value.exp === 'number' &&
    Number.isInteger(value.exp)
  );
}

function readCookie(cookieHeader: string | undefined, name: string): string | null {
  if (!cookieHeader) return null;
  for (const item of cookieHeader.split(';')) {
    const separator = item.indexOf('=');
    if (separator < 0) continue;
    const cookieName = item.slice(0, separator).trim();
    if (cookieName !== name) continue;
    const value = item.slice(separator + 1).trim();
    return value || null;
  }
  return null;
}

function readHeader(request: V1SessionRequest, name: string): string | null {
  const value = request.header(name);
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
