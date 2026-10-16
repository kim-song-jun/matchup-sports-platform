import { serializeTournamentTeamMatchBracket, type TournamentTeamMatchBracketRow } from './tournament-team-match-bracket.query';

function row() {
  const stamp = new Date('2026-10-17T00:00:00Z');
  return { teamMatchId: 'match', tournamentId: 't', groupId: 'qf', round: '8강', fixtureNumber: 5, legNumber: 1,
    parentTeamMatchId: null, homeRegistrationId: null, awayRegistrationId: null, homeDisplayLabel: null, awayDisplayLabel: null,
    advancementTargets: [{ sourceTeamMatchId: 'r12-match', sourceOutcome: 'WINNER', targetSide: 'AWAY' }],
    createdAt: stamp, updatedAt: stamp, homeRegistration: null, awayRegistration: null,
    teamMatch: { startAt: new Date('2026-10-25T05:00:00Z'), placeName: 'A구장', fieldId: 'field-a', status: 'matched', updatedAt: stamp,
      homeSlotId: 'bye', awaySlotId: null, homeSlot: { kind: 'BYE', displayLabel: '조 1위 중 5위' }, awaySlot: null, game: null } };
}

describe('shared bracket fixture query', () => {
  it('returns the existing canonical time and field without canvas-specific data or migration', () => {
    const result = serializeTournamentTeamMatchBracket(row() as unknown as TournamentTeamMatchBracketRow);
    expect(result).toMatchObject({ id: 'match', scheduledAt: '2026-10-25T05:00:00.000Z', venue: 'A구장', fieldId: 'field-a', homeDisplayLabel: '조 1위 중 5위' });
  });
  it('reads a BYE override from the shared slot, and clearing it restores automatic behavior', () => {
    const input = row();
    input.homeDisplayLabel = 'stale side copy' as never;
    input.teamMatch.homeSlot.displayLabel = null as never;
    expect(serializeTournamentTeamMatchBracket(input as unknown as TournamentTeamMatchBracketRow).homeDisplayLabel).toBeNull();
  });
  it('retains stable identity and actual advancement edges when number and presentation change', () => {
    const input = row(); input.fixtureNumber = 25; input.awayDisplayLabel = '준결승 A 승자' as never;
    const result = serializeTournamentTeamMatchBracket(input as unknown as TournamentTeamMatchBracketRow);
    expect(result).toMatchObject({ id: 'match', fixtureNumber: 25, awayDisplayLabel: '준결승 A 승자', homeSlotId: 'bye', bracketSources: [{ fixtureId: 'r12-match', outcome: 'WINNER', side: 'AWAY' }] });
  });
});
