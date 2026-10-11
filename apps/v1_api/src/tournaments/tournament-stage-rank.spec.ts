import { competitionStageRank } from './tournament-stage-rank';

describe('competitionStageRank', () => {
  it('조의 phase 가 단계 순서를 정한다', () => {
    const ranks = ['group', 'round16', 'quarter', 'semi', 'final'].map((phase) => competitionStageRank({ phase, round: 'x' }));
    expect(ranks).toEqual([0, 1, 3, 4, 5]);
  });

  it('phase 가 라운드 이름과 어긋나면 phase 를 따른다', () => {
    expect(competitionStageRank({ phase: 'group', round: '결승' })).toBe(0);
  });

  it('조 없는 토너먼트 경기는 라운드 이름으로 읽는다', () => {
    expect(competitionStageRank({ phase: null, round: '8강' })).toBe(3);
    expect(competitionStageRank({ phase: undefined, round: '준결승' })).toBe(4);
    expect(competitionStageRank({ phase: null, round: 'semifinal' })).toBe(4);
    expect(competitionStageRank({ phase: null, round: 'league_r3' })).toBe(0);
  });

  it('3·4위전은 결승과 같은 단계다', () => {
    expect(competitionStageRank({ phase: 'third_place', round: 'x' })).toBe(competitionStageRank({ phase: 'final', round: 'x' }));
  });

  it('단계를 알 수 없는 운영자 입력 라운드는 null 이다', () => {
    expect(competitionStageRank({ phase: null, round: '친선 한마당' })).toBeNull();
  });
});
