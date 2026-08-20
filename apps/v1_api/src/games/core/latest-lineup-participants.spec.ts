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

  it('drops participants whose lineup row is missing instead of keeping them all', () => {
    // `undefined === undefined` 로 통과시키던 회귀 방어: 라인업이 하나도 없으면
    // 최신 리비전을 확정할 수 없으므로 어떤 participant 도 남지 않아야 한다.
    const participants = [
      { id: 'orphan-1', sideId: 'home', lineupId: 'home-1' },
      { id: 'orphan-2', sideId: 'away', lineupId: 'away-1' },
    ];

    expect(selectLatestLineupParticipants(participants, [])).toEqual([]);
  });
});
