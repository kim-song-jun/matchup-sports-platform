import { normalizeEmail } from '../auth/normalize-email';
import { issueProofToken, verifyProofToken, type ProofPayloadBuilder } from './proof-token';

/**
 * 이메일 소유 증명 토큰의 용도. 지금은 비밀번호 재설정 하나뿐이지만, 용도를 페이로드에 묶어
 * 두면 나중에 다른 용도가 생겨도 형식을 바꾸지 않고 서로 통하지 않게 갈라 둘 수 있다.
 */
export type EmailProofPurpose = 'password_reset';

/**
 * 이메일 증명은 휴대폰 증명(phone-proof-token)과 **같은 시크릿**으로 서명된다. 페이로드가
 * 겹치면 한 채널에서 받은 증명이 다른 채널 검증을 그대로 통과하므로, 맨 앞에 채널 라벨을
 * 박아 둔다 — 이 라벨이 두 계열을 갈라 놓는 유일한 장치다.
 *
 * 휴대폰 쪽 페이로드는 `{phone}:{exp}` / `{purpose}:{phone}:{exp}` 라서 'email' 로 시작하는
 * 이 형식과는 어느 조합으로도 같아질 수 없다(휴대폰은 숫자 11자리만 통과하고, 용도 토큰도
 * signup / password_reset 뿐이다).
 */
function payloadFor(email: string, purpose: EmailProofPurpose): ProofPayloadBuilder {
  // 표준형으로 접어 서명한다 — 발급 때와 검증 때 표기가 달라도(대문자·앞뒤 공백) 같은 증명이다.
  const normalized = normalizeEmail(email);
  return (expMs) => `email:${purpose}:${normalized}:${expMs}`;
}

export function issueEmailProofToken(
  email: string,
  purpose: EmailProofPurpose = 'password_reset',
  nowMs: number = Date.now(),
): string {
  return issueProofToken(payloadFor(email, purpose), nowMs);
}

export function verifyEmailProofToken(
  token: string,
  email: string,
  purpose: EmailProofPurpose = 'password_reset',
  nowMs: number = Date.now(),
): boolean {
  return verifyProofToken(token, payloadFor(email, purpose), nowMs);
}
