'use client';

import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useV1Logout } from '@/hooks/use-v1-api';
import { clearStoredV1Session } from '@/lib/session-storage';
import { v1Keys } from '@/lib/query-keys';

export function LogoutButton() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const logout = useV1Logout();

  const clearAndRedirect = () => {
    clearStoredV1Session();
    queryClient.removeQueries({ queryKey: v1Keys.all });
    router.replace('/login');
  };

  return (
    <button
      className="tm-btn tm-btn-lg tm-btn-neutral tm-btn-block"
      disabled={logout.isPending}
      onClick={() => logout.mutate(undefined, { onSettled: clearAndRedirect })}
      type="button"
    >
      {logout.isPending ? '로그아웃 중' : '로그아웃'}
    </button>
  );
}
