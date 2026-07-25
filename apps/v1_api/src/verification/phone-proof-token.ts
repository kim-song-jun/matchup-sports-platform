import { createHmac, timingSafeEqual } from 'crypto';

const PROOF_TTL_MS = 10 * 60 * 1000;

/**
 * 휴대폰 소유 증명 토큰의 용도.
 *
 * 용도를 페이로드에 묶지 않으면 "가입하려고 받은 증명"이 "비밀번호를 재설정하는 증명"으로
 * 그대로 통한다. 두 흐름의 보증 수준이 앞으로 갈릴 수 있으므로 토큰 단계에서 갈라 둔다.
 *
 * signup 은 기존 형식(`{phone}:{exp}`)을 그대로 쓴다 — 형식을 바꾸면 배포 순간 진행 중이던
 * 가입(TTL 10분)이 전부 깨진다. 새 용도만 `{purpose}:{phone}:{exp}` 로 발급한다.
 */
export type PhoneProofPurpose = 'signup' | 'password_reset';

function proofSecret(): string {
  return (
    process.env.V1_SESSION_SECRET ??
    process.env.V1_JWT_SECRET ??
    process.env.JWT_SECRET ??
    ''
  ).trim();
}

/**
 * 시크릿이 비어 있으면 HMAC 키가 ''(빈 문자열)이라 서명이 공개 상수가 된다 — 누구나 토큰을
 * 위조해 휴대폰 인증을 통째로 우회할 수 있다(가입·프로필 번호 변경·대회 신청까지 이 증명에 걸려 있다).
 * 설정 누락을 조용한 무방비 상태로 두지 않도록 발급은 예외로 즉시 드러내고, 검증은 무조건 거부한다.
 */
function assertProofSecret(): string {
  const secret = proofSecret();
  if (!secret) {
    throw new Error(
      'Phone proof token secret is not configured (V1_SESSION_SECRET / V1_JWT_SECRET / JWT_SECRET)',
    );
  }
  return secret;
}

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

function buildPayload(phone: string, purpose: PhoneProofPurpose, expMs: number): string {
  return purpose === 'signup' ? `${phone}:${expMs}` : `${purpose}:${phone}:${expMs}`;
}

export function issuePhoneProofToken(
  phone: string,
  purpose: PhoneProofPurpose = 'signup',
  nowMs: number = Date.now(),
): string {
  const secret = assertProofSecret();
  const payload = buildPayload(phone, purpose, nowMs + PROOF_TTL_MS);
  return `${Buffer.from(payload).toString('base64url')}.${sign(payload, secret)}`;
}

export function verifyPhoneProofToken(
  token: string,
  phone: string,
  purpose: PhoneProofPurpose = 'signup',
  nowMs: number = Date.now(),
): boolean {
  // 시크릿 없이 검증하면 공개 상수 키로 서명을 대조하게 되어 위조 토큰이 통과한다 — 무조건 거부.
  const secret = proofSecret();
  if (!secret) return false;

  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [payloadB64, signature] = parts;
  let payload: string;
  try {
    payload = Buffer.from(payloadB64, 'base64url').toString('utf8');
  } catch {
    return false;
  }

  const expStr = payload.split(':').at(-1);
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < nowMs) return false;
  // 필드를 하나씩 꺼내 비교하는 대신 기대 페이로드를 통째로 다시 만들어 대조한다 —
  // 필드별 비교는 용도 검사를 빠뜨리기 쉽고, 빠진 순간 다른 용도의 토큰이 통과한다.
  if (payload !== buildPayload(phone, purpose, exp)) return false;

  const expected = Buffer.from(sign(payload, secret));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}
