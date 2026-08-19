import { selectLatestLineupParticipants } from './latest-lineup-participants';

describe('selectLatestLineupParticipants', () => {
  it('keeps only the latest lineup revision independently for each side', () => {
    const participants = [
      { id: 'home-old', sideId: 'home', lineupId: 'home-1' },
      { id: 'home-new', sideId: 'home', lineupId: 'home-2' },
      { id: 'away-current', sideId: 'away', lineupId: 'away-3' },
      { id: 'away-current-2', sideId: 'away', lineupId: 'away-3' },
    ];
    const lineups = [
      { id: 'home-1', sideId: 'home', revision: 1 },
      { id: 'home-2', sideId: 'home', revision: 2 },
      { id: 'away-3', sideId: 'away', revision: 3 },
    ];

    expect(selectLatestLineupParticipants(participants, lineups).map((participant) => participant.id)).toEqual([
      'home-new',
      'away-current',
      'away-current-2',
    ]);
  });

  it('returns an empty list for a game without a saved lineup', () => {
    expect(selectLatestLineupParticipants([], [])).toEqual([]);
  });
});
