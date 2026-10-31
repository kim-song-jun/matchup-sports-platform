import type { V1AuthProvider } from '@prisma/client';
import { PROOF_TTL_MS, issueProofToken, verifyProofToken, type ProofPayloadBuilder } from '../verification/proof-token';

/** Providers an account can attach while signed in (`POST /auth/link/{provider}`). */
export type LinkableSocialProvider = Extract<V1AuthProvider, 'kakao' | 'apple'>;

/**
 * What a rejected social sign-in or signup carries so that one later sign-in to the original account can attach
 * the provider without asking the person to authenticate with the provider again.
 *
 * - `verified_identity`: the provider identity the server verified during a login that collided with an existing
 *   account. No account holds it yet.
 * - `pending_account`: the identity of an unfinished social signup that stopped on a number conflict, and that
 *   signup's user id. Linking only moves the identity while it still sits on that account.
 */
export type SocialLinkClaims =
  | { kind: 'verified_identity'; provider: LinkableSocialProvider; providerUserKey: string; email: string | null }
  | { kind: 'pending_account'; provider: LinkableSocialProvider; providerUserKey: string; pendingUserId: string };

export const SOCIAL_LINK_TOKEN_TTL_SECONDS = PROOF_TTL_MS / 1000;

/** Leads the signed payload; no other proof token (phone, email) can start with it. */
const PURPOSE = 'social_link_pending';

export function isLinkableSocialProvider(provider: V1AuthProvider | string): provider is LinkableSocialProvider {
  return provider === 'kakao' || provider === 'apple';
}

function encodeClaims(claims: SocialLinkClaims): string {
  const tuple =
    claims.kind === 'pending_account'
      ? [claims.kind, claims.provider, claims.providerUserKey, claims.pendingUserId]
      : [claims.kind, claims.provider, claims.providerUserKey, claims.email];
  return Buffer.from(JSON.stringify(tuple)).toString('base64url');
}

function payloadFor(claims: SocialLinkClaims): ProofPayloadBuilder {
  const encoded = encodeClaims(claims);
  return (expMs) => `${PURPOSE}:${encoded}:${expMs}`;
}

export function issueSocialLinkToken(claims: SocialLinkClaims, nowMs: number = Date.now()): string {
  return issueProofToken(payloadFor(claims), nowMs);
}

/** The claims of a genuine, unexpired token of this purpose; null for anything else. */
export function readSocialLinkToken(token: string, nowMs: number = Date.now()): SocialLinkClaims | null {
  const claims = parseClaims(token);
  if (!claims) return null;
  // The payload is rebuilt from the parsed claims and compared with the signed one, so extra or reordered content fails.
  return verifyProofToken(token, payloadFor(claims), nowMs) ? claims : null;
}

function parseClaims(token: string): SocialLinkClaims | null {
  const [encodedPayload] = token.split('.');
  if (!encodedPayload) return null;
  const segments = Buffer.from(encodedPayload, 'base64url').toString('utf8').split(':');
  if (segments.length !== 3 || segments[0] !== PURPOSE) return null;

  let tuple: unknown;
  try {
    tuple = JSON.parse(Buffer.from(segments[1], 'base64url').toString('utf8'));
  } catch (error) {
    if (error instanceof SyntaxError) return null;
    throw error;
  }
  if (!Array.isArray(tuple) || tuple.length !== 4) return null;

  const [kind, provider, providerUserKey, last] = tuple;
  if (typeof provider !== 'string' || !isLinkableSocialProvider(provider)) return null;
  if (typeof providerUserKey !== 'string' || providerUserKey.length === 0) return null;
  if (kind === 'pending_account' && typeof last === 'string' && last.length > 0) {
    return { kind, provider, providerUserKey, pendingUserId: last };
  }
  if (kind === 'verified_identity' && (last === null || (typeof last === 'string' && last.length > 0))) {
    return { kind, provider, providerUserKey, email: last };
  }
  return null;
}
