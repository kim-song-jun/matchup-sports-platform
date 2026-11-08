import { normalizeEmail } from '../auth/normalize-email';
import { issueProofToken, proofDigest, verifyProofToken, type ProofPayloadBuilder } from './proof-token';

/**
 * Proof that a signed-in account received the code mailed to one address. The flow that spends it (adding an email
 * login, changing the account email) is named by `purpose`, which leads the signed payload: all flows share the
 * secret, so a token of one flow can never equal the payload another flow rebuilds.
 */
export type AccountEmailProofKind = {
  /** First segment of the payload; must differ per flow and from every other proof family's lead segment. */
  readonly purpose: string;
  /** Namespaces the keyed digest that stands for the account id. */
  readonly accountDigestLabel: string;
};

function payloadFor(kind: AccountEmailProofKind, userId: string, email: string): ProofPayloadBuilder {
  // The account appears as a keyed digest, so the token does not hand its holder the id.
  const account = proofDigest(kind.accountDigestLabel, userId);
  return (expMs) => `${kind.purpose}:${account}:${email}:${expMs}`;
}

export function issueAccountEmailProof(kind: AccountEmailProofKind, userId: string, email: string, nowMs: number = Date.now()): string {
  return issueProofToken(payloadFor(kind, userId, normalizeEmail(email)), nowMs);
}

/** The address a genuine, unexpired token of this flow and account vouches for; null for anything else. */
export function readAccountEmailProof(kind: AccountEmailProofKind, token: string, userId: string, nowMs: number = Date.now()): string | null {
  const [encodedPayload] = token.split('.');
  if (!encodedPayload) return null;
  const segments = Buffer.from(encodedPayload, 'base64url').toString('utf8').split(':');
  // purpose, account digest, address, expiry. A quoted local part may contain ':', so the address is whatever lies between.
  if (segments.length < 4 || segments[0] !== kind.purpose) return null;
  const email = segments.slice(2, -1).join(':');
  if (email.length === 0) return null;
  // The payload is rebuilt for this account and compared with the signed one, so another account's token fails here.
  return verifyProofToken(token, payloadFor(kind, userId, email), nowMs) ? email : null;
}
