'use client';

import { useCallback, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useV1Logout } from '@/hooks/use-v1-api';
import { useV1PushRegistration } from '@/hooks/use-v1-push-registration';
import { reportClientError } from '@/lib/client-error-reporter';
import { clearAuthHandoffStorage } from '@/lib/auth-handoff-storage';
import { clearV1IdentityCache } from '@/lib/query-keys';
import { clearStoredV1Session } from '@/lib/session-storage';
import { disconnectV1Socket } from '@/lib/v1-socket';

/** 앱 셸이 응답하지 않을 때(native-push 의 응답 상한은 15초) 로그아웃이 그만큼 늦어지지 않게 하는 상한. */
export const PUSH_REVOKE_TIMEOUT_MS = 3000;

type SignOutHookOptions = {
  /**
   * false 면 기기 푸시 등록 해지를 건너뛰고 푸시 훅도 켜지 않는다. 푸시 등록 API 가 서버 가드에 막히는
   * 계정(가입 대기 상태)은 서버에 등록이 없고 해지 요청도 막혀 실패만 보고하게 된다.
   */
  revokePush?: boolean;
};

type SignOutOptions = {
  /** 로그아웃이 실패했을 때 화면에 보일 문구 — 호출부마다 다르다. */
  failureMessage: string;
  /** 실제로 로그아웃을 시작할 때 한 번 불린다(연타로 막힌 호출에는 불리지 않는다). */
  onStart?: () => void;
  /**
   * 로그아웃이 끝나고 세션·저장 칸 정리까지 마친 직후, 이동 직전에 부른다. 로그아웃 정리가 지우는 칸
   * (대기 연결 토큰 등)에 이동 뒤 화면이 읽을 값을 남기려면 정리보다 늦게 써야 해서 여기서 쓴다.
   */
  onSignedOut?: () => void;
};

/**
 * 로그아웃하고 하드 내비게이션으로 나가는 유일한 경로. 순서가 계약이다.
 * 1) 아직 인증된 동안 이 기기의 푸시 등록을 해지한다(네이티브 기기 해지는 세션이 있어야 서버에 닿는다).
 *    해지는 비치명이다 — 상한을 넘기면 보고만 하고 로그아웃을 진행한다.
 * 2) 로그아웃 — 실패하면 서버 세션이 남아 있으므로 이동하지 않고 오류를 남긴다.
 * 3) 세션·식별 캐시·소켓을 정리하고 `path` 로 이동한다. router.replace 는 prefetch 된 페이지의
 *    로그아웃 이전 스냅샷에 멈출 수 있어 `window.location.replace` 를 쓴다.
 */
export function useSignOutAndLeave({ revokePush = true }: SignOutHookOptions = {}) {
  const queryClient = useQueryClient();
  const { mutateAsync: logoutAsync } = useV1Logout();
  const { unsubscribe: unsubscribePush } = useV1PushRegistration({ enabled: revokePush });
  // state 는 다음 렌더에야 반영돼 같은 틱의 연타를 못 막는다.
  const busyRef = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // unsubscribe 는 실패해도 던지지 않고 false 를 돌려주며, 실패는 그 훅이 이미 보고한다. 여기서는 응답 지연만 다룬다.
  const revokePushWithinLimit = useCallback(async () => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const limit = new Promise<'timeout'>((resolve) => {
      timer = setTimeout(() => resolve('timeout'), PUSH_REVOKE_TIMEOUT_MS);
    });
    const outcome = await Promise.race([unsubscribePush({ reason: 'sign-out' }), limit]);
    clearTimeout(timer);
    if (outcome === 'timeout') {
      reportClientError({
        message: '로그아웃 전 기기 알림 구독 해제가 시간 안에 끝나지 않았어요.',
        level: 'warn',
        context: { flow: 'sign-out-push-unsubscribe-timeout' },
      });
    }
  }, [unsubscribePush]);

  const signOutAndLeave = useCallback(async (path: string, { failureMessage, onStart, onSignedOut }: SignOutOptions) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setPending(true);
    setError(null);
    onStart?.();

    if (revokePush) await revokePushWithinLimit();

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
    clearAuthHandoffStorage();
    clearV1IdentityCache(queryClient);
    disconnectV1Socket();
    onSignedOut?.();
    window.location.replace(path);
  }, [logoutAsync, queryClient, revokePush, revokePushWithinLimit]);

  return { signOutAndLeave, pending, error };
}
