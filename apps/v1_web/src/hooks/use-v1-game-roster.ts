'use client';

import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { v1Delete, v1Get, v1Post } from '@/lib/api-client';
import { v1Keys } from '@/lib/query-keys';
import type { GameRosterAdjustmentReason, MemberUnavailabilityReason } from '@/lib/v1-status-labels';
import type { V1GameState } from '@/types/api';
import type { V1GameRosterSummary } from '@/hooks/use-v1-api';

/**
 * Task 176 경기별 출전 명단 — 데이터 계층.
 * 서버 계약: `apps/v1_api/src/games/roster/*`(GameRosterView·TeamRosterMatrix·MemberUnavailabilityView).
 * 날짜는 JSON 이라 ISO 문자열이고, 사유·역할은 서버 컬럼이 문자열이라 `string | null` 그대로 둔다.
 */

// ── 서버 값 타입 ─────────────────────────────────────────────────────────────

export type V1GameRosterViewerRole = 'TEAM_MANAGER' | 'TEAM_MEMBER' | 'ADMIN' | 'STAFF';
export type V1GameRosterPlayerStatus = 'PARTICIPATING' | 'EXCLUDED' | 'UNAVAILABLE' | 'SUSPENDED';

export type V1GameRosterActor = {
  userId: string;
  displayName: string;
  /** TEAM_MANAGER | ADMIN | STAFF. 되돌리기 기록은 역할이 남지 않아 null. */
  role: string | null;
};

export type V1GameRosterPerson = {
  userId: string;
  displayName: string;
  jerseyNumber: number | null;
  /** false = 리그 폴백 팀원(경기 기록에 계정 없이 들어간다). */
  accountLinked: boolean;
};

export type V1GameRosterView = {
  gameId: string;
  sideId: string;
  teamId: string;
  teamMatchId: string;
  competitionId: string;
  competitionKind: 'TOURNAMENT' | 'LEAGUE';
  gameState: V1GameState;
  /** 조정 마감 = 경기 시작 시각. 시각 미정이면 null(실제 마감은 경기 상태가 SCHEDULED 를 벗어날 때). */
  deadline: string | null;
  editable: boolean;
  viewerRole: V1GameRosterViewerRole;
  baseSource: 'REGISTRATION' | 'TEAM_MEMBERS';
  base: (V1GameRosterPerson & { status: V1GameRosterPlayerStatus })[];
  participants: (V1GameRosterPerson & { joinedAfterFixtureCreated: boolean })[];
  excluded: (V1GameRosterPerson & {
    adjustmentId: string;
    reason: string | null;
    excludedAt: string;
    actor: V1GameRosterActor;
  })[];
  suspended: (V1GameRosterPerson & { reason: string | null; remainingMatches: number })[];
  unavailable: (V1GameRosterPerson & {
    unavailabilityId: string;
    reason: string | null;
    startsAt: string;
    endsAt: string;
    actor: V1GameRosterActor;
  })[];
  counts: { base: number; participating: number; excluded: number; unavailable: number; suspended: number };
  /** 리그의 팀장 저장본이 아직 이관되지 않아 경기 기록 명단이 이 계산을 따르지 않는 상태. */
  legacyLineupPending: boolean;
};

export type V1GameRosterHistoryEvent = {
  type: 'EXCLUDE' | 'REVOKE';
  adjustmentId: string;
  userId: string;
  displayName: string;
  reason: string | null;
  actor: V1GameRosterActor;
  at: string;
};

export type V1GameRosterHistory = { gameId: string; sideId: string; events: V1GameRosterHistoryEvent[] };

export type V1GameRosterAdjustment = {
  id: string;
  userId: string;
  reason: string | null;
  actorRole: string;
  createdAt: string;
  revokedAt: string | null;
};

export type V1GameRosterExcludeResult = {
  alreadyApplied: boolean;
  adjustment: V1GameRosterAdjustment;
  roster: V1GameRosterView;
};

export type V1GameRosterRevokeResult = { alreadyApplied: boolean; roster: V1GameRosterView };

export type V1TeamRosterCellStatus = V1GameRosterPlayerStatus | 'NOT_IN_ROSTER';

export type V1TeamRosterCell = {
  gameId: string;
  status: V1TeamRosterCellStatus;
  reason: string | null;
  actorRole: string | null;
  adjustmentId: string | null;
  unavailabilityId: string | null;
  remainingMatches: number | null;
};

export type V1TeamRosterMatrixGame = {
  gameId: string;
  sideId: string;
  teamMatchId: string;
  competitionId: string;
  competitionKind: 'TOURNAMENT' | 'LEAGUE';
  competitionTitle: string | null;
  opponentName: string | null;
  scheduledAt: string | null;
  gameState: V1GameState;
  editable: boolean;
  /** 기준 명단이 없는 경기(대회 확정 신청 없음 등)는 null. */
  summary: V1GameRosterSummary | null;
};

export type V1TeamRosterMatrixPlayer = {
  userId: string;
  displayName: string;
  accountLinked: boolean;
  /** `games` 와 같은 순서·길이. */
  cells: V1TeamRosterCell[];
};

export type V1TeamRosterMatrix = {
  teamId: string;
  viewerRole: 'TEAM_MANAGER' | 'TEAM_MEMBER' | 'ADMIN';
  games: V1TeamRosterMatrixGame[];
  players: V1TeamRosterMatrixPlayer[];
};

export type V1AdminRegistrationRosterMatrix = {
  registrationId: string;
  teamId: string;
  competitionId: string;
  viewerRole: 'ADMIN' | 'STAFF';
  games: V1TeamRosterMatrixGame[];
  players: V1TeamRosterMatrixPlayer[];
};

export type V1GameRosterBatchChange = {
  gameId: string;
  userId: string;
  op: 'EXCLUDE' | 'REVOKE';
  /** EXCLUDE 에만. REVOKE 에 붙이면 서버가 400(ROSTER_BATCH_REASON_ON_REVOKE). */
  reason?: GameRosterAdjustmentReason;
};

export type V1GameRosterBatchResult = {
  teamId: string;
  results: { gameId: string; sideId: string; userId: string; op: 'EXCLUDE' | 'REVOKE'; alreadyApplied: boolean }[];
};

export type V1MemberUnavailability = {
  id: string;
  teamId: string;
  userId: string;
  startsAt: string;
  endsAt: string;
  reason: string | null;
  actor: { userId: string; displayName: string; role: string };
  createdAt: string;
  revokedAt: string | null;
};

export type V1MemberUnavailabilityList = { teamId: string; userId: string; items: V1MemberUnavailability[] };

export type V1MemberUnavailabilityWriteResult = {
  unavailability: V1MemberUnavailability;
  /** 다시 계산한 경기 사이드 수. */
  syncedSides: number;
};

export type V1MemberUnavailabilityRevokeResult = V1MemberUnavailabilityWriteResult & { alreadyApplied: boolean };

export type V1CreateMemberUnavailabilityPayload = {
  /** ISO. 이 시각 이후 시작하는 경기부터 빠진다(포함). */
  startsAt: string;
  /** ISO. startsAt 보다 뒤(제외). */
  endsAt: string;
  reason?: MemberUnavailabilityReason;
};

// ── 캐시 무효화 규칙 ─────────────────────────────────────────────────────────
// 조정·결장·일괄 저장은 서버가 같은 트랜잭션에서 경기 명단(라인업 리비전)을 다시 계산한다.
// 그래서 명단·변경 기록뿐 아니라 그 경기 라인업, 팀 다가오는 경기 요약, 팀 표, 어드민 펼침 표가
// 전부 낡는다. 어드민 표는 신청 id 를 여기서 모르므로 접두사로 통째 무효화한다.

function invalidateTeamRosterViews(queryClient: QueryClient, teamId: string) {
  void queryClient.invalidateQueries({ queryKey: v1Keys.teamUpcomingGames(teamId) });
  void queryClient.invalidateQueries({ queryKey: v1Keys.teamGameRosters(teamId) });
  void queryClient.invalidateQueries({ queryKey: v1Keys.adminGameRostersAll() });
}

function invalidateGameSide(queryClient: QueryClient, gameId: string, sideId: string) {
  void queryClient.invalidateQueries({ queryKey: v1Keys.gameSideRosterAll(gameId, sideId) });
  void queryClient.invalidateQueries({ queryKey: v1Keys.gameLineups(gameId) });
}

/** 결장 기간은 그 팀의 기간 안 경기 여러 개를 바꾼다 — 어느 경기인지 응답이 알려 주지 않는다. */
function isAnyGameRosterOrLineupKey(key: readonly unknown[]): boolean {
  return key[0] === 'v1' && key[1] === 'games' && (key[3] === 'sides' || key[3] === 'lineups');
}

function afterSideWrite(queryClient: QueryClient, roster: V1GameRosterView) {
  // 응답이 새 명단을 싣고 오므로 명단은 바로 넣고, 기록·라인업만 다시 받는다.
  queryClient.setQueryData(v1Keys.gameRoster(roster.gameId, roster.sideId), roster);
  void queryClient.invalidateQueries({ queryKey: v1Keys.gameRosterAdjustments(roster.gameId, roster.sideId) });
  void queryClient.invalidateQueries({ queryKey: v1Keys.gameLineups(roster.gameId) });
  invalidateTeamRosterViews(queryClient, roster.teamId);
}

// ── 경기 한 사이드 ───────────────────────────────────────────────────────────

export function useV1GameRoster(gameId: string | null, sideId: string | null, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: v1Keys.gameRoster(gameId ?? '', sideId ?? ''),
    queryFn: () => {
      if (!gameId || !sideId) throw new Error('경기·팀 정보 없이 명단을 조회할 수 없어요.');
      return v1Get<V1GameRosterView>(`/games/${gameId}/sides/${sideId}/roster`);
    },
    enabled: (options?.enabled ?? true) && Boolean(gameId) && Boolean(sideId),
    retry: false,
  });
}

export function useV1GameRosterAdjustments(
  gameId: string | null,
  sideId: string | null,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: v1Keys.gameRosterAdjustments(gameId ?? '', sideId ?? ''),
    queryFn: () => {
      if (!gameId || !sideId) throw new Error('경기·팀 정보 없이 변경 기록을 조회할 수 없어요.');
      return v1Get<V1GameRosterHistory>(`/games/${gameId}/sides/${sideId}/roster-adjustments`);
    },
    enabled: (options?.enabled ?? true) && Boolean(gameId) && Boolean(sideId),
    retry: false,
  });
}

/** 이번 경기에서 선수 빼기. 이미 빠져 있으면 서버가 `alreadyApplied: true` 로 첫 기록을 그대로 둔다. */
export function useV1ExcludeGameRosterPlayer(gameId: string, sideId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { userId: string; reason?: GameRosterAdjustmentReason }) =>
      v1Post<V1GameRosterExcludeResult>(`/games/${gameId}/sides/${sideId}/roster-adjustments`, input),
    onSuccess: (result) => afterSideWrite(queryClient, result.roster),
  });
}

/** 뺀 선수 되돌리기. 빠져 있지 않으면 `alreadyApplied: true`. */
export function useV1RevokeGameRosterAdjustment(gameId: string, sideId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) =>
      v1Delete<V1GameRosterRevokeResult>(`/games/${gameId}/sides/${sideId}/roster-adjustments/${userId}`),
    onSuccess: (result) => afterSideWrite(queryClient, result.roster),
  });
}

// ── 팀 B: 선수 × 경기 표와 일괄 저장 ─────────────────────────────────────────

/** 팀 owner·manager·플랫폼 운영자 전용 — 팀원이면 서버가 403 이다. */
export function useV1TeamGameRosters(teamId: string | null, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: v1Keys.teamGameRosters(teamId ?? ''),
    queryFn: () => {
      if (!teamId) throw new Error('팀 정보 없이 경기 명단 표를 조회할 수 없어요.');
      return v1Get<V1TeamRosterMatrix>(`/teams/${teamId}/game-rosters`);
    },
    enabled: (options?.enabled ?? true) && Boolean(teamId),
    retry: false,
  });
}

/** 여러 경기 빼기·되돌리기를 한 트랜잭션으로. 시작된 경기가 섞이면 전부 409(`details.gameIds`). */
export function useV1ApplyGameRosterBatch(teamId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (changes: V1GameRosterBatchChange[]) =>
      v1Post<V1GameRosterBatchResult>(`/teams/${teamId}/game-rosters/batch`, { changes }),
    onSuccess: (result) => {
      const sides = new Map(result.results.map((row) => [`${row.gameId}:${row.sideId}`, row]));
      for (const row of sides.values()) invalidateGameSide(queryClient, row.gameId, row.sideId);
      invalidateTeamRosterViews(queryClient, result.teamId);
    },
  });
}

// ── 팀 C: 결장 기간 ──────────────────────────────────────────────────────────

/** 취소된 기간도 온다(`revokedAt`). 조회는 그 팀 활성 멤버·플랫폼 운영자. */
export function useV1MemberUnavailability(
  teamId: string | null,
  userId: string | null,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: v1Keys.teamMemberUnavailability(teamId ?? '', userId ?? ''),
    queryFn: () => {
      if (!teamId || !userId) throw new Error('팀·선수 정보 없이 결장 기간을 조회할 수 없어요.');
      return v1Get<V1MemberUnavailabilityList>(`/teams/${teamId}/members/${userId}/unavailability`);
    },
    enabled: (options?.enabled ?? true) && Boolean(teamId) && Boolean(userId),
    retry: false,
  });
}

function afterUnavailabilityWrite(queryClient: QueryClient, teamId: string, userId: string) {
  void queryClient.invalidateQueries({ queryKey: v1Keys.teamMemberUnavailability(teamId, userId) });
  void queryClient.invalidateQueries({ predicate: (query) => isAnyGameRosterOrLineupKey(query.queryKey) });
  invalidateTeamRosterViews(queryClient, teamId);
}

/** 결장 기간 등록(owner·manager·플랫폼 운영자, 본인 불가). 기간 안 시작 전 대회·리그 경기에서 빠진다. */
export function useV1CreateMemberUnavailability(teamId: string, userId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: V1CreateMemberUnavailabilityPayload) =>
      v1Post<V1MemberUnavailabilityWriteResult>(`/teams/${teamId}/members/${userId}/unavailability`, payload),
    onSuccess: () => afterUnavailabilityWrite(queryClient, teamId, userId),
  });
}

/** 결장 기간 취소. 이미 취소면 `alreadyApplied: true`. */
export function useV1RevokeMemberUnavailability(teamId: string, userId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (unavailabilityId: string) =>
      v1Delete<V1MemberUnavailabilityRevokeResult>(
        `/teams/${teamId}/members/${userId}/unavailability/${unavailabilityId}`,
      ),
    onSuccess: () => afterUnavailabilityWrite(queryClient, teamId, userId),
  });
}

// ── 어드민: 참가 신청 팀 행 펼침 ─────────────────────────────────────────────

/** 대회·리그 공통(리그도 tournamentId = leagueId). 어드민·그 대회 스태프. 쓰기는 경기 단위 훅·일괄 훅을 쓴다. */
export function useV1AdminRegistrationGameRosters(
  tournamentId: string | null,
  registrationId: string | null,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: v1Keys.adminRegistrationGameRosters(tournamentId ?? '', registrationId ?? ''),
    queryFn: () => {
      if (!tournamentId || !registrationId) throw new Error('대회·참가 신청 정보 없이 경기 명단 표를 조회할 수 없어요.');
      return v1Get<V1AdminRegistrationRosterMatrix>(
        `/admin/tournaments/${tournamentId}/registrations/${registrationId}/game-rosters`,
      );
    },
    enabled: (options?.enabled ?? true) && Boolean(tournamentId) && Boolean(registrationId),
    retry: false,
  });
}
