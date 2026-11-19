import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export const MEMBER_ACCESS_COOKIE = 'teameet_v1_member_access';
export const MEMBER_ACCESS_TTL_MS = 10 * 60_000;
export const MEMBER_ACCESS_CONTROL_PATH = '/api/v1/admin/member-access';

export function memberAccessCookie(header: string | undefined, name = MEMBER_ACCESS_COOKIE): string | null {
  for (const item of header?.split(';') ?? []) {
    const separator = item.indexOf('=');
    if (separator >= 0 && item.slice(0, separator).trim() === name) return item.slice(separator + 1).trim() || null;
  }
  return null;
}

export function memberAccessBinding(cookie: string): string {
  return createHash('sha256').update(cookie).digest('hex');
}

export function signMemberAccess(id: string, secret: string): string {
  if (secret.length < 32) throw new Error('A strong session secret is required');
  const value = `ma1.${id}`;
  return `${value}.${createHmac('sha256', secret).update(value).digest('base64url')}`;
}

export function readMemberAccess(token: string | null, secret: string): string | null {
  if (!token || secret.length < 32) return null;
  const [version, id, signature, extra] = token.split('.');
  if (version !== 'ma1' || !id || !signature || extra !== undefined || !/^[a-f0-9-]{36}$/i.test(id)) return null;
  const expected = Buffer.from(signMemberAccess(id, secret));
  const supplied = Buffer.from(token);
  return expected.length === supplied.length && timingSafeEqual(expected, supplied) ? id : null;
}
