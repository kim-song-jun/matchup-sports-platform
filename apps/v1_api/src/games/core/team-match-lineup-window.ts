import { V1GameEventType, V1GameLineupState, V1GameState } from '@prisma/client';

export const TEAM_MATCH_ROSTER_DEPENDENT_EVENT_TYPES = [
  V1GameEventType.GOAL,
  V1GameEventType.OWN_GOAL,
  V1GameEventType.CARD,
  V1GameEventType.FOUL,
  V1GameEventType.SUBSTITUTION,
  // 현재 기록 콘솔의 파울 주석과 기존 이벤트 되돌리기는 CORRECTION으로 저장된다.
  // 둘 다 명단 참가자와 이미 기록된 사실을 참조하므로 명단 잠금 대상이다.
  V1GameEventType.CORRECTION,
] as const;

export function isTeamMatchRosterDependentEventType(type: V1GameEventType): boolean {
  return (TEAM_MATCH_ROSTER_DEPENDENT_EVENT_TYPES as readonly V1GameEventType[]).includes(type);
}

export interface TeamMatchLineupRevisionState {
  readonly id: string;
  readonly sideId: string;
  readonly revision: number;
  readonly state: V1GameLineupState;
}

export function latestTeamMatchLineupBySide(
  lineups: readonly TeamMatchLineupRevisionState[],
): Map<string, TeamMatchLineupRevisionState> {
  const latest = new Map<string, TeamMatchLineupRevisionState>();
  for (const lineup of lineups) {
    const current = latest.get(lineup.sideId);
    if (current === undefined || lineup.revision > current.revision) latest.set(lineup.sideId, lineup);
  }
  return latest;
}

export function areLatestTeamMatchLineupsSubmitted(
  sideIds: readonly string[],
  lineups: readonly TeamMatchLineupRevisionState[],
): boolean {
  if (sideIds.length !== 2) return false;
  const latest = latestTeamMatchLineupBySide(lineups);
  return sideIds.every((sideId) => {
    const state = latest.get(sideId)?.state;
    return state === V1GameLineupState.SUBMITTED || state === V1GameLineupState.LOCKED;
  });
}

export type TeamMatchLineupLockReason =
  | 'terminal'
  | 'records_exist'
  | 'active_lineups_complete'
  | null;

export function teamMatchLineupLockReason(input: {
  gameState: V1GameState;
  sideIds: readonly string[];
  lineups: readonly TeamMatchLineupRevisionState[];
  hasRosterDependentRecord: boolean;
}): TeamMatchLineupLockReason {
  if (input.gameState === V1GameState.ENDED || input.gameState === V1GameState.CANCELLED) {
    return 'terminal';
  }
  if (input.hasRosterDependentRecord) return 'records_exist';
  if (
    (input.gameState === V1GameState.LIVE || input.gameState === V1GameState.PAUSED) &&
    areLatestTeamMatchLineupsSubmitted(input.sideIds, input.lineups)
  ) {
    return 'active_lineups_complete';
  }
  return null;
}
