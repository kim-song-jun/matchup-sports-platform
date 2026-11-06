import { describe, expect, it } from 'vitest';
import { BRACKET_SOURCE_PHASES, byeRound } from './tournament-bracket-rounds';

describe('byeRound — 부전승이 가능한 단계', () => {
  it('결승 이전 부전승 단계의 다음 단계가 이어진다', () => {
    expect(byeRound('round12')).toMatchObject({ label: '12강', next: 'quarter' });
    expect(byeRound('quarter')).toMatchObject({ label: '8강', next: 'semi' });
    expect(byeRound('semi')).toMatchObject({ label: '4강', next: 'final' });
  });

  it('64강·32강·16강 부전승은 다음 단계로 연결되고 결승·조별에는 없다', () => {
    expect(byeRound('round64')).toMatchObject({ next: 'round32', positions: 64 });
    expect(byeRound('round32')).toMatchObject({ next: 'round16', positions: 32 });
    expect(byeRound('round16')).toMatchObject({ next: 'quarter', positions: 16 });
    expect(byeRound('final')).toBeUndefined();
    expect(byeRound('group')).toBeUndefined();
  });
});

describe('BRACKET_SOURCE_PHASES — 서버 tournament-bracket-phases.ts 와 같은 표', () => {
  it('8강은 16강·12강을, 4강은 8강을, 결승·3·4위전은 4강을 원천으로 받는다', () => {
    expect(BRACKET_SOURCE_PHASES).toEqual({
      round32: ['round64'], round16: ['round32'], quarter: ['round16', 'round12'], semi: ['quarter'], final: ['semi'], third_place: ['semi'],
    });
  });
});
