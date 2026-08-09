'use client';

import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { v1Get } from '@/lib/api-client';
import type {
  PublicMatchDetail,
  PublicTeamRecordsResponse,
  PublicTournamentScheduleResponse,
  PublicUserRecordsResponse,
} from './types';

/**
 * Task 24 -- query keys for the public-records lane. Kept local to this
 * component directory (not `@/lib/query-keys.ts`, which is not a declared
 * Task 24 output) since these are unauthenticated, identity-independent
 * reads that never need the global cache-clear-on-login sweep.
 */
export const publicGameRecordsKeys = {
  all: ['v1', 'public-game-records'] as const,
  schedule: (tournamentId: string, filters: { round?: string; groupId?: string }) =>
    [...publicGameRecordsKeys.all, 'schedule', tournamentId, filters] as const,
  match: (tournamentId: string, fixtureId: string) =>
    [...publicGameRecordsKeys.all, 'match', tournamentId, fixtureId] as const,
  teamRecords: (teamId: string, season: string | undefined) =>
    [...publicGameRecordsKeys.all, 'team-records', teamId, season ?? null] as const,
  userRecords: (userId: string, season: string | undefined) =>
    [...publicGameRecordsKeys.all, 'user-records', userId, season ?? null] as const,
};

export interface ScheduleFilters {
  readonly round?: string;
  readonly groupId?: string;
}

/**
 * `GET /tournaments/:id/schedule` -- cursor-paginated fixture list.
 * `tournamentTitle`/`bracketPublished`/`unscheduled`/`standings` are
 * identical on every page (the server always returns them in full), so
 * callers should read those off `data.pages[0]` and flatten only `items`
 * across pages.
 */
export function usePublicTournamentSchedule(tournamentId: string, filters: ScheduleFilters = {}) {
  return useInfiniteQuery({
    queryKey: publicGameRecordsKeys.schedule(tournamentId, filters),
    queryFn: ({ pageParam }: { pageParam: string | null }) =>
      v1Get<PublicTournamentScheduleResponse>(`/tournaments/${tournamentId}/schedule`, {
        ...filters,
        ...(pageParam ? { cursor: pageParam } : {}),
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: Boolean(tournamentId),
    retry: false,
  });
}

/**
 * `GET /tournaments/:id/matches/:fixtureId` -- single match projection.
 * A `hidden` fixture, an unpublished bracket, and a genuinely missing
 * fixture/tournament all surface as the same 404 here (`react-query`
 * `isError`); the caller must not attempt to distinguish them.
 */
export function usePublicMatch(tournamentId: string, fixtureId: string) {
  return useQuery({
    queryKey: publicGameRecordsKeys.match(tournamentId, fixtureId),
    queryFn: () => v1Get<PublicMatchDetail>(`/tournaments/${tournamentId}/matches/${fixtureId}`),
    enabled: Boolean(tournamentId) && Boolean(fixtureId),
    retry: false,
  });
}

/** `GET /teams/:id/records` -- cursor-paginated team result history + summary. */
export function usePublicTeamRecords(teamId: string, season?: string) {
  return useInfiniteQuery({
    queryKey: publicGameRecordsKeys.teamRecords(teamId, season),
    queryFn: ({ pageParam }: { pageParam: string | null }) =>
      v1Get<PublicTeamRecordsResponse>(`/teams/${teamId}/records`, {
        ...(season ? { season } : {}),
        ...(pageParam ? { cursor: pageParam } : {}),
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: Boolean(teamId),
    retry: false,
  });
}

/** `GET /users/:id/records` -- cursor-paginated consent-gated career record + summary. */
export function usePublicUserRecords(userId: string, season?: string) {
  return useInfiniteQuery({
    queryKey: publicGameRecordsKeys.userRecords(userId, season),
    queryFn: ({ pageParam }: { pageParam: string | null }) =>
      v1Get<PublicUserRecordsResponse>(`/users/${userId}/records`, {
        ...(season ? { season } : {}),
        ...(pageParam ? { cursor: pageParam } : {}),
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: Boolean(userId),
    retry: false,
  });
}
