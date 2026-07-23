import { createHmac, timingSafeEqual } from 'crypto';

const PROOF_TTL_MS = 10 * 60 * 1000;

function proofSecret(): string {
  return process.env.V1_SESSION_SECRET ?? process.env.V1_JWT_SECRET ?? process.env.JWT_SECRET ?? '';
}

function sign(payload: string): string {
  return createHmac('sha256', proofSecret()).update(payload).digest('base64url');
}

export function issuePhoneProofToken(phone: string, nowMs: number = Date.now()): string {
  const payload = `${phone}:${nowMs + PROOF_TTL_MS}`;
  return `${Buffer.from(payload).toString('base64url')}.${sign(payload)}`;
}

export function verifyPhoneProofToken(token: string, phone: string, nowMs: number = Date.now()): boolean {
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [payloadB64, signature] = parts;
  let payload: string;
  try {
    payload = Buffer.from(payloadB64, 'base64url').toString('utf8');
  } catch {
    return false;
  }
  const [tokenPhone, expStr] = payload.split(':');
  if (tokenPhone !== phone) return false;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < nowMs) return false;
  const expected = Buffer.from(sign(payload));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}
