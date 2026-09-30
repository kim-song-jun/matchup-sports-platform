'use client';

import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { v1Delete, v1Get, v1Post } from '@/lib/api-client';
import { v1Keys } from '@/lib/query-keys';
import type { GameRosterAdjustmentReason, MemberUnavailabilityReason } from '@/lib/v1-status-labels';
import type { V1GameState } from '@/types/api';
import type { V1GameRosterSummary } from '@/hooks/use-v1-api';
import { publicGameRecordsKeys } from '@/components/public-game-records/use-public-game-records';

/**
 * Task 179 경기별 출전 명단 — 데이터 계층.
 * 서버 계약: `apps/v1_api/src/games/roster/*`(GameRosterView·TeamRosterMatrix·MemberUnavailabilityView).
 * 날짜는 JSON 이라 ISO 문자열이고, 사유·역할은 서버 컬럼이 문자열이라 `string | null` 그대로 둔다.
 */

// ── 서버 값 타입 ─────────────────────────────────────────────────────────────

export type V1GameRosterViewerRole = 'TEAM_MANAGER' | 'TEAM_MEMBER' | 'ADMIN' | 'STAFF';
export type V1GameRosterPlayerStatus = 'PARTICIPATING' | 'EXCLUDED' | 'UNAVAILABLE' | 'SUSPENDED';

export type V1GameRosterActor = {
  /** 사이드 팀이 바뀌어 자동으로 되돌린 기록은 사람이 없어 null. */
  userId: string | null;
  displayName: string;
  /** TEAM_MANAGER | ADMIN | STAFF | SYSTEM(자동 되돌림). 옛 기록은 null 일 수 있다. */
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

/** 팀·경기로 찾은 명단 — 사이드 명단 조회와 같은 본문·권한에 상대 팀 이름을 더한다. */
export type V1TeamGameRosterView = V1GameRosterView & { opponentName: string | null };

export type V1GameRosterHistoryEvent = {
  type: 'EXCLUDE' | 'REVOKE';
  adjustmentId: string;
  userId: string;
  displayName: string;
  reason: string | null;
  actor: V1GameRosterActor;
  at: string;
};

/** `teamId` = 지금 사이드 팀 — 기록은 이 팀의 조정만 온다(대진이 바뀌면 이전 팀 기록은 빠진다). */
export type V1GameRosterHistory = { gameId: string; sideId: string; teamId: string; events: V1GameRosterHistoryEvent[] };

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

/** 한 시각에 결장 중인(취소 안 된) 활성 팀원의 기간. */
export type V1TeamUnavailabilityItem = {
  id: string;
  userId: string;
  reason: string | null;
  startsAt: string;
  endsAt: string;
  actorRole: string;
};

export type V1TeamUnavailabilityList = { items: V1TeamUnavailabilityItem[] };

/** 기간 안 경기 명단(라인업)은 서버 워커가 이어서 맞춘다 — 명단 조회는 볼 때 계산하므로 바로 반영된다. */
export type V1MemberUnavailabilityWriteResult = { unavailability: V1MemberUnavailability };

export type V1MemberUnavailabilityRevokeResult = V1MemberUnavailabilityWriteResult & { alreadyApplied: boolean };

export type V1CreateMemberUnavailabilityPayload = {
  /** ISO. 이 시각 이후 시작하는 경기부터 빠진다(포함). */
  startsAt: string;
  /** ISO. startsAt 보다 뒤(제외). */
  endsAt: string;
  reason?: MemberUnavailabilityReason;
};

// ── 캐시 무효화 규칙 ─────────────────────────────────────────────────────────
// 조정·일괄 저장은 서버가 같은 트랜잭션에서 경기 명단(라인업 리비전)을 다시 계산하고, 결장 기간은
// 워커가 이어서 맞춘다. 어느 쪽이든 명단·변경 기록뿐 아니라 그 경기 라인업을 읽는 화면 전부(운영 콘솔,
// 팀매치 경량 콘솔, 경기 상세 공개 기록 — 킥오프 60분 전부터 시작 전 경기에도 라인업이 나간다), 팀 다가오는
// 경기 요약, 팀 표, 어드민 펼침 표가 낡는다. 키에 gameId 가 없는 것(대회 콘솔·공개 기록·어드민 표)은
// 접두사·모양으로 통째 낡게 둔다 — 떠 있는 쿼리만 다시 받는다.

function invalidateTeamRosterViews(queryClient: QueryClient, teamId: string) {
  void queryClient.invalidateQueries({ queryKey: v1Keys.teamUpcomingGames(teamId) });
  void queryClient.invalidateQueries({ queryKey: v1Keys.teamGameRosters(teamId) });
  void queryClient.invalidateQueries({ queryKey: v1Keys.adminGameRostersAll() });
}

/** `v1Keys.fixtureLineup(t, f)` — 대회 운영 콘솔의 라인업. */
function isFixtureLineupKey(key: readonly unknown[]): boolean {
  return key[0] === 'v1' && key[1] === 'tournament-ops' && key[3] === 'fixtures' && key[5] === 'lineup';
}

/** 경기 상세 공개 기록(대회 `match`·리그 `league-fixture-record`) — 공개 라인업이 여기 실린다. */
function isPublicMatchRecordKey(key: readonly unknown[]): boolean {
  const [root, lane] = publicGameRecordsKeys.all;
  return key[0] === root && key[1] === lane && (key[2] === 'match' || key[2] === 'league-fixture-record');
}

/** 경기 id 단위 라인업 키 — 결과 검토용 `lineups`, 팀매치 콘솔용 `operations-lineup`. */
function isGameLineupKey(key: readonly unknown[]): boolean {
  return key[0] === 'v1' && key[1] === 'games' && (key[3] === 'lineups' || key[3] === 'operations-lineup');
}

/** 명단이 바뀐 경기의 라인업을 읽는 화면들. `gameIds` 를 모르면(결장 기간) 모든 경기 라인업을 낡게 둔다. */
function invalidateLineupReaders(queryClient: QueryClient, gameIds: readonly string[] | null) {
  if (gameIds === null) {
    void queryClient.invalidateQueries({ predicate: (query) => isGameLineupKey(query.queryKey) });
  } else {
    for (const gameId of gameIds) {
      void queryClient.invalidateQueries({ queryKey: v1Keys.gameLineups(gameId) });
      void queryClient.invalidateQueries({ queryKey: v1Keys.gameOperationsLineup(gameId) });
    }
  }
  void queryClient.invalidateQueries({
    predicate: (query) => isFixtureLineupKey(query.queryKey) || isPublicMatchRecordKey(query.queryKey),
  });
}

// ── 경기 한 사이드 ───────────────────────────────────────────────────────────

/**
 * 그 팀이 뛰는 대회·리그 경기의 명단. 사이드는 서버가 팀으로 찾는다 — 그 팀이 사이드가 아니거나 친선·명단 없는
 * 경기는 404 `GAME_ROSTER_NOT_AVAILABLE`. 조정·변경 기록 훅은 응답의 `sideId` 로 부른다.
 */
export function useV1TeamGameRoster(teamId: string | null, gameId: string | null, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: v1Keys.teamGameRoster(teamId ?? '', gameId ?? ''),
    queryFn: () => {
      if (!teamId || !gameId) throw new Error('팀·경기 정보 없이 명단을 조회할 수 없어요.');
      return v1Get<V1TeamGameRosterView>(`/teams/${teamId}/games/${gameId}/roster`);
    },
    enabled: (options?.enabled ?? true) && Boolean(teamId) && Boolean(gameId),
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
      for (const row of sides.values()) {
        void queryClient.invalidateQueries({ queryKey: v1Keys.gameSideRosterAll(row.gameId, row.sideId) });
      }
      const gameIds = [...new Set(result.results.map((row) => row.gameId))];
      for (const gameId of gameIds) {
        void queryClient.invalidateQueries({ queryKey: v1Keys.teamGameRoster(result.teamId, gameId) });
      }
      invalidateLineupReaders(queryClient, gameIds);
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

/**
 * 친선 참석명단 편집기의 "결장" 표시용 — `activeAt`(킥오프) 을 덮는 기간만 온다. 시각을 모르면 조회하지 않는다
 * (지금 기준으로 보이면 다른 날 경기에 틀린 표시가 된다). 그 팀 활성 멤버·플랫폼 운영자.
 */
export function useV1TeamUnavailability(
  teamId: string | null,
  activeAt: string | null,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: v1Keys.teamUnavailability(teamId ?? '', activeAt ?? ''),
    queryFn: () => {
      if (!teamId || !activeAt) throw new Error('팀·경기 시각 없이 결장 정보를 조회할 수 없어요.');
      return v1Get<V1TeamUnavailabilityList>(`/teams/${teamId}/unavailability`, { activeAt });
    },
    enabled: (options?.enabled ?? true) && Boolean(teamId) && Boolean(activeAt),
    retry: false,
  });
}

/** 결장 기간은 그 팀의 기간 안 경기 여러 개를 바꾼다 — 어느 경기인지 응답이 알려 주지 않는다. */
function afterUnavailabilityWrite(queryClient: QueryClient, teamId: string, userId: string) {
  void queryClient.invalidateQueries({ queryKey: v1Keys.teamMemberUnavailability(teamId, userId) });
  void queryClient.invalidateQueries({ queryKey: v1Keys.teamUnavailabilityAll(teamId) });
  void queryClient.invalidateQueries({ queryKey: v1Keys.teamGameRosterAll(teamId) });
  invalidateLineupReaders(queryClient, null);
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
