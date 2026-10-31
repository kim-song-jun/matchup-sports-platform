import type { QueryClient } from '@tanstack/react-query';
import { trackEvent } from '@/lib/analytics';
import { clearLoginStepUp } from '@/lib/login-step-up';
import { clearV1IdentityCache } from '@/lib/query-keys';
import { resolveAuthContinuationPath, saveStoredV1Session } from '@/lib/session-storage';
import type { V1AuthSessionResponse } from '@/types/api';

/**
 * 로그인 수단과 무관한 "세션을 받은 뒤" 공통 처리: 세션 힌트 저장, 이전 식별 캐시 비우기, 로그인 이벤트 기록.
 * 이동은 호출부 몫이라 갈 경로를 돌려준다 — 두 벌이면 한쪽만 세션 힌트·캐시 정리·복귀 경로 규칙이 어긋난다.
 *
 * @param requestedRedirect 화면이 받은 복귀 경로 원본. resolveAuthContinuationPath 가 거른다.
 * @param method 로그인 이벤트의 `method` 값.
 */
export function completeSignIn({ result, queryClient, requestedRedirect, method }: {
  result: V1AuthSessionResponse;
  queryClient: QueryClient;
  requestedRedirect: string | null;
  method: string;
}): string {
  saveStoredV1Session(result.session);
  clearV1IdentityCache(queryClient);
  trackEvent('login', { method });
  return resolveAuthContinuationPath(result.next?.route, requestedRedirect);
}

/**
 * 이메일 로그인이 세션을 받은 뒤의 처리. 비밀번호만으로 통과한 로그인과 추가 인증(step-up)을 마친 로그인이
 * 같은 길을 가도록 한 곳에 둔다.
 */
export function completeEmailLogin({ result, queryClient, replace, requestedRedirect }: {
  result: V1AuthSessionResponse;
  queryClient: QueryClient;
  replace: (path: string) => void;
  requestedRedirect: string | null;
}) {
  clearLoginStepUp();
  replace(completeSignIn({ result, queryClient, requestedRedirect, method: 'email' }));
}
