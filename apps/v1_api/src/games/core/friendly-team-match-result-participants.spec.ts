import { V1GameLineupState } from '@prisma/client';
import { hydrateFriendlyTeamMatchResultParticipants } from './friendly-team-match-result-participants';

describe('hydrateFriendlyTeamMatchResultParticipants', () => {
  it('preserves submitted home stats and appends the missing away appearance', () => {
    const home = {
      participantId: 'home-current',
      sideId: 'home',
      started: true,
      goals: 2,
      assists: 1,
      fouls: 0,
      cards: { yellow: 1, red: 0 },
      goalkeeper: false,
    };

    const result = hydrateFriendlyTeamMatchResultParticipants(
      [home],
      [
        { id: 'home-current', sideId: 'home', lineupId: 'home-2', position: 'FW' },
        { id: 'away-current', sideId: 'away', lineupId: 'away-1', position: 'GK' },
      ],
      [
        { id: 'home-2', sideId: 'home', revision: 2, state: V1GameLineupState.SUBMITTED },
        { id: 'away-1', sideId: 'away', revision: 1, state: V1GameLineupState.DRAFT },
      ],
    );

    expect(result).toEqual([
      home,
      {
        participantId: 'away-current',
        sideId: 'away',
        started: true,
        goals: 0,
        assists: 0,
        fouls: 0,
        cards: { yellow: 0, red: 0 },
        goalkeeper: true,
      },
    ]);
  });

  it('uses the last submitted revision instead of a later unactioned draft', () => {
    const result = hydrateFriendlyTeamMatchResultParticipants(
      [],
      [
        { id: 'away-submitted', sideId: 'away', lineupId: 'away-1', position: null },
        { id: 'away-draft', sideId: 'away', lineupId: 'away-2', position: null },
      ],
      [
        { id: 'away-1', sideId: 'away', revision: 1, state: V1GameLineupState.SUBMITTED },
        { id: 'away-2', sideId: 'away', revision: 2, state: V1GameLineupState.DRAFT },
      ],
    );

    expect(result.map((participant) => participant.participantId)).toEqual(['away-submitted']);
  });

  it('does not duplicate a client-supplied roster participant', () => {
    const supplied = {
      participantId: 'away-current',
      sideId: 'away',
      goals: 1,
      cards: { yellow: 0, red: 0 },
      goalkeeper: false,
    };
    const result = hydrateFriendlyTeamMatchResultParticipants(
      [supplied],
      [{ id: 'away-current', sideId: 'away', lineupId: 'away-1', position: null }],
      [{ id: 'away-1', sideId: 'away', revision: 1, state: V1GameLineupState.LOCKED }],
    );

    expect(result).toEqual([supplied]);
  });
});
