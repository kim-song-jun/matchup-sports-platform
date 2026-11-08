import { issueAccountEmailProof, readAccountEmailProof, type AccountEmailProofKind } from '../verification/account-email-proof';
import { PROOF_TTL_MS } from '../verification/proof-token';

/**
 * Proof that the signed-in account received the code mailed to an address, spent when it adds that address as an
 * email login (`POST /auth/link/email/complete`). Bound to the account and the address, so it opens nothing else.
 */

export const EMAIL_LINK_TOKEN_TTL_SECONDS = PROOF_TTL_MS / 1000;

const KIND: AccountEmailProofKind = { purpose: 'email_login_link', accountDigestLabel: 'email_link_account' };

export function issueEmailLinkToken(userId: string, email: string, nowMs: number = Date.now()): string {
  return issueAccountEmailProof(KIND, userId, email, nowMs);
}

/** The address a genuine, unexpired token of this account vouches for; null for anything else. */
export function readEmailLinkToken(token: string, userId: string, nowMs: number = Date.now()): string | null {
  return readAccountEmailProof(KIND, token, userId, nowMs);
}
