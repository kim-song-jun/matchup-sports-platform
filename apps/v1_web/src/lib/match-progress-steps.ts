export type ProgressStepState = 'done' | 'current' | 'todo';

export interface ProgressStep {
  readonly key: string;
  readonly label: string;
  readonly state: ProgressStepState;
}

function withStates(steps: ReadonlyArray<{ key: string; label: string }>, currentIndex: number | null): ProgressStep[] {
  return steps.map((step, index) => ({
    ...step,
    state: currentIndex === null ? 'todo' : index < currentIndex ? 'done' : index === currentIndex ? 'current' : 'todo',
  }));
}

/**
 * 진행 중 경기의 피리어드 스트립 — 전반 · 하프타임 · 후반 · 종료.
 *
 * 피리어드 사이에는 휴식 단계를 끼운다(피리어드가 정확히 둘일 때만 "하프타임", 그 밖에는 "휴식").
 * 현재 위치는 셋 중 하나다: 뛰고 있는 피리어드 · 쉬는 중인 휴식(다음 피리어드가 HALFTIME) · 정규 시간이
 * 끝나 "경기 종료"만 남은 종료 단계. 어느 것도 아니면 위치를 지어내지 않고 전부 예정으로 둔다.
 */
export function periodProgressSteps(input: {
  readonly periods: ReadonlyArray<{ number: number; label: string }>;
  readonly livePeriodNumber: number | null;
  readonly halftimePeriodNumber: number | null;
  readonly regulationEnded: boolean;
}): ProgressStep[] {
  const periods = [...input.periods].sort((left, right) => left.number - right.number);
  if (periods.length === 0) return [];
  const breakLabel = periods.length === 2 ? '하프타임' : '휴식';
  const raw: Array<{ key: string; label: string }> = [];
  periods.forEach((period, index) => {
    if (index > 0) raw.push({ key: `break-before-${period.number}`, label: breakLabel });
    raw.push({ key: `period-${period.number}`, label: period.label });
  });
  raw.push({ key: 'end', label: '종료' });

  const currentKey =
    input.livePeriodNumber !== null
      ? `period-${input.livePeriodNumber}`
      : input.halftimePeriodNumber !== null
        ? `break-before-${input.halftimePeriodNumber}`
        : input.regulationEnded
          ? 'end'
          : null;
  const currentIndex = currentKey === null ? -1 : raw.findIndex((step) => step.key === currentKey);
  return withStates(raw, currentIndex === -1 ? null : currentIndex);
}

/**
 * 끝난 경기의 결과 스트립 — 예정 · 진행 · 결과 확인 · 확정. 경기가 끝났으니 앞 두 단계는 지나갔고,
 * 공식 결과가 서기 전까지 "결과 확인"이 현재 단계다. 확정되면 모든 단계가 지난 것이다.
 */
export function resultProgressSteps(input: { readonly official: boolean }): ProgressStep[] {
  return withStates(
    [
      { key: 'scheduled', label: '예정' },
      { key: 'played', label: '진행' },
      { key: 'review', label: '결과 확인' },
      { key: 'official', label: '확정' },
    ],
    input.official ? 4 : 2,
  );
}
