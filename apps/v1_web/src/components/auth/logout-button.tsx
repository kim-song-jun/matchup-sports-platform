'use client';

import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useV1Logout } from '@/hooks/use-v1-api';
import { clearStoredV1Session } from '@/lib/session-storage';
import { v1Keys } from '@/lib/query-keys';

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

  const className =
    variant === 'ghost'
      ? 'tm-btn tm-btn-md tm-btn-ghost tm-logout-ghost'
      : 'tm-btn tm-btn-lg tm-btn-neutral tm-btn-block';

  return (
    <button
      className={className}
      disabled={logout.isPending}
      onClick={() => logout.mutate(undefined, { onSettled: clearAndRedirect })}
      type="button"
    >
      {logout.isPending ? '로그아웃 중' : '로그아웃'}
    </button>
  );
}
