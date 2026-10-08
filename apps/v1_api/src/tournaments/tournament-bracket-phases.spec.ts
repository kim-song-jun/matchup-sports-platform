import { BRACKET_SOURCE_PHASES, acceptsBracketSource } from './tournament-bracket-phases';

describe('acceptsBracketSource — 바로 이전 단계만 연결할 수 있다', () => {
  it.each<[string, string]>([
    ['quarter', 'round16'],
    ['quarter', 'round12'],
    ['semi', 'quarter'],
    ['final', 'semi'],
    ['third_place', 'semi'],
  ])('%s 는 %s 의 경기를 원천으로 받는다', (target, source) => {
    expect(acceptsBracketSource(target, source)).toBe(true);
  });

  it.each<[string, string]>([
    ['semi', 'round16'],
    ['final', 'quarter'],
    ['third_place', 'quarter'],
    ['quarter', 'semi'],
    ['quarter', 'quarter'],
    ['quarter', 'group'],
    ['round12', 'round16'],
    ['round16', 'round12'],
    ['round16', 'quarter'],
    ['round16', 'group'],
  ])('%s 가 %s 를 원천으로 받으면 거절한다', (target, source) => {
    expect(acceptsBracketSource(target, source)).toBe(false);
  });

  it('16강은 첫 결선 단계라 원천을 받는 표 항목이 없다', () => {
    expect(BRACKET_SOURCE_PHASES).not.toHaveProperty('round16');
    expect(BRACKET_SOURCE_PHASES).not.toHaveProperty('round12');
  });

  it.each([[null, 'semi'], ['final', null], [undefined, undefined], ['unknown', 'semi']])(
    '단계를 모르면(%s, %s) 거절한다',
    (target, source) => {
      expect(acceptsBracketSource(target, source)).toBe(false);
    },
  );
});
