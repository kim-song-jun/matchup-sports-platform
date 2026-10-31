'use client';

import { useCallback, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useV1Logout } from '@/hooks/use-v1-api';
import { useV1PushRegistration } from '@/hooks/use-v1-push-registration';
import { reportClientError } from '@/lib/client-error-reporter';
import { extractErrorMessage } from '@/lib/error-message';
import { clearV1IdentityCache } from '@/lib/query-keys';
import { clearStoredV1Session } from '@/lib/session-storage';
import { disconnectV1Socket } from '@/lib/v1-socket';

type SignOutOptions = {
  /** 로그아웃이 실패했을 때 화면에 보일 문구 — 호출부마다 다르다. */
  failureMessage: string;
  /**
   * 푸시 등록이 있을 수 없는 계정(가입 진행 중)은 건너뛴다. 그 계정은 푸시 등록 API 가 서버 가드에
   * 막혀 서버에 등록이 없고, 해지 요청도 같은 가드에 막혀 실패만 보고하게 된다.
   */
  revokePush?: boolean;
};

/**
 * 로그아웃하고 하드 내비게이션으로 나가는 유일한 경로. 순서가 계약이다.
 * 1) 아직 인증된 동안 이 기기의 푸시 등록을 해지한다(네이티브 기기 해지는 세션이 있어야 서버에 닿는다).
 * 2) 로그아웃 — 실패하면 서버 세션이 남아 있으므로 이동하지 않고 오류를 남긴다.
 * 3) 세션·식별 캐시·소켓을 정리하고 `path` 로 이동한다. router.replace 는 prefetch 된 페이지의
 *    로그아웃 이전 스냅샷에 멈출 수 있어 `window.location.replace` 를 쓴다.
 */
export function useSignOutAndLeave() {
  const queryClient = useQueryClient();
  const { mutateAsync: logoutAsync } = useV1Logout();
  const { unsubscribe: unsubscribePush } = useV1PushRegistration();
  // state 는 다음 렌더에야 반영돼 같은 틱의 연타를 못 막는다.
  const busyRef = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signOutAndLeave = useCallback(async (path: string, { failureMessage, revokePush = true }: SignOutOptions) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setPending(true);
    setError(null);

    if (revokePush) {
      try {
        await unsubscribePush({ reason: 'sign-out' });
      } catch (err) {
        // 기기 알림 해지가 막혀도 로그아웃 자체는 진행한다.
        reportClientError({
          message: extractErrorMessage(err, '로그아웃 전 기기 알림 구독을 해제하지 못했어요.'),
          level: 'warn',
          context: { flow: 'sign-out-push-unsubscribe' },
        });
      }
    }

    try {
      await logoutAsync();
    } catch {
      // 요청 실패는 api-client 가 이미 보고한다.
      setError(failureMessage);
      busyRef.current = false;
      setPending(false);
      return;
    }

    clearStoredV1Session();
    clearV1IdentityCache(queryClient);
    disconnectV1Socket();
    window.location.replace(path);
  }, [logoutAsync, queryClient, unsubscribePush]);

  return { signOutAndLeave, pending, error };
}
