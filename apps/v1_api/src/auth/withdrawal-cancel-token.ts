import { ForbiddenException } from '@nestjs/common';
import { PROOF_TTL_MS, issueProofToken, verifyProofToken, type ProofPayloadBuilder } from '../verification/proof-token';

/**
 * Proof that the caller just passed the login credentials of a withdrawal-pending account. It is minted only
 * by the sign-in paths that verified a password or a provider token for that very account, and it is the sole
 * input of POST /auth/withdrawal/cancel.
 *
 * Signed with the shared proof-token secret, so the payload's leading `withdrawal_cancel` label is the only
 * thing keeping it apart from phone (`{phone}:{exp}`, `{purpose}:{phone}:{exp}`) and email (`email:...`)
 * proofs. The session epoch pins it to the account as it was when the credentials were checked: a password
 * reset, a second cancel or any other epoch bump kills the token.
 */
const LABEL = 'withdrawal_cancel';

export const WITHDRAWAL_CANCEL_TTL_SECONDS = PROOF_TTL_MS / 1000;

function payloadFor(userId: string, sessionEpoch: number): ProofPayloadBuilder {
  return (expMs) => `${LABEL}:${userId}:${sessionEpoch}:${expMs}`;
}

export function issueWithdrawalCancelToken(userId: string, sessionEpoch: number, nowMs: number = Date.now()): string {
  return issueProofToken(payloadFor(userId, sessionEpoch), nowMs);
}

/**
 * The account and epoch a still-valid token vouches for, or null. The claims are read out of the payload
 * first only so the signature can be checked over exactly those values; nothing they say is trusted before
 * `verifyProofToken` has confirmed the signature and the expiry.
 */
export function readWithdrawalCancelToken(
  token: string,
  nowMs: number = Date.now(),
): { userId: string; sessionEpoch: number } | null {
  const [encodedPayload] = token.split('.');
  if (!encodedPayload) return null;
  const [label, userId, epoch, exp, ...rest] = Buffer.from(encodedPayload, 'base64url').toString('utf8').split(':');
  if (label !== LABEL || !userId || exp === undefined || rest.length > 0 || !/^\d+$/.test(epoch ?? '')) return null;
  const sessionEpoch = Number(epoch);
  if (!Number.isSafeInteger(sessionEpoch)) return null;
  return verifyProofToken(token, payloadFor(userId, sessionEpoch), nowMs) ? { userId, sessionEpoch } : null;
}

/**
 * The refusal every sign-in path gives a withdrawal-pending account. Only a caller that has verified the
 * account's own credentials passes `proven`; it then also gets the token that lets it cancel the withdrawal.
 * A caller that merely matched the account by email or phone gets the plain refusal and learns nothing more.
 */
export function withdrawalPendingException(proven?: { id: string; sessionEpoch: number }): ForbiddenException {
  if (!proven) {
    return new ForbiddenException({
      code: 'ACCOUNT_WITHDRAWAL_PENDING',
      message: '탈퇴 신청 중인 계정이에요. 문의는 고객센터로 연락해 주세요.',
    });
  }
  return new ForbiddenException({
    code: 'ACCOUNT_WITHDRAWAL_PENDING',
    message: '탈퇴 신청 중인 계정이에요. 탈퇴를 철회하면 다시 이용할 수 있어요.',
    details: {
      withdrawalCancelToken: issueWithdrawalCancelToken(proven.id, proven.sessionEpoch),
      expiresInSeconds: WITHDRAWAL_CANCEL_TTL_SECONDS,
    },
  });
}
