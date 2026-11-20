'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { v1Get, v1Post } from '@/lib/api-client';
import { clearV1IdentityCache } from '@/lib/query-keys';
import { disconnectV1Socket } from '@/lib/v1-socket';

export type MemberAccessStatus = { active: false } | {
  active: true; unavailable?: boolean; message?: string; userId?: string; label?: string; expiresAt?: string;
};
export const MEMBER_ACCESS_HINT = 'teameet.member-access';
export function hasMemberAccessHint() {
  try { return typeof window !== 'undefined' && window.localStorage.getItem(MEMBER_ACCESS_HINT) === 'active'; }
  catch { console.warn('회원 조회 표시를 저장소에서 읽지 못했어요.'); return false; } // The server always enforces the signed cookie even without a UI hint.
}

export function useMemberAccessStatus() {
  return useQuery({ queryKey: ['v1', 'admin', 'member-access'],
    queryFn: () => v1Get<MemberAccessStatus>('/admin/member-access'), retry: false, staleTime: 0,
    refetchInterval: (query) => query.state.data?.active ? 15_000 : false,
    refetchOnWindowFocus: true });
}

export function useMemberAccessTransition(userId?: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: { reason: string } | { stop: true }) => {
      if ('stop' in input) return v1Post<{ returnPath: string }>('/admin/member-access/stop', {});
      if (!userId) throw new Error('회원을 선택해 주세요.');
      await v1Post(`/admin/users/${encodeURIComponent(userId)}/member-access`, input);
      return { returnPath: '/home' };
    },
    onSuccess: async (result, input) => {
      await client.cancelQueries();
      disconnectV1Socket();
      clearV1IdentityCache(client);
      try {
        if ('stop' in input) window.localStorage.removeItem(MEMBER_ACCESS_HINT);
        else window.localStorage.setItem(MEMBER_ACCESS_HINT, 'active');
      } catch { console.warn('회원 조회 표시를 저장하지 못했어요. 서버 세션으로 확인해요.'); }
      window.location.assign(result.returnPath);
    },
  });
}
