'use client';

import { useInfiniteQuery, useQuery, type Query, type UseQueryResult } from '@tanstack/react-query';
import { V1ApiError, v1Get } from '@/lib/api-client';
import { PUBLIC_LIVE_POLL_INTERVAL_MS, publicLivePollDelay } from '@/lib/public-live-polling';
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
  userRecords: (userId: string, season: string | undefined, type: TeamRecordCategory | null) =>
    [...publicGameRecordsKeys.all, 'user-records', userId, season ?? null, type] as const,
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
 * Schedule polling includes scheduled games and time-unset live games so kickoff is discovered
 * without reloading. Completed tournaments stop polling. Match detail polls while live and, before
 * kickoff, from 15 minutes before the scheduled time (publicLivePollDelay) so an open page finds kickoff.
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
export function usePublicTournamentSchedule(
  tournamentId: string,
  filters: ScheduleFilters = {},
  options: { enabled?: boolean } = {},
) {
  return useInfiniteQuery({
    queryKey: publicGameRecordsKeys.schedule(tournamentId, filters),
    queryFn: ({ pageParam }: { pageParam: string | null }) =>
      v1Get<PublicTournamentScheduleResponse>(`/tournaments/${tournamentId}/schedule`, {
        ...filters,
        ...(pageParam ? { cursor: pageParam } : {}),
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: Boolean(tournamentId) && (options.enabled ?? true),
    retry: false,
    refetchInterval: (query) => {
      const hasPendingGames = query.state.data?.pages.some((page) => [...page.items, ...page.unscheduled]
        .some((item) => item.status === 'live' || item.status === 'scheduled'));
      return hasPendingGames === true ? LIVE_POLL_INTERVAL_MS : false;
    },
  });
}

const RECORD_MAX_RETRIES = 2;

function isNotFound(error: unknown): boolean {
  return error instanceof V1ApiError && error.statusCode === 404;
}

/** 경기 기록 조회 재시도 판정 단일 소스: 404(비공개·숨김)는 재시도하지 않고, 그 외 오류는 최대 2회. */
function shouldRetryPublicRecord(failureCount: number, error: unknown): boolean {
  return !isNotFound(error) && failureCount < RECORD_MAX_RETRIES;
}

/** 404 를 받은 기록은 더 묻지 않는다. 그 외 오류는 캐시된 상태 기준 폴링을 이어 가 성공하면 스스로 복구한다. */
function publicRecordRefetchInterval(query: Query<PublicMatchDetail>): number | false {
  if (isNotFound(query.state.error)) return false;
  return publicLivePollDelay(query.state.data?.status, query.state.data?.scheduledAt);
}

/**
 * React Query 는 재조회가 실패해도 이전 data 를 남긴다. 소비 화면이 data 분기를 먼저 보면 오류
 * 뒤에도 옛 스코어가 성공 화면처럼 남으므로, 오류 상태에서는 data 를 비워 isError 분기가 이기게 한다.
 */
function hideStaleRecordOnError<T extends UseQueryResult<PublicMatchDetail>>(query: T): T {
  // data 를 항상 읽어 옵저버가 data 변경도 추적하게 한다(오류일 때만 읽으면 그 전의 갱신 알림을 놓친다).
  const hasData = query.data !== undefined;
  return query.isError && hasData ? ({ ...query, data: undefined } as T) : query;
}

/**
 * `GET /tournaments/:id/matches/:fixtureId` -- single match projection.
 * A `hidden` fixture, an unpublished bracket, and a genuinely missing
 * fixture/tournament all surface as the same 404 here (`react-query`
 * `isError`); the caller must not attempt to distinguish them.
 */
export function usePublicMatch(
  tournamentId: string,
  fixtureId: string,
  options?: { seed?: PublicMatchDetail | null },
) {
  const query = useQuery({
    queryKey: publicGameRecordsKeys.match(tournamentId, fixtureId),
    queryFn: () => v1Get<PublicMatchDetail>(`/tournaments/${tournamentId}/matches/${fixtureId}`),
    enabled: Boolean(tournamentId) && Boolean(fixtureId),
    // 서버 page 가 404 판정용으로 이미 받은 공개 응답 — 첫 화면(서버 HTML 포함)에 쓴다.
    placeholderData: options?.seed ?? undefined,
    retry: shouldRetryPublicRecord,
    // 진행 중이면 10초, 시작 전이면 킥오프가 가까워질 때부터 — 시작 전에 열어 둔 화면도 시작을 스스로 발견한다.
    refetchInterval: publicRecordRefetchInterval,
  });
  return hideStaleRecordOnError(query);
}

/**
 * `GET /league-matches/:leagueId/fixtures/:teamMatchId/record` -- 리그 대진의
 * 경기 기록 프로젝션. 서버가 `usePublicMatch`와 **같은 PublicMatchDetail 필드명**으로
 * 내려준다(tournamentId/tournamentTitle 자리에 리그 id/제목, round 에 'N주차' 라벨,
 * groupName 은 null — `getLeagueFixtureRecord` 주석 참고). 게임이 아직 없거나 숨김
 * 정책인 대진은 404 로 접힌다 -- 소비처(리그 경기 상세)는 그때 자체 요약 카드로
 * 폴백하므로 404 는 재시도하지 않는다(그 외 오류는 `shouldRetryPublicRecord` 기준으로 재시도).
 */
export function usePublicLeagueFixtureRecord(leagueId: string, teamMatchId: string) {
  const query = useQuery({
    queryKey: [...publicGameRecordsKeys.all, 'league-fixture-record', leagueId, teamMatchId] as const,
    queryFn: () => v1Get<PublicMatchDetail>(`/league-matches/${leagueId}/fixtures/${teamMatchId}/record`),
    enabled: Boolean(leagueId) && Boolean(teamMatchId),
    retry: shouldRetryPublicRecord,
    refetchInterval: publicRecordRefetchInterval,
  });
  return hideStaleRecordOnError(query);
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
export function usePublicUserRecords(userId: string, season?: string, type?: TeamRecordCategory) {
  return useInfiniteQuery({
    // `type` 이 키에 들어가야 탭을 바꿀 때 캐시가 갈린다 — 빠지면 다른 탭의 페이지가
    // 그대로 재사용된다(팀 전적 키와 같은 이유·같은 모양).
    queryKey: publicGameRecordsKeys.userRecords(userId, season, type ?? null),
    queryFn: ({ pageParam }: { pageParam: string | null }) =>
      v1Get<PublicUserRecordsResponse>(`/users/${userId}/records`, {
        ...(season ? { season } : {}),
        ...(type ? { type } : {}),
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
/**
 * 대회 개인 득점·도움 랭킹.
 *
 * `options.enabled` 로 조회 자체를 끌 수 있다 — **정규 리그가 그 경우다.** 리그 참가자는
 * `userId` 로 이어져 있지 않아 사람 단위 집계 근거가 없고, 서버도 같은 이유로 이 표면에서
 * 리그를 다루지 않는다. 빈 응답을 받아 "기록 없음" 으로 그리면 *"아직 기록이 없다"* 로
 * 읽히는데 사실은 **집계 자체가 불가능**한 것이라, 호출도 하지 않는 편이 정직하다.
 */
export function usePublicTournamentPlayerRecords(
  tournamentId: string,
  options: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: publicGameRecordsKeys.playerRecords(tournamentId),
    queryFn: () =>
      v1Get<PublicTournamentPlayerRecordsResponse>(`/tournaments/${tournamentId}/player-records`),
    enabled: Boolean(tournamentId) && (options.enabled ?? true),
    staleTime: 60_000,
    retry: false,
  });
}
