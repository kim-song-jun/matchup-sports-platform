import { issueProofToken, verifyProofToken, type ProofPayloadBuilder } from './proof-token';

/**
 * 휴대폰 소유 증명 토큰의 용도.
 *
 * 용도를 페이로드에 묶지 않으면 "가입하려고 받은 증명"이 "비밀번호를 재설정하는 증명"으로
 * 그대로 통한다. 두 흐름의 보증 수준이 앞으로 갈릴 수 있으므로 토큰 단계에서 갈라 둔다.
 *
 * signup 은 기존 형식(`{phone}:{exp}`)을 그대로 쓴다 — 형식을 바꾸면 배포 순간 진행 중이던
 * 가입(TTL 10분)이 전부 깨진다. 새 용도만 `{purpose}:{phone}:{exp}` 로 발급한다.
 *
 * 이메일 증명(email-proof-token)은 페이로드 맨 앞에 'email' 채널 라벨을 달아, 같은 시크릿으로
 * 서명되더라도 이 검증을 통과할 수 없게 갈라 둔다.
 *
 * 서명·만료·상수시간 비교는 proof-token 에 모여 있다.
 */
export type PhoneProofPurpose = 'signup' | 'password_reset';

function payloadFor(phone: string, purpose: PhoneProofPurpose): ProofPayloadBuilder {
  return (expMs) => (purpose === 'signup' ? `${phone}:${expMs}` : `${purpose}:${phone}:${expMs}`);
}

export function issuePhoneProofToken(
  phone: string,
  purpose: PhoneProofPurpose = 'signup',
  nowMs: number = Date.now(),
): string {
  return issueProofToken(payloadFor(phone, purpose), nowMs);
}

export function verifyPhoneProofToken(
  token: string,
  phone: string,
  purpose: PhoneProofPurpose = 'signup',
  nowMs: number = Date.now(),
): boolean {
  return verifyProofToken(token, payloadFor(phone, purpose), nowMs);
}
