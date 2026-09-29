import { tournamentRoundLabel } from './tournament-round-label';

describe('tournamentRoundLabel', () => {
  it.each([
    ['league_r1', '조별리그 1라운드'],
    ['league_r12', '조별리그 12라운드'],
    ['semi', '4강'],
    ['final', '결승'],
    ['third_place', '3·4위전'],
    [' FINAL ', '결승'],
  ])('%s → %s', (round, label) => {
    expect(tournamentRoundLabel(round)).toBe(label);
  });

  it('운영자가 한국어로 넣은 라운드와 모르는 값은 그대로 둔다', () => {
    expect(tournamentRoundLabel('준결승')).toBe('준결승');
    expect(tournamentRoundLabel('league_round_2')).toBe('league_round_2');
  });
});
