'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useV1Logout } from '@/hooks/use-v1-api';
import { useV1PushRegistration } from '@/hooks/use-v1-push-registration';
import { trackEvent } from '@/lib/analytics';
import { clearStoredV1Session } from '@/lib/session-storage';
import { disconnectV1Socket } from '@/lib/v1-socket';
import { clearV1IdentityCache } from '@/lib/query-keys';
import { Button } from '@/components/v1-ui/button';

type LogoutButtonProps = {
  /**
   * 'default' — 기존 full-width neutral 버튼 (계정 설정 페이지 등에서 사용)
   * 'ghost'   — 텍스트 링크 수준 ghost 버튼 (마이홈 하단 — 파괴 액션이 최강 CTA가 되지 않도록)
   */
  variant?: 'default' | 'ghost';
};

export function LogoutButton({ variant = 'default' }: LogoutButtonProps) {
  const queryClient = useQueryClient();
  const logout = useV1Logout();
  const pushRegistration = useV1PushRegistration();

  const clearAndRedirect = () => {
    clearStoredV1Session();
    disconnectV1Socket();
    clearV1IdentityCache(queryClient);
    // router.replace()는 로그인 상태에서 prefetch된 /login 인스턴스를 재사용해
    // 로그아웃 이전 시점의 세션 스냅샷이 남아있는 채로 멈출 수 있다.
    // 하드 네비게이션으로 QueryClient·컴포넌트 트리를 완전히 새로 만든다.
    window.location.replace('/login');
  };

  const isGhost = variant === 'ghost';

  return (
    <Button
      block={!isGhost}
      className={isGhost ? 'tm-logout-ghost' : undefined}
      loading={logout.isPending}
      onClick={() => {
        // 로딩 중 재클릭 시 중복 제출 방지 — isPending 은 disabled 속성과 동일하게 리렌더
        // 이후에나 반영되는 값이라 동시 클릭까지 막지는 못하지만, 스피너가 보이는 동안의
        // 재클릭은 막는다(동시 클릭 방지가 필요하면 ref 락을 따로 둔다).
        if (logout.isPending) return;
        trackEvent('logout', {});
        // 서버 구독 row는 POST /auth/logout 이 세션 쿠키로 직접 정리하므로 이 호출이
        // 실패해도 서버 상태는 안전하다. 여기서 브라우저 쪽도 함께 끊어야 하는 이유는
        // pushManager.getSubscription() 이 남아있으면 다음에 이 기기에 로그인하는
        // 사용자의 알림 토글이 서버 구독 없이도 '켜짐'으로 잘못 표시되기 때문이다
        // (useV1PushRegistration 의 isSubscribed 는 브라우저 상태만 본다).
        // 로그아웃 API 호출과 병렬로 시작해 리다이렉트 전에 둘 다 정리되게 한다.
        // 훅 자체는 내부에서 모든 에러를 삼키고 항상 resolve 하지만(use-v1-push-registration
        // 참조), 여기서도 .catch 로 한 번 더 막아둔다 — 그렇지 않으면 훅 계약이 나중에 바뀌어
        // reject 하게 될 경우 로그아웃 리다이렉트 자체가 조용히 멈춰버린다.
        const pushCleanup = pushRegistration.unsubscribe().catch(() => undefined);
        logout.mutate(undefined, { onSettled: () => void pushCleanup.finally(clearAndRedirect) });
      }}
      size={isGhost ? 'md' : 'lg'}
      type="button"
      variant={isGhost ? 'ghost' : 'neutral'}
    >
      로그아웃
    </Button>
  );
}
