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
 * Lane 1 (관중 라이브 스코어) -- how a spectator page finds out the score
 * changed without a manual refresh. Deliberately plain polling, not the
 * operations console's authenticated realtime socket/takeover channel
 * (`apps/v1_api/src/realtime/realtime.gateway.ts`): that channel is scoped to
 * one authorized operator per game, and standing up a new public broadcast
 * channel for a potentially-hundreds-of-viewers, unauthenticated audience is
 * out of this lane's scope (rationale spelled out in
 * `docs/api/domains/public-records.md`'s "Lane 1 addition" section). Only
 * polls while the currently-loaded page actually contains a `status ===
 * 'live'` fixture/match, so an idle spectator on a fully-scheduled or
 * fully-completed tournament page never polls at all.
 *
 * Load model, stated accurately: `react-query`'s cache is per-browser, so it
 * does NOT dedupe requests across spectators. Server load is roughly
 * (spectators watching a live page) x (1 / interval) -- it DOES scale with
 * viewers. What this design buys is bounding *when* that cost is paid: no
 * polling at all unless the loaded page actually holds a live fixture, and
 * an 8s floor per viewer. If viewer counts grow past what that supports, the
 * next step is a shared cache (CDN/edge or server-side) or a real public
 * broadcast channel -- not a shorter interval.
 */
const LIVE_POLL_INTERVAL_MS = 8_000;

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
    refetchInterval: (query) => {
      const hasLive = query.state.data?.pages.some((page) => page.items.some((item) => item.status === 'live'));
      return hasLive === true ? LIVE_POLL_INTERVAL_MS : false;
    },
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
    refetchInterval: (query) => (query.state.data?.status === 'live' ? LIVE_POLL_INTERVAL_MS : false),
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
