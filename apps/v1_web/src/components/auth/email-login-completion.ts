import type { QueryClient } from '@tanstack/react-query';
import { trackEvent } from '@/lib/analytics';
import { clearLoginStepUp } from '@/lib/login-step-up';
import { clearV1IdentityCache } from '@/lib/query-keys';
import { resolveAuthContinuationPath, saveStoredV1Session } from '@/lib/session-storage';
import type { V1AuthSessionResponse } from '@/types/api';

/**
 * 이메일 로그인이 세션을 받은 뒤의 공통 처리. 비밀번호만으로 통과한 로그인과
 * 추가 인증(step-up)을 마친 로그인이 같은 길을 가도록 한 곳에 둔다 — 두 벌이면 한쪽만
 * 세션 힌트·캐시 정리·복귀 경로 규칙이 어긋난다.
 *
 * @param requestedRedirect 로그인 화면이 받은 `?redirect=` 원본. resolveAuthContinuationPath 가 거른다.
 */
export function completeEmailLogin({ result, queryClient, replace, requestedRedirect }: {
  result: V1AuthSessionResponse;
  queryClient: QueryClient;
  replace: (path: string) => void;
  requestedRedirect: string | null;
}) {
  clearLoginStepUp();
  saveStoredV1Session(result.session);
  clearV1IdentityCache(queryClient);
  trackEvent('login', { method: 'email' });
  replace(resolveAuthContinuationPath(result.next?.route, requestedRedirect));
}
