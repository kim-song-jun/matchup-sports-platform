'use client';

import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useV1Logout } from '@/hooks/use-v1-api';
import { clearV1IdentityCache } from '@/lib/query-keys';
import { clearStoredV1Session } from '@/lib/session-storage';
import { disconnectV1Socket } from '@/lib/v1-socket';
import { useConfirm } from '@/components/v1-ui/confirm-modal';

/**
 * 소셜 가입 진행 중(약관·프로필 입력) 화면에서 빠져나가는 유일한 경로.
 *
 * 이 단계의 계정은 카카오 신원만 있고 프로필이 비어 있어, PendingSocialSignupGate 가
 * 앱 전역에서 다른 경로를 전부 되돌린다(그래서 브라우저 뒤로가기·홈이 먹히지 않는다).
 * 게이트를 푸는 대신 "가입을 그만두고 로그아웃"이라는 명시적 출구를 준다 —
 * 서버도 pending 상태에서 /auth/logout 만은 허용하도록 열어 둔 설계다.
 */
export function useSocialSignupExit() {
  const queryClient = useQueryClient();
  const logout = useV1Logout();
  const { confirm, ConfirmModal } = useConfirm();
  const [error, setError] = useState<string | null>(null);

  const exit = useCallback(async () => {
    const confirmed = await confirm({
      title: '가입을 그만둘까요?',
      message: '지금까지 입력한 내용은 저장되지 않아요. 다시 카카오로 로그인하면 이어서 진행할 수 있어요.',
      confirmLabel: '그만두기',
      cancelLabel: '계속 쓰기',
      tone: 'danger',
    });
    if (!confirmed) return;

    setError(null);
    try {
      await logout.mutateAsync();
    } catch {
      // 로그아웃이 실패하면 서버 세션이 남아 로그인 화면으로 가도 게이트가 다시 이 화면으로
      // 끌어온다. 조용히 넘어가면 "눌러도 아무 일도 없는" 원래 증상으로 되돌아가므로 알린다.
      setError('가입 취소를 완료하지 못했어요. 잠시 후 다시 시도해 주세요.');
      return;
    }

    clearStoredV1Session();
    clearV1IdentityCache(queryClient);
    disconnectV1Socket();
    // router.replace 는 prefetch 된 /login 인스턴스를 재사용해 로그아웃 이전 스냅샷에
    // 멈출 수 있다(session-entry-gate 와 동일한 이유로 하드 내비게이션을 쓴다).
    window.location.replace('/login');
  }, [confirm, logout, queryClient]);

  return { exit, ConfirmModal, error, pending: logout.isPending };
}
