'use client';

import { useQueryClient } from '@tanstack/react-query';
import { v1Keys } from '@/lib/query-keys';

type ShowToast = (message: string, variant?: 'success' | 'error') => void;

/**
 * 결과 확정·정정·무효 훅은 대회 키만 갱신한다. 리그 화면은 같은 성공 신호에서 리그 경기 목록도 갱신해야
 * 카드·패널이 이전 결과로 남지 않는다 — 데스크톱 패널과 모바일 시트가 이 훅 하나를 쓴다.
 */
export function useLeagueResultToast(leagueId: string, showToast: ShowToast): ShowToast {
  const queryClient = useQueryClient();
  return (message, variant = 'success') => {
    showToast(message, variant);
    if (variant === 'success') void queryClient.invalidateQueries({ queryKey: v1Keys.adminLeagueMatch(leagueId) });
  };
}
