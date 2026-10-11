/**
 * 서버가 "활동 정보를 먼저 입력하라"고 거절했을 때(403 ACTIVITY_PROFILE_REQUIRED) 전역 안내 시트를
 * 띄우기 위한 최소 pub/sub. phone-verification-required 와 같은 구조이며, api-client 에 의존하지
 * 않는 leaf 모듈이어야 순환 import 가 생기지 않는다.
 */
export const ACTIVITY_PROFILE_REQUIRED_CODE = 'ACTIVITY_PROFILE_REQUIRED';

/** 활동 정보 입력 화면. 돌아갈 곳은 redirect 쿼리로 넘긴다. */
export const ACTIVITY_PROFILE_PATH = '/signup/social';

export function buildActivityProfileHref(returnTo: string): string {
  return `${ACTIVITY_PROFILE_PATH}?redirect=${encodeURIComponent(returnTo)}`;
}

/** 입력을 마친 뒤 돌아올 현재 위치. 해시(#section)까지 포함해야 같은 자리로 복귀한다. */
export function currentReturnPath(): string {
  const { pathname, search, hash } = window.location;
  return `${pathname}${search}${hash}`;
}

type Listener = () => void;

const listeners = new Set<Listener>();

export function subscribeActivityProfileRequired(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function notifyActivityProfileRequired(): void {
  listeners.forEach((listener) => listener());
}
