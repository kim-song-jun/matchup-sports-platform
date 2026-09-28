import type { SuspensionVerdict } from '../../tournaments/discipline/card-suspension';

export type GameRosterActorRole = 'TEAM_MANAGER' | 'ADMIN' | 'STAFF';

/** 대회·리그 경기 한 사이드의 기준 명단 한 줄(참가 명단 선수, 또는 리그 폴백 팀원). */
export interface GameRosterBaseEntry {
  /** 조정·결장·출전정지를 대조하는 키. 리그 폴백 팀원은 멤버십의 userId 다. */
  readonly userId: string;
  /** false 면 경기 참가자 행에 userId 를 싣지 않는다(리그 폴백 — 계정 없이 들어간다). */
  readonly accountLinked: boolean;
  readonly displayNameSnapshot: string;
  readonly jerseyNumber: number | null;
  /** 참가 명단 선수 id 또는 폴백 멤버십 id. */
  readonly sourceParticipantId: string;
}

export interface GameRosterAdjustmentInput {
  readonly id: string;
  readonly userId: string;
  readonly reason: string | null;
  readonly actorUserId: string;
  readonly actorRole: string;
  readonly createdAt: Date;
  readonly revokedAt: Date | null;
}

export interface GameRosterUnavailabilityInput {
  readonly id: string;
  readonly userId: string;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly reason: string | null;
  readonly actorUserId: string;
  readonly actorRole: string;
  readonly revokedAt: Date | null;
}

export type GameRosterSuspensionInput = Pick<SuspensionVerdict, 'suspended' | 'reason'>;

export interface GameRosterComputationInput {
  readonly base: readonly GameRosterBaseEntry[];
  readonly adjustments: readonly GameRosterAdjustmentInput[];
  readonly unavailabilities: readonly GameRosterUnavailabilityInput[];
  /** 시각이 아직 없는 경기(대회 대진은 선택값)에는 결장 기간이 걸리지 않는다. */
  readonly gameStartAt: Date | null;
  /** 규정이 없는 대회·리그는 빈 맵이다. */
  readonly suspensionVerdicts: ReadonlyMap<string, GameRosterSuspensionInput>;
}

export interface GameRosterSuspendedEntry {
  readonly entry: GameRosterBaseEntry;
  readonly reason: string | null;
}

export interface GameRosterUnavailableEntry {
  readonly entry: GameRosterBaseEntry;
  readonly unavailabilityId: string;
  readonly reason: string | null;
  readonly actorUserId: string;
  readonly actorRole: string;
  readonly startsAt: Date;
  readonly endsAt: Date;
}

export interface GameRosterExcludedEntry {
  readonly entry: GameRosterBaseEntry;
  readonly adjustmentId: string;
  readonly reason: string | null;
  readonly actorUserId: string;
  readonly actorRole: string;
  readonly createdAt: Date;
}

export interface GameRosterComputation {
  /** 기준 명단 순서를 유지한다. */
  readonly participants: GameRosterBaseEntry[];
  readonly suspended: GameRosterSuspendedEntry[];
  readonly unavailable: GameRosterUnavailableEntry[];
  readonly excluded: GameRosterExcludedEntry[];
}

function coversKickoff(period: GameRosterUnavailabilityInput, kickoff: Date): boolean {
  const at = kickoff.getTime();
  return period.startsAt.getTime() <= at && at < period.endsAt.getTime();
}

/**
 * 경기 명단 = 기준 명단 − 출전정지 − 결장 기간 − 활성 EXCLUDE (Task 176).
 *
 * 한 사람이 여러 사유에 걸리면 **출전정지 > 결장 > 조정** 한 칸에만 넣는다. 정지는 팀이
 * 되돌릴 수 없는 사유라 먼저 보여야 하고, 결장은 기간으로 여러 경기를 덮는 사유라 경기 단위
 * 조정보다 앞선다.
 */
export function computeGameRoster(input: GameRosterComputationInput): GameRosterComputation {
  const activeAdjustmentByUser = new Map<string, GameRosterAdjustmentInput>();
  for (const adjustment of input.adjustments) {
    if (adjustment.revokedAt !== null) continue;
    if (!activeAdjustmentByUser.has(adjustment.userId)) {
      activeAdjustmentByUser.set(adjustment.userId, adjustment);
    }
  }

  const unavailabilityByUser = new Map<string, GameRosterUnavailabilityInput>();
  if (input.gameStartAt !== null) {
    const kickoff = input.gameStartAt;
    const covering = input.unavailabilities
      .filter((period) => period.revokedAt === null && coversKickoff(period, kickoff))
      .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime() || a.id.localeCompare(b.id));
    for (const period of covering) {
      if (!unavailabilityByUser.has(period.userId)) unavailabilityByUser.set(period.userId, period);
    }
  }

  const result: GameRosterComputation = { participants: [], suspended: [], unavailable: [], excluded: [] };
  for (const entry of input.base) {
    const verdict = input.suspensionVerdicts.get(entry.userId);
    if (verdict?.suspended === true) {
      result.suspended.push({ entry, reason: verdict.reason });
      continue;
    }
    const period = unavailabilityByUser.get(entry.userId);
    if (period !== undefined) {
      result.unavailable.push({
        entry,
        unavailabilityId: period.id,
        reason: period.reason,
        actorUserId: period.actorUserId,
        actorRole: period.actorRole,
        startsAt: period.startsAt,
        endsAt: period.endsAt,
      });
      continue;
    }
    const adjustment = activeAdjustmentByUser.get(entry.userId);
    if (adjustment !== undefined) {
      result.excluded.push({
        entry,
        adjustmentId: adjustment.id,
        reason: adjustment.reason,
        actorUserId: adjustment.actorUserId,
        actorRole: adjustment.actorRole,
        createdAt: adjustment.createdAt,
      });
      continue;
    }
    result.participants.push(entry);
  }
  return result;
}
