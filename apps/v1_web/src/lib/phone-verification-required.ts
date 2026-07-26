/**
 * 서버가 "휴대폰 본인인증을 먼저 끝내라"고 거절했을 때(403 PHONE_VERIFICATION_REQUIRED)
 * 전역 안내 모달을 띄우기 위한 최소 pub/sub.
 *
 * 화면마다 이 코드를 따로 처리하면 신청·생성·전송 중 어딘가는 반드시 빠지고, 사용자는
 * 이유 없는 실패 토스트만 보게 된다. 그래서 API 응답을 만드는 단 한 곳(v1Api)에서 신호를
 * 쏘고, 전역에 하나 떠 있는 모달이 그걸 받는다.
 *
 * React·api-client 어느 쪽에도 의존하지 않는 leaf 모듈이어야 순환 import 가 생기지 않는다.
 */
export const PHONE_VERIFICATION_REQUIRED_CODE = 'PHONE_VERIFICATION_REQUIRED';

type Listener = () => void;

const listeners = new Set<Listener>();

export function subscribePhoneVerificationRequired(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function notifyPhoneVerificationRequired(): void {
  listeners.forEach((listener) => listener());
}
