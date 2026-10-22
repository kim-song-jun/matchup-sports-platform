'use client';

import { useQuery } from '@tanstack/react-query';
import { v1Get } from '@/lib/api-client';
import { v1Keys } from '@/lib/query-keys';
import type { CompetitionDiscoveryFilters, CompetitionDiscoveryPage } from '@/lib/competition-discovery';
import type { TournamentListSeed } from '@/lib/public-list-seed';

/** 상위 필터 key가 바뀌면 재마운트하므로 이전 조건은 버리고 같은 조건의 페이지 이동만 유지한다. */
export function useCompetitionDiscovery(
  params: CompetitionDiscoveryFilters & { page?: number; cursor?: string; limit: number },
  seed?: TournamentListSeed['page'],
) {
  return useQuery({
    queryKey: v1Keys.tournaments({ ...params, sort: params.sort ?? 'latest', withTotal: 'true' }),
    queryFn: () => v1Get<CompetitionDiscoveryPage>('/tournaments', { ...params, sort: params.sort ?? 'latest', withTotal: 'true' }),
    placeholderData: (previous) => previous ?? seed,
    // 시각 기반 마감·정원 정보를 다시 확인한다. 창 복귀 시에도 기본 refetch가 동작한다.
    refetchInterval: 30_000,
  });
}
