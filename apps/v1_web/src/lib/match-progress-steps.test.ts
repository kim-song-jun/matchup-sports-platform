import { describe, expect, it } from 'vitest';
import { periodProgressSteps, resultProgressSteps } from './match-progress-steps';

const TWO_PERIODS = [
  { number: 1, label: '전반' },
  { number: 2, label: '후반' },
];

function states(steps: ReturnType<typeof periodProgressSteps>) {
  return steps.map((step) => `${step.label}:${step.state}`);
}

describe('periodProgressSteps', () => {
  const base = { periods: TWO_PERIODS, livePeriodNumber: null, halftimePeriodNumber: null, regulationEnded: false };

  it('전반이 뛰는 중이면 전반이 현재이고 나머지는 남았다', () => {
    expect(states(periodProgressSteps({ ...base, livePeriodNumber: 1 }))).toEqual([
      '전반:current', '하프타임:todo', '후반:todo', '종료:todo',
    ]);
  });

  it('하프타임 중이면 전반은 지났고 하프타임이 현재다', () => {
    expect(states(periodProgressSteps({ ...base, halftimePeriodNumber: 2 }))).toEqual([
      '전반:done', '하프타임:current', '후반:todo', '종료:todo',
    ]);
  });

  it('후반이 뛰는 중이면 전반·하프타임은 지났다', () => {
    expect(states(periodProgressSteps({ ...base, livePeriodNumber: 2 }))).toEqual([
      '전반:done', '하프타임:done', '후반:current', '종료:todo',
    ]);
  });

  it('정규 시간이 끝나 경기 종료만 남았으면 종료가 현재다', () => {
    expect(states(periodProgressSteps({ ...base, regulationEnded: true }))).toEqual([
      '전반:done', '하프타임:done', '후반:done', '종료:current',
    ]);
  });

  it('위치를 알 수 없으면 지어내지 않고 전부 남은 것으로 둔다', () => {
    expect(states(periodProgressSteps(base)).every((label) => label.endsWith(':todo'))).toBe(true);
  });

  it('피리어드가 둘이 아니면 중간 단계 이름은 하프타임이 아니라 휴식이다', () => {
    const steps = periodProgressSteps({
      ...base,
      periods: [
        { number: 1, label: '1피리어드' },
        { number: 2, label: '2피리어드' },
        { number: 3, label: '3피리어드' },
      ],
      livePeriodNumber: 3,
    });

    expect(states(steps)).toEqual([
      '1피리어드:done', '휴식:done', '2피리어드:done', '휴식:done', '3피리어드:current', '종료:todo',
    ]);
  });

  it('피리어드 정보가 없으면 스트립을 만들지 않는다', () => {
    expect(periodProgressSteps({ ...base, periods: [] })).toEqual([]);
  });

  it('피리어드 번호 순서를 입력 순서와 무관하게 지킨다', () => {
    const steps = periodProgressSteps({ ...base, periods: [...TWO_PERIODS].reverse(), livePeriodNumber: 1 });

    expect(steps.map((step) => step.label)).toEqual(['전반', '하프타임', '후반', '종료']);
  });
});

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
