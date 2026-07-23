'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useV1Logout } from '@/hooks/use-v1-api';
import { trackEvent } from '@/lib/analytics';
import { clearStoredV1Session } from '@/lib/session-storage';
import { disconnectV1Socket } from '@/lib/v1-socket';
import { v1Keys } from '@/lib/query-keys';
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

  const clearAndRedirect = () => {
    clearStoredV1Session();
    disconnectV1Socket();
    queryClient.removeQueries({ queryKey: v1Keys.all });
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
        logout.mutate(undefined, { onSettled: clearAndRedirect });
      }}
      size={isGhost ? 'md' : 'lg'}
      type="button"
      variant={isGhost ? 'ghost' : 'neutral'}
    >
      로그아웃
    </Button>
  );
}
