'use client';

import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { v1Get } from '@/lib/api-client';
import { PUBLIC_LIVE_POLL_INTERVAL_MS } from '@/lib/public-live-polling';
import type {
  PublicMatchDetail,
  PublicTeamRecordsResponse,
  PublicTournamentScheduleResponse,
  PublicUserRecordsResponse,
  TeamRecordCategory,
  PublicTournamentPlayerRecordsResponse,
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
  teamRecords: (teamId: string, season: string | undefined, type: TeamRecordCategory | null) =>
    [...publicGameRecordsKeys.all, 'team-records', teamId, season ?? null, type] as const,
  userRecords: (userId: string, season: string | undefined) =>
    [...publicGameRecordsKeys.all, 'user-records', userId, season ?? null] as const,
  playerRecords: (tournamentId: string) =>
    [...publicGameRecordsKeys.all, 'player-records', tournamentId] as const,
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
 * 주기 값과 그 근거(왜 10초인지, 관전자 수에 비례하는 부하 모델, 왜 이 값이
 * `useV1Tournament`와 반드시 같아야 하는지)는 `@/lib/public-live-polling`에 단일
 * 소스로 모여 있다 -- `/tournaments/:id/bracket`이 두 훅을 같은 화면에서 동시에
 * 쓰기 때문에 두 곳이 각자 숫자를 갖는 구조 자체가 드리프트 위험이었다.
 */
const LIVE_POLL_INTERVAL_MS = PUBLIC_LIVE_POLL_INTERVAL_MS;

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

/**
 * `GET /league-matches/:leagueId/fixtures/:teamMatchId/record` -- 리그 대진의
 * 경기 기록 프로젝션. 서버가 `usePublicMatch`와 **같은 PublicMatchDetail 필드명**으로
 * 내려준다(tournamentId/tournamentTitle 자리에 리그 id/제목, round 에 'N주차' 라벨,
 * groupName 은 null — `getLeagueFixtureRecord` 주석 참고). 게임이 아직 없거나 숨김
 * 정책인 대진은 404 로 접힌다 -- 소비처(리그 경기 상세)는 그때 자체 요약 카드로
 * 폴백하므로 retry 하지 않는다.
 */
export function usePublicLeagueFixtureRecord(leagueId: string, teamMatchId: string) {
  return useQuery({
    queryKey: [...publicGameRecordsKeys.all, 'league-fixture-record', leagueId, teamMatchId] as const,
    queryFn: () => v1Get<PublicMatchDetail>(`/league-matches/${leagueId}/fixtures/${teamMatchId}/record`),
    enabled: Boolean(leagueId) && Boolean(teamMatchId),
    retry: false,
    refetchInterval: (query) => (query.state.data?.status === 'live' ? LIVE_POLL_INTERVAL_MS : false),
  });
}

/**
 * `GET /teams/:id/records` -- cursor-paginated team result history + summary.
 *
 * `type`(U2, 리그/대회/친선 필터)은 커서 페이지네이션이 걸린 `items` 목록에만
 * 적용된다 -- `summary.byType`는 서버가 항상 전체 기준으로 내려주므로 여기서
 * 다시 필터링하지 않는다. `type`을 쿼리키에 포함해 탭을 바꾸면 캐시가 갈리고
 * (클라이언트 필터가 아니라) 서버로 새로 요청한다.
 */
export function usePublicTeamRecords(teamId: string, season?: string, type?: TeamRecordCategory) {
  return useInfiniteQuery({
    queryKey: publicGameRecordsKeys.teamRecords(teamId, season, type ?? null),
    queryFn: ({ pageParam }: { pageParam: string | null }) =>
      v1Get<PublicTeamRecordsResponse>(`/teams/${teamId}/records`, {
        ...(season ? { season } : {}),
        ...(type ? { type } : {}),
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

/**
 * 회고 STATS-1 — 대회 단위 개인 득점·도움 랭킹(공개, 동의 게이팅은 서버가 판정).
 * 일정 화면은 10초 폴링을 돌지만 이 쿼리는 그 폴링과 무관한 별도 키다 — 랭킹은
 * 공식 확정 때만 바뀌므로 staleTime을 넉넉히 둬 폴링 화면에 편승 재조회하지 않는다.
 */
export function usePublicTournamentPlayerRecords(tournamentId: string) {
  return useQuery({
    queryKey: publicGameRecordsKeys.playerRecords(tournamentId),
    queryFn: () =>
      v1Get<PublicTournamentPlayerRecordsResponse>(`/tournaments/${tournamentId}/player-records`),
    enabled: Boolean(tournamentId),
    staleTime: 60_000,
    retry: false,
  });
}
