import { V1GameEventType, V1GameLineupState, V1GameState } from '@prisma/client';
import {
  areLatestTeamMatchLineupsSubmitted,
  isTeamMatchRosterDependentEventType,
  teamMatchLineupLockReason,
} from './team-match-lineup-window';

const sides = ['home', 'away'];
const row = (sideId: string, revision: number, state: V1GameLineupState) => ({
  id: `${sideId}-${revision}`,
  sideId,
  revision,
  state,
});

describe('team-match live lineup recovery window', () => {
  it('uses each side latest revision instead of an older submitted revision', () => {
    const lineups = [
      row('home', 1, V1GameLineupState.SUBMITTED),
      row('home', 2, V1GameLineupState.DRAFT),
      row('away', 1, V1GameLineupState.SUBMITTED),
    ];
    expect(areLatestTeamMatchLineupsSubmitted(sides, lineups)).toBe(false);
    expect(teamMatchLineupLockReason({
      gameState: V1GameState.LIVE,
      sideIds: sides,
      lineups,
      hasRosterDependentRecord: false,
    })).toBeNull();
  });

  it('keeps scheduled games editable even after their wall-clock kickoff', () => {
    expect(teamMatchLineupLockReason({
      gameState: V1GameState.SCHEDULED,
      sideIds: sides,
      lineups: sides.map((side) => row(side, 1, V1GameLineupState.SUBMITTED)),
      hasRosterDependentRecord: false,
    })).toBeNull();
  });

  it('locks an active game when both latest lineups are submitted', () => {
    expect(teamMatchLineupLockReason({
      gameState: V1GameState.PAUSED,
      sideIds: sides,
      lineups: sides.map((side) => row(side, 2, V1GameLineupState.SUBMITTED)),
      hasRosterDependentRecord: false,
    })).toBe('active_lineups_complete');
  });

  it('locks as soon as a roster-dependent record exists', () => {
    expect(teamMatchLineupLockReason({
      gameState: V1GameState.LIVE,
      sideIds: sides,
      lineups: [row('home', 1, V1GameLineupState.DRAFT)],
      hasRosterDependentRecord: true,
    })).toBe('records_exist');
  });

  it('classifies every participant-dependent event as a record', () => {
    for (const type of [
      V1GameEventType.GOAL,
      V1GameEventType.OWN_GOAL,
      V1GameEventType.CARD,
      V1GameEventType.FOUL,
      V1GameEventType.SUBSTITUTION,
      V1GameEventType.CORRECTION,
    ]) {
      expect(isTeamMatchRosterDependentEventType(type)).toBe(true);
    }
    expect(isTeamMatchRosterDependentEventType(V1GameEventType.PERIOD_START)).toBe(false);
  });
});
