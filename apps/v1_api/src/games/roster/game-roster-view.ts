import type { V1GameState } from '@prisma/client';
import type { GameActorRole } from '../games.types';
import type { GameRosterActorRole, GameRosterBaseEntry, GameRosterComputation } from './game-roster-computation';
import type { GameRosterBaseSource } from './game-roster-loader';

export type GameRosterViewerRole = 'TEAM_MANAGER' | 'TEAM_MEMBER' | 'ADMIN' | 'STAFF';

export interface GameRosterAccess {
  readonly viewerRole: GameRosterViewerRole;
  /** 쓰기 때 조정 기록에 남는 역할. null 이면 읽기만 한다. */
  readonly writeRole: GameRosterActorRole | null;
}

/**
 * 경기 명단 화면의 권한. **사이드 팀** 멤버십이 먼저다 — 상대팀 팀장은 운영자 판정에서도
 * 운영자로 치지 않으므로(`resolveCompetitionOperator`) 여기서 null 이 된다.
 */
export function decideGameRosterAccess(input: {
  sideMembershipRole: 'owner' | 'manager' | 'member' | null;
  operator: { role: GameActorRole; canMutateLineup: boolean } | null;
}): GameRosterAccess | null {
  const { sideMembershipRole, operator } = input;
  if (sideMembershipRole === 'owner' || sideMembershipRole === 'manager') {
    return { viewerRole: 'TEAM_MANAGER', writeRole: 'TEAM_MANAGER' };
  }
  if (operator !== null) {
    const viewerRole: GameRosterViewerRole = operator.role === 'platform_ops' ? 'ADMIN' : 'STAFF';
    // support_readonly 는 정책상 lineup_mutate 가 없지만, 정책이 바뀌어도 조정 쓰기는 열지 않는다.
    const writable = operator.canMutateLineup && operator.role !== 'support_readonly';
    return { viewerRole, writeRole: writable ? viewerRole : null };
  }
  if (sideMembershipRole === 'member') return { viewerRole: 'TEAM_MEMBER', writeRole: null };
  return null;
}

export interface GameRosterActorView {
  readonly userId: string;
  readonly displayName: string;
  readonly role: string | null;
}

export interface GameRosterPersonView {
  readonly userId: string;
  readonly displayName: string;
  readonly jerseyNumber: number | null;
  /** false = 리그 폴백 팀원(경기 기록에 계정 없이 들어간다). */
  readonly accountLinked: boolean;
}

export interface GameRosterView {
  readonly gameId: string;
  readonly sideId: string;
  readonly teamId: string;
  readonly teamMatchId: string;
  readonly competitionId: string;
  readonly competitionKind: 'TOURNAMENT' | 'LEAGUE';
  readonly gameState: V1GameState;
  /** 조정 마감 = 경기 시작 시각. 실제 마감은 경기 상태가 SCHEDULED 를 벗어나는 때다. */
  readonly deadline: Date | null;
  readonly editable: boolean;
  readonly viewerRole: GameRosterViewerRole;
  readonly baseSource: GameRosterBaseSource;
  readonly base: (GameRosterPersonView & { status: 'PARTICIPATING' | 'EXCLUDED' | 'UNAVAILABLE' | 'SUSPENDED' })[];
  readonly participants: (GameRosterPersonView & { joinedAfterFixtureCreated: boolean })[];
  readonly excluded: (GameRosterPersonView & {
    adjustmentId: string;
    reason: string | null;
    excludedAt: Date;
    actor: GameRosterActorView;
  })[];
  readonly suspended: (GameRosterPersonView & { reason: string | null; remainingMatches: number })[];
  readonly unavailable: (GameRosterPersonView & {
    unavailabilityId: string;
    reason: string | null;
    startsAt: Date;
    endsAt: Date;
    actor: GameRosterActorView;
  })[];
  readonly counts: {
    base: number;
    participating: number;
    excluded: number;
    unavailable: number;
    suspended: number;
  };
  /** 리그의 팀장 저장본이 아직 이관되지 않아 경기 기록 명단이 이 계산을 따르지 않는 상태. */
  readonly legacyLineupPending: boolean;
}

function person(entry: GameRosterBaseEntry): GameRosterPersonView {
  return {
    userId: entry.userId,
    displayName: entry.displayNameSnapshot,
    jerseyNumber: entry.jerseyNumber,
    accountLinked: entry.accountLinked,
  };
}

export interface GameRosterViewInput {
  readonly context: {
    gameId: string;
    sideId: string;
    teamId: string;
    teamMatchId: string;
    competitionId: string;
    isLeague: boolean;
    gameState: V1GameState;
    startAt: Date | null;
  };
  readonly access: GameRosterAccess;
  readonly baseSource: GameRosterBaseSource;
  readonly base: readonly GameRosterBaseEntry[];
  readonly computation: GameRosterComputation;
  /**
   * 대진 생성 때(명단이 처음 채워진 비무효 리비전) 이 사이드에 있던 계정. null 이면 비교할 기준이 없다.
   */
  readonly fixtureSnapshotUserIds: ReadonlySet<string> | null;
  readonly legacyLineupPending: boolean;
  readonly displayNameByUserId: ReadonlyMap<string, string>;
}

export function buildGameRosterView(input: GameRosterViewInput): GameRosterView {
  const { context, computation } = input;
  const actor = (userId: string, role: string | null): GameRosterActorView => ({
    userId,
    displayName: input.displayNameByUserId.get(userId) ?? '알 수 없음',
    role,
  });
  const statusByUser = new Map<string, GameRosterView['base'][number]['status']>();
  for (const row of computation.suspended) statusByUser.set(row.entry.userId, 'SUSPENDED');
  for (const row of computation.unavailable) statusByUser.set(row.entry.userId, 'UNAVAILABLE');
  for (const row of computation.excluded) statusByUser.set(row.entry.userId, 'EXCLUDED');

  const snapshot = input.fixtureSnapshotUserIds;
  return {
    gameId: context.gameId,
    sideId: context.sideId,
    teamId: context.teamId,
    teamMatchId: context.teamMatchId,
    competitionId: context.competitionId,
    competitionKind: context.isLeague ? 'LEAGUE' : 'TOURNAMENT',
    gameState: context.gameState,
    deadline: context.startAt,
    editable: input.access.writeRole !== null && context.gameState === 'SCHEDULED',
    viewerRole: input.access.viewerRole,
    baseSource: input.baseSource,
    base: input.base.map((entry) => ({ ...person(entry), status: statusByUser.get(entry.userId) ?? 'PARTICIPATING' })),
    participants: computation.participants.map((entry) => ({
      ...person(entry),
      joinedAfterFixtureCreated: snapshot !== null && entry.accountLinked && !snapshot.has(entry.userId),
    })),
    excluded: computation.excluded.map((row) => ({
      ...person(row.entry),
      adjustmentId: row.adjustmentId,
      reason: row.reason,
      excludedAt: row.createdAt,
      actor: actor(row.actorUserId, row.actorRole),
    })),
    suspended: computation.suspended.map((row) => ({
      ...person(row.entry),
      reason: row.reason,
      remainingMatches: row.remainingMatches,
    })),
    unavailable: computation.unavailable.map((row) => ({
      ...person(row.entry),
      unavailabilityId: row.unavailabilityId,
      reason: row.reason,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      actor: actor(row.actorUserId, row.actorRole),
    })),
    counts: {
      base: input.base.length,
      participating: computation.participants.length,
      excluded: computation.excluded.length,
      unavailable: computation.unavailable.length,
      suspended: computation.suspended.length,
    },
    legacyLineupPending: input.legacyLineupPending,
  };
}
