import { describe, expect, it } from 'vitest';
import { breakLabelBefore, matchProgressSteps, resultProgressSteps } from './match-progress-steps';

const REGULAR_2 = [
  { number: 1, label: '전반' },
  { number: 2, label: '후반' },
];
const WITH_EXTRA = [...REGULAR_2, { number: 3, label: '연장 전반' }, { number: 4, label: '연장 후반' }];

const NO_PENALTY = { allowPenaltyShootout: false, penaltyShootoutEligible: false } as const;
const FINAL = { allowPenaltyShootout: true, penaltyShootoutEligible: false } as const;

function line(steps: ReturnType<typeof matchProgressSteps>) {
  return steps.map((step) => `${step.label}:${step.state}`);
}

describe('breakLabelBefore', () => {
  it('정규 구간이 둘일 때 첫째·둘째 사이만 하프타임이다', () => {
    expect(breakLabelBefore(2, 2)).toBe('하프타임');
  });

  it('연장 앞뒤와 연장 전·후반 사이는 휴식이다', () => {
    expect(breakLabelBefore(3, 2)).toBe('휴식');
    expect(breakLabelBefore(4, 2)).toBe('휴식');
  });

  it('정규 구간이 셋이면 어느 사이도 하프타임이 아니다', () => {
    expect(breakLabelBefore(2, 3)).toBe('휴식');
    expect(breakLabelBefore(3, 3)).toBe('휴식');
  });

  it('정규 구간 수를 모르면 전·후반으로 본다 — 구간 이름과 같은 기준', () => {
    expect(breakLabelBefore(2, null)).toBe('하프타임');
  });
});

describe('matchProgressSteps', () => {
  describe('단판', () => {
    const periods = [{ number: 1, label: '경기' }];

    it('뛰는 동안 경기가 지금이고 종료가 남았다 — 쉬는 단계가 없다', () => {
      expect(
        line(matchProgressSteps({ periods, regularPeriodCount: 1, livePeriodNumber: 1, breakBeforePeriodNumber: null, regulationEnded: false, ...NO_PENALTY })),
      ).toEqual(['경기:current', '종료:todo']);
    });

    it('정규 시간이 끝나면 종료가 지금이다', () => {
      expect(
        line(matchProgressSteps({ periods, regularPeriodCount: 1, livePeriodNumber: null, breakBeforePeriodNumber: null, regulationEnded: true, ...NO_PENALTY })),
      ).toEqual(['경기:done', '종료:current']);
    });
  });

  describe('전반·후반', () => {
    const base = { periods: REGULAR_2, regularPeriodCount: 2, ...NO_PENALTY };

    it('단계는 전반 · 하프타임 · 후반 · 종료 네 개다', () => {
      const steps = matchProgressSteps({ ...base, livePeriodNumber: 1, breakBeforePeriodNumber: null, regulationEnded: false });
      expect(steps.map((step) => step.label)).toEqual(['전반', '하프타임', '후반', '종료']);
    });

    it('전반을 뛰는 중이면 전반이 지금이다', () => {
      expect(line(matchProgressSteps({ ...base, livePeriodNumber: 1, breakBeforePeriodNumber: null, regulationEnded: false }))).toEqual([
        '전반:current', '하프타임:todo', '후반:todo', '종료:todo',
      ]);
    });

    it('후반이 HALFTIME 이면 하프타임이 지금이다', () => {
      expect(line(matchProgressSteps({ ...base, livePeriodNumber: null, breakBeforePeriodNumber: 2, regulationEnded: false }))).toEqual([
        '전반:done', '하프타임:current', '후반:todo', '종료:todo',
      ]);
    });

    it('후반을 뛰는 중이면 전반·하프타임이 지났다', () => {
      expect(line(matchProgressSteps({ ...base, livePeriodNumber: 2, breakBeforePeriodNumber: null, regulationEnded: false }))).toEqual([
        '전반:done', '하프타임:done', '후반:current', '종료:todo',
      ]);
    });

    it('정규 시간이 끝나면 종료가 지금이다', () => {
      expect(line(matchProgressSteps({ ...base, livePeriodNumber: null, breakBeforePeriodNumber: null, regulationEnded: true }))).toEqual([
        '전반:done', '하프타임:done', '후반:done', '종료:current',
      ]);
    });

    it('지금 위치를 알 수 없으면 위치를 지어내지 않고 모두 남은 단계로 둔다', () => {
      expect(line(matchProgressSteps({ ...base, livePeriodNumber: null, breakBeforePeriodNumber: null, regulationEnded: false }))).toEqual([
        '전반:todo', '하프타임:todo', '후반:todo', '종료:todo',
      ]);
    });

    it('구간 목록이 뒤섞여 와도 번호 순서로 놓는다', () => {
      const steps = matchProgressSteps({
        ...base,
        periods: [REGULAR_2[1], REGULAR_2[0]],
        livePeriodNumber: 2,
        breakBeforePeriodNumber: null,
        regulationEnded: false,
      });
      expect(steps.map((step) => step.label)).toEqual(['전반', '하프타임', '후반', '종료']);
    });

    it('구간이 없으면 단계도 없다', () => {
      expect(matchProgressSteps({ ...base, periods: [], livePeriodNumber: null, breakBeforePeriodNumber: null, regulationEnded: false })).toEqual([]);
    });
  });

  describe('연장 포함', () => {
    const base = { periods: WITH_EXTRA, regularPeriodCount: 2, ...NO_PENALTY };

    it('하프타임은 전·후반 사이 하나뿐이고 나머지 사이는 휴식이다 — 단계 여덟 개', () => {
      const steps = matchProgressSteps({ ...base, livePeriodNumber: 1, breakBeforePeriodNumber: null, regulationEnded: false });
      expect(steps.map((step) => step.label)).toEqual(['전반', '하프타임', '후반', '휴식', '연장 전반', '휴식', '연장 후반', '종료']);
    });

    it('후반 뒤 쉬는 중(연장 전반이 HALFTIME)이면 후반 뒤 휴식이 지금이다', () => {
      const steps = matchProgressSteps({ ...base, livePeriodNumber: null, breakBeforePeriodNumber: 3, regulationEnded: false });
      expect(steps.find((step) => step.state === 'current')).toMatchObject({ key: 'break-before-3', label: '휴식' });
      expect(steps.filter((step) => step.state === 'done').map((step) => step.label)).toEqual(['전반', '하프타임', '후반']);
    });

    it('연장 전반을 뛰는 중이면 앞 다섯 단계가 지났다', () => {
      expect(line(matchProgressSteps({ ...base, livePeriodNumber: 3, breakBeforePeriodNumber: null, regulationEnded: false }))).toEqual([
        '전반:done', '하프타임:done', '후반:done', '휴식:done', '연장 전반:current', '휴식:todo', '연장 후반:todo', '종료:todo',
      ]);
    });

    it('연장 후반까지 끝나면 종료가 지금이다', () => {
      expect(line(matchProgressSteps({ ...base, livePeriodNumber: null, breakBeforePeriodNumber: null, regulationEnded: true })).slice(-2)).toEqual([
        '연장 후반:done', '종료:current',
      ]);
    });
  });

  describe('정규 구간이 셋', () => {
    it('쉬는 단계는 모두 휴식이다', () => {
      const steps = matchProgressSteps({
        periods: [1, 2, 3].map((number) => ({ number, label: `${number}번째 경기 시간` })),
        regularPeriodCount: 3,
        livePeriodNumber: 1,
        breakBeforePeriodNumber: null,
        regulationEnded: false,
        ...NO_PENALTY,
      });
      expect(steps.map((step) => step.label)).toEqual(['1번째 경기 시간', '휴식', '2번째 경기 시간', '휴식', '3번째 경기 시간', '종료']);
    });
  });

  describe('결선 승부차기', () => {
    const base = { periods: REGULAR_2, regularPeriodCount: 2 };

    it('정규가 끝나기 전에는 조건부 단계로 종료 앞에 놓인다', () => {
      expect(
        line(matchProgressSteps({ ...base, ...FINAL, livePeriodNumber: 2, breakBeforePeriodNumber: null, regulationEnded: false })),
      ).toEqual(['전반:done', '하프타임:done', '후반:current', '승부차기:conditional', '종료:todo']);
    });

    it('연장까지 있으면 단계가 아홉 개다', () => {
      const steps = matchProgressSteps({
        periods: WITH_EXTRA,
        regularPeriodCount: 2,
        ...FINAL,
        livePeriodNumber: 3,
        breakBeforePeriodNumber: null,
        regulationEnded: false,
      });
      expect(steps).toHaveLength(9);
      expect(steps.map((step) => step.label).slice(-3)).toEqual(['연장 후반', '승부차기', '종료']);
    });

    it('정규가 동점으로 끝나 승부차기 차례면 승부차기가 지금이다', () => {
      expect(
        line(
          matchProgressSteps({
            ...base,
            allowPenaltyShootout: true,
            penaltyShootoutEligible: true,
            livePeriodNumber: null,
            breakBeforePeriodNumber: null,
            regulationEnded: true,
          }),
        ),
      ).toEqual(['전반:done', '하프타임:done', '후반:done', '승부차기:current', '종료:todo']);
    });

    it('정규가 동점이 아니게 끝나면 일어나지 않은 단계라 목록에서 뺀다', () => {
      const steps = matchProgressSteps({ ...base, ...FINAL, livePeriodNumber: null, breakBeforePeriodNumber: null, regulationEnded: true });
      expect(steps.map((step) => step.label)).toEqual(['전반', '하프타임', '후반', '종료']);
      expect(steps.at(-1)?.state).toBe('current');
    });

    it('조별 경기처럼 승부차기를 허용하지 않으면 처음부터 없다', () => {
      const steps = matchProgressSteps({ ...base, ...NO_PENALTY, livePeriodNumber: 1, breakBeforePeriodNumber: null, regulationEnded: false });
      expect(steps.some((step) => step.key === 'penalty')).toBe(false);
    });

    it('정규가 끝나지 않았다면 승부차기 차례(eligible)가 와도 지금 단계로 올리지 않는다', () => {
      const steps = matchProgressSteps({
        ...base,
        allowPenaltyShootout: true,
        penaltyShootoutEligible: true,
        livePeriodNumber: 2,
        breakBeforePeriodNumber: null,
        regulationEnded: false,
      });
      expect(steps.find((step) => step.key === 'penalty')?.state).toBe('conditional');
      expect(steps.find((step) => step.state === 'current')?.label).toBe('후반');
    });
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
