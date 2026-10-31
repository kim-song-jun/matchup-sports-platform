import type { V1AuthProvider } from '@prisma/client';
import { PROOF_TTL_MS, issueProofToken, proofDigest, verifyProofToken, type ProofPayloadBuilder } from '../verification/proof-token';

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

/**
 * A token's content as it is signed and read back. Account ids never travel in it: the signup account and the
 * accounts allowed to receive the identity appear only as keyed digests (`socialLinkAccountDigest`).
 */
export type SocialLinkTokenContent =
  | { kind: 'verified_identity'; provider: LinkableSocialProvider; providerUserKey: string; email: string | null; allowedAccounts: string[] }
  | { kind: 'pending_account'; provider: LinkableSocialProvider; providerUserKey: string; pendingAccount: string; allowedAccounts: string[] };

export const SOCIAL_LINK_TOKEN_TTL_SECONDS = PROOF_TTL_MS / 1000;

/** Leads the signed payload; no other proof token (phone, email) can start with it. */
const PURPOSE = 'social_link_pending';
const ACCOUNT_DIGEST_LABEL = 'social_link_account';
const MAX_ALLOWED_ACCOUNTS = 4;

export function isLinkableSocialProvider(provider: V1AuthProvider | string): provider is LinkableSocialProvider {
  return provider === 'kakao' || provider === 'apple';
}

export function socialLinkAccountDigest(userId: string): string {
  return proofDigest(ACCOUNT_DIGEST_LABEL, userId);
}

function toContent(claims: SocialLinkClaims, targetUserIds: readonly string[]): SocialLinkTokenContent {
  const allowedAccounts = [...new Set(targetUserIds)].map(socialLinkAccountDigest);
  return claims.kind === 'pending_account'
    ? {
        kind: claims.kind,
        provider: claims.provider,
        providerUserKey: claims.providerUserKey,
        pendingAccount: socialLinkAccountDigest(claims.pendingUserId),
        allowedAccounts,
      }
    : { ...claims, allowedAccounts };
}

function encodeContent(content: SocialLinkTokenContent): string {
  const tuple = [
    content.kind,
    content.provider,
    content.providerUserKey,
    content.kind === 'pending_account' ? content.pendingAccount : content.email,
    content.allowedAccounts,
  ];
  return Buffer.from(JSON.stringify(tuple)).toString('base64url');
}

function payloadFor(content: SocialLinkTokenContent): ProofPayloadBuilder {
  const encoded = encodeContent(content);
  return (expMs) => `${PURPOSE}:${encoded}:${expMs}`;
}

/** `targetUserIds` are the accounts the identity may be attached to: the candidates the rejected login collided with. */
export function issueSocialLinkToken(
  claims: SocialLinkClaims,
  targetUserIds: readonly string[],
  nowMs: number = Date.now(),
): string {
  if (targetUserIds.length === 0) throw new Error('A social link token needs at least one target account');
  return issueProofToken(payloadFor(toContent(claims, targetUserIds)), nowMs);
}

/** The content of a genuine, unexpired token of this purpose; null for anything else. */
export function readSocialLinkToken(token: string, nowMs: number = Date.now()): SocialLinkTokenContent | null {
  const content = parseContent(token);
  if (!content) return null;
  // The payload is rebuilt from the parsed content and compared with the signed one, so extra or reordered content fails.
  return verifyProofToken(token, payloadFor(content), nowMs) ? content : null;
}

function parseContent(token: string): SocialLinkTokenContent | null {
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
  if (!Array.isArray(tuple) || tuple.length !== 5) return null;

  const [kind, provider, providerUserKey, last, allowedAccounts] = tuple;
  if (typeof provider !== 'string' || !isLinkableSocialProvider(provider)) return null;
  if (typeof providerUserKey !== 'string' || providerUserKey.length === 0) return null;
  if (
    !Array.isArray(allowedAccounts) ||
    allowedAccounts.length === 0 ||
    allowedAccounts.length > MAX_ALLOWED_ACCOUNTS ||
    !allowedAccounts.every((digest): digest is string => typeof digest === 'string' && digest.length > 0)
  ) {
    return null;
  }
  if (kind === 'pending_account' && typeof last === 'string' && last.length > 0) {
    return { kind, provider, providerUserKey, pendingAccount: last, allowedAccounts };
  }
  if (kind === 'verified_identity' && (last === null || (typeof last === 'string' && last.length > 0))) {
    return { kind, provider, providerUserKey, email: last, allowedAccounts };
  }
  return null;
}
