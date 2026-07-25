import { createHmac, timingSafeEqual } from 'crypto';

/**
 * 본인 확인을 마쳤다는 증명 토큰의 공통 구현.
 *
 * 채널별 파일(phone-proof-token / email-proof-token)은 "무엇을 서명할지"(페이로드)만 정하고,
 * 서명·만료·상수시간 비교는 전부 여기에 모은다 — 채널이 늘어날 때마다 검증 로직을 복사하면
 * 한쪽만 고쳐지는 순간 그 채널이 조용히 약한 고리가 된다.
 *
 * 채널·용도를 구분하는 책임은 페이로드에 있다. 모든 채널이 같은 시크릿으로 서명하므로,
 * 페이로드가 겹치면 한쪽에서 받은 증명이 다른 쪽 검증을 그대로 통과한다.
 */

/** 증명 토큰 수명. 인증을 마친 뒤 새 비밀번호를 정하기까지의 여유. */
export const PROOF_TTL_MS = 10 * 60 * 1000;

/** 만료 시각(ms)을 받아 서명 대상 문자열을 만드는 함수. 발급/검증이 같은 것을 쓴다. */
export type ProofPayloadBuilder = (expMs: number) => string;

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
 * 위조해 본인 확인을 통째로 우회할 수 있다(가입·프로필 번호 변경·대회 신청·비밀번호 재설정이
 * 모두 이 증명에 걸려 있다). 설정 누락을 조용한 무방비 상태로 두지 않도록 발급은 예외로 즉시
 * 드러내고, 검증은 무조건 거부한다.
 */
function assertProofSecret(): string {
  const secret = proofSecret();
  if (!secret) {
    throw new Error(
      'Proof token secret is not configured (V1_SESSION_SECRET / V1_JWT_SECRET / JWT_SECRET)',
    );
  }
  return secret;
}

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

export function issueProofToken(buildPayload: ProofPayloadBuilder, nowMs: number): string {
  const secret = assertProofSecret();
  const payload = buildPayload(nowMs + PROOF_TTL_MS);
  return `${Buffer.from(payload).toString('base64url')}.${sign(payload, secret)}`;
}

export function verifyProofToken(
  token: string,
  buildPayload: ProofPayloadBuilder,
  nowMs: number,
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

  // 만료 시각은 페이로드 맨 뒤에 있다는 규약(모든 채널 공통).
  const exp = Number(payload.split(':').at(-1));
  if (!Number.isFinite(exp) || exp < nowMs) return false;
  // 필드를 하나씩 꺼내 비교하는 대신 기대 페이로드를 통째로 다시 만들어 대조한다 —
  // 필드별 비교는 채널·용도 검사를 빠뜨리기 쉽고, 빠진 순간 다른 증명이 통과한다.
  if (payload !== buildPayload(exp)) return false;

  const expected = Buffer.from(sign(payload, secret));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}
