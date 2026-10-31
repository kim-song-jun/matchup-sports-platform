import { issueProofToken, proofDigest, PROOF_TTL_MS, verifyProofToken, type ProofPayloadBuilder } from '../verification/proof-token';
import { normalizeEmail } from './normalize-email';

/**
 * Proof that the signed-in account received the code mailed to an address, spent when it adds that address as an
 * email login (`POST /auth/link/email/complete`). Bound to the account and the address, so it opens nothing else.
 */

export const EMAIL_LINK_TOKEN_TTL_SECONDS = PROOF_TTL_MS / 1000;

/** Leads the signed payload; the phone, email and social link proofs all start differently, so none can equal it. */
const PURPOSE = 'email_login_link';
const ACCOUNT_DIGEST_LABEL = 'email_link_account';

function payloadFor(userId: string, email: string): ProofPayloadBuilder {
  // The account appears as a keyed digest, so the token does not hand its holder the id.
  const account = proofDigest(ACCOUNT_DIGEST_LABEL, userId);
  return (expMs) => `${PURPOSE}:${account}:${email}:${expMs}`;
}

export function issueEmailLinkToken(userId: string, email: string, nowMs: number = Date.now()): string {
  return issueProofToken(payloadFor(userId, normalizeEmail(email)), nowMs);
}

/** The address a genuine, unexpired token of this account vouches for; null for anything else. */
export function readEmailLinkToken(token: string, userId: string, nowMs: number = Date.now()): string | null {
  const [encodedPayload] = token.split('.');
  if (!encodedPayload) return null;
  const segments = Buffer.from(encodedPayload, 'base64url').toString('utf8').split(':');
  // purpose, account digest, address, expiry. A quoted local part may contain ':', so the address is whatever lies between.
  if (segments.length < 4 || segments[0] !== PURPOSE) return null;
  const email = segments.slice(2, -1).join(':');
  if (email.length === 0) return null;
  // The payload is rebuilt for this account and compared with the signed one, so another account's token fails here.
  return verifyProofToken(token, payloadFor(userId, email), nowMs) ? email : null;
}
