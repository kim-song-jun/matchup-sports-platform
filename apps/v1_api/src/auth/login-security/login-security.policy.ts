import { createHmac, randomBytes } from 'node:crypto';
import { V1SessionConfigurationError } from '../v1-session';

/** Every login-hardening threshold lives here so ops can retune them from production data in one place. */
export const LOGIN_SECURITY_POLICY = {
  /** An email with this many failures inside the window must pass an email code on its next login. */
  accountFailureThreshold: 3,
  accountFailureWindowMs: 15 * 60_000,

  /** Spray detection: at least `failureThreshold` failures across at least `accountThreshold` emails inside the window. */
  sprayWindowMs: 10 * 60_000,
  sprayFailureThreshold: 30,
  sprayAccountThreshold: 10,
  /** While the last detection is this recent, every email login needs an email code. */
  sprayActiveMs: 30 * 60_000,

  codeTtlMs: 5 * 60_000,
  maxCodeAttempts: 5,
  resendCooldownMs: 30_000,
  /** Real mails per email per 24h. */
  sendCapPerDay: 5,
  sendCapWindowMs: 24 * 60 * 60_000,
  /** A challenge token stops working (resend included) this long after it was issued. */
  challengeMaxAgeMs: 30 * 60_000,

  attemptRetentionMs: 30 * 24 * 60 * 60_000,
  challengeRetentionMs: 7 * 24 * 60 * 60_000,
} as const;

export const LOGIN_SPRAY_ANOMALY_KIND = 'login_spray' as const;

/** Outbox event type the worker turns into a Slack message. */
export const SECURITY_LOGIN_ANOMALY_TYPE = 'SECURITY_LOGIN_ANOMALY';

const EMAIL_KEY_PURPOSE = 'teameet:login-attempt:email-key:v1';
const IP_KEY_PURPOSE = 'teameet:login-attempt:ip-key:v1';
const MINIMUM_SECRET_LENGTH = 32;

let processLocalSecret: Buffer | undefined;

/**
 * Production boot already refuses a session secret shorter than 32 characters, so the throw below only
 * guards direct callers. Outside production a missing secret gets a per-process random key instead of a
 * public constant: keys stay unlinkable to emails and merely reset on restart.
 */
function keyedHashSecret(): string | Buffer {
  const secret = process.env.V1_SESSION_SECRET;
  if (secret && secret.length >= MINIMUM_SECRET_LENGTH) return secret;
  if (process.env.NODE_ENV === 'production') {
    throw new V1SessionConfigurationError('V1_SESSION_SECRET must contain at least 32 characters in production');
  }
  processLocalSecret ??= randomBytes(32);
  return processLocalSecret;
}

function keyedHash(purpose: string, value: string): string {
  const purposeKey = createHmac('sha256', keyedHashSecret()).update(purpose).digest();
  return createHmac('sha256', purposeKey).update(value).digest('base64url');
}

/** Stable, non-reversible identifier of a normalized email for attempt counting. */
export function loginEmailKey(normalizedEmail: string): string {
  return keyedHash(EMAIL_KEY_PURPOSE, normalizedEmail);
}

export function loginIpKey(ip: string | undefined | null): string | null {
  const trimmed = ip?.trim();
  return trimmed ? keyedHash(IP_KEY_PURPOSE, trimmed) : null;
}

export interface LoginAttemptKeys {
  emailKey: string;
  ipKey: string | null;
}

export function loginAttemptKeys(normalizedEmail: string, ip: string | undefined | null): LoginAttemptKeys {
  return { emailKey: loginEmailKey(normalizedEmail), ipKey: loginIpKey(ip) };
}
