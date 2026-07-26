import { describe, expect, it } from 'vitest';
import { getTournamentRosterNextStep } from './tournament-roster-next-step';

describe('getTournamentRosterNextStep', () => {
  it('builds the registration roster route and states the required roster range', () => {
    const step = getTournamentRosterNextStep({
      tournamentId: 'tournament-1',
      registrationId: 'registration-1',
      minPlayers: 5,
      maxPlayers: 9,
    });

    expect(step.href).toBe('/tournaments/tournament-1/registrations/registration-1/roster');
    expect(step.rosterRangeLabel).toBe('선수단 5~9명');
    expect(step.body).toContain('입금 확인을 기다리는 동안');
    expect(step.body).toContain('최소 5명');
  });
});
