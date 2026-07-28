'use client';

import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useV1Logout } from '@/hooks/use-v1-api';
import { clearStoredV1Session } from '@/lib/session-storage';
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
  const router = useRouter();
  const queryClient = useQueryClient();
  const logout = useV1Logout();

  const clearAndRedirect = () => {
    clearStoredV1Session();
    queryClient.removeQueries({ queryKey: v1Keys.all });
    router.replace('/login');
  };

  const isGhost = variant === 'ghost';

  return (
    <Button
      block={!isGhost}
      className={isGhost ? 'tm-logout-ghost' : undefined}
      loading={logout.isPending}
      onClick={() => {
        // 로딩 중 재클릭 시 중복 제출 방지 — disabled 속성은 리렌더 이후에나 반영되므로
        // 핸들러 최상단에서 동기적으로 한 번 더 막는다.
        if (logout.isPending) return;
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
