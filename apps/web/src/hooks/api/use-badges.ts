'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Badge } from '@/types/api';
import { extractData } from './shared';
import { queryKeys } from './query-keys';

// ── Badges ──
export function useTeamBadges(teamId: string) {
  return useQuery<Badge[]>({
    queryKey: queryKeys.badges.team(teamId),
    queryFn: async () => {
      const res = await api.get(`/badges/team/${teamId}`);
      return extractData<Badge[]>(res);
    },
    enabled: !!teamId,
  });
}

export function useAllBadgeTypes() {
  return useQuery<Badge[]>({
    queryKey: queryKeys.badges.all,
    queryFn: async () => {
      const res = await api.get('/badges');
      return extractData<Badge[]>(res);
    },
  });
}
