import { describe, expect, it } from 'vitest';
import { resultProgressSteps } from './match-progress-steps';

describe('resultProgressSteps', () => {
  it('끝났지만 공식 결과 전이면 결과 확인이 현재다', () => {
    expect(resultProgressSteps({ official: false }).map((step) => `${step.label}:${step.state}`)).toEqual([
      '예정:done', '진행:done', '결과 확인:current', '확정:todo',
    ]);
  });

  it('공식 결과가 서면 모든 단계가 지났다', () => {
    expect(resultProgressSteps({ official: true }).every((step) => step.state === 'done')).toBe(true);
  });
});
