import { competitionMatchLabel, tournamentRoundLabel, type CompetitionMatchLabelInput } from './tournament-round-label';

describe('tournamentRoundLabel', () => {
  it.each([
    ['league_r1', '조별리그 1라운드'],
    ['league_r12', '조별리그 12라운드'],
    ['round16', '16강'],
    ['16강', '16강'],
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

// 웹 tournament-round-label.test.ts 의 competitionMatchLabel 표와 같다 — 한쪽만 고치면 알림과 화면이 경기를 다르게 부른다.
describe('competitionMatchLabel', () => {
  it.each<[string, CompetitionMatchLabelInput, string]>([
    ['조 + 라운드(W9 실측: 2팀 조 2회전)', { groupName: 'A조', round: 'league_r2', legNumber: 2 }, 'A조 · 조별리그 2라운드'],
    ['조 이름이 머리에 있는 묶음 안', { groupName: 'A조', round: 'league_r2', legNumber: 2, withinGroup: true }, '조별리그 2라운드'],
    ['조 없는 결선', { groupName: null, round: 'semi', legNumber: 1 }, '4강'],
    ['결선 조(단계 이름이 곧 조 이름)', { groupName: '4강', round: '4강', legNumber: 1 }, '4강'],
    ['16강은 결선이라 조 이름을 붙이지 않는다', { groupName: '16강', round: 'round16' }, '16강'],
    ['16강 2차전은 차수만 붙는다', { groupName: '16강', round: '16강', legNumber: 2 }, '16강 2차'],
    ['결선 2차전', { groupName: null, round: 'semi', legNumber: 2 }, '4강 2차'],
    ['시드의 조별 키', { groupName: 'B조', round: 'group', legNumber: 1 }, 'B조 · 조별리그'],
    ['어드민이 고른 조별 라운드', { groupName: 'A조', round: '조별 3라운드' }, 'A조 · 조별 3라운드'],
    ['빈 조 이름', { groupName: '  ', round: 'league_r1' }, '조별리그 1라운드'],
    ['정규 리그 주차', { groupName: null, round: '3주차', legNumber: 1 }, '3주차'],
    ['조가 있는 예선(운영자 입력 라운드)', { groupName: 'A조', round: '예선' }, 'A조 · 예선'],
    ['조 안의 결선 키', { groupName: '본선', round: 'final' }, '결승'],
    ['조 안의 N강', { groupName: 'A조', round: '8강' }, '8강'],
  ])('%s', (_case, input, label) => {
    expect(competitionMatchLabel(input)).toBe(label);
  });
});
