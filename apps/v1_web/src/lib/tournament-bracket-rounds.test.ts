import { describe, expect, it } from 'vitest';
import { BRACKET_SOURCE_PHASES, byeRound } from './tournament-bracket-rounds';

describe('byeRound — 부전승이 가능한 단계', () => {
  it('12강·8강·4강만 부전승 단계이고 다음 단계가 이어진다', () => {
    expect(byeRound('round12')).toMatchObject({ label: '12강', next: 'quarter' });
    expect(byeRound('quarter')).toMatchObject({ label: '8강', next: 'semi' });
    expect(byeRound('semi')).toMatchObject({ label: '4강', next: 'final' });
  });

  it('16강은 부전승이 없다 (12강 전용 부전승이 16강으로 번지지 않는다)', () => {
    expect(byeRound('round16')).toBeUndefined();
    expect(byeRound('final')).toBeUndefined();
    expect(byeRound('group')).toBeUndefined();
  });
});

describe('BRACKET_SOURCE_PHASES — 서버 tournament-bracket-phases.ts 와 같은 표', () => {
  it('8강은 16강·12강을, 4강은 8강을, 결승·3·4위전은 4강을 원천으로 받는다', () => {
    expect(BRACKET_SOURCE_PHASES).toEqual({
      quarter: ['round16', 'round12'], semi: ['quarter'], final: ['semi'], third_place: ['semi'],
    });
  });
});
