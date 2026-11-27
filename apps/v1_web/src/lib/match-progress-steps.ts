/**
 * `conditional` 은 아직 일어날지 모르는 단계다 — 정규 시간이 동점으로 끝나야 하는 승부차기.
 * 일어나지 않기로 정해지면 단계 자체를 목록에서 뺀다.
 */
export type ProgressStepState = 'done' | 'current' | 'todo' | 'conditional';

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
 * 구간 앞의 쉬는 단계 이름. 정규 구간이 둘일 때 첫째·둘째 사이만 「하프타임」이고, 그 밖의 사이
 * (후반↔연장, 연장 전반↔후반, 정규 구간이 셋 이상인 경기)는 「휴식」이다. 정규 구간 수를 모르면
 * `periodLabel` 과 같게 전·후반으로 본다.
 */
export function breakLabelBefore(periodNumber: number, regularPeriodCount: number | null): string {
  return periodNumber === 2 && (regularPeriodCount ?? 2) === 2 ? '하프타임' : '휴식';
}

/**
 * 진행 중 경기의 단계 줄 — 구간마다 하나, 구간 사이마다 쉬는 단계 하나, 결선이면 승부차기, 마지막에 종료.
 *
 * 지금 위치는 셋 중 하나다: 뛰고 있는 구간 · 쉬는 중인 구간 앞 쉬는 단계(그 구간이 HALFTIME) · 정규 시간이
 * 끝난 뒤(승부차기 차례면 승부차기, 아니면 종료). 어느 것도 아니면 위치를 지어내지 않고 모두 남은 단계로 둔다.
 *
 * 승부차기(`allowPenaltyShootout`, 결선)는 정규가 끝나기 전에는 `conditional` 이다. 정규가 끝났는데
 * 동점이 아니면(`penaltyShootoutEligible` 이 거짓) 일어나지 않은 단계라 목록에서 뺀다.
 */
export function matchProgressSteps(input: {
  readonly periods: ReadonlyArray<{ number: number; label: string }>;
  readonly regularPeriodCount: number | null;
  readonly livePeriodNumber: number | null;
  readonly breakBeforePeriodNumber: number | null;
  readonly regulationEnded: boolean;
  readonly allowPenaltyShootout: boolean;
  readonly penaltyShootoutEligible: boolean;
}): ProgressStep[] {
  const periods = [...input.periods].sort((left, right) => left.number - right.number);
  if (periods.length === 0) return [];

  const atPenalty = input.allowPenaltyShootout && input.regulationEnded && input.penaltyShootoutEligible;
  const withPenalty = input.allowPenaltyShootout && (!input.regulationEnded || input.penaltyShootoutEligible);

  const raw: Array<{ key: string; label: string }> = [];
  periods.forEach((period, index) => {
    if (index > 0) {
      raw.push({ key: `break-before-${period.number}`, label: breakLabelBefore(period.number, input.regularPeriodCount) });
    }
    raw.push({ key: `period-${period.number}`, label: period.label });
  });
  if (withPenalty) raw.push({ key: 'penalty', label: '승부차기' });
  raw.push({ key: 'end', label: '종료' });

  const currentKey =
    input.livePeriodNumber !== null
      ? `period-${input.livePeriodNumber}`
      : input.breakBeforePeriodNumber !== null
        ? `break-before-${input.breakBeforePeriodNumber}`
        : input.regulationEnded
          ? atPenalty
            ? 'penalty'
            : 'end'
          : null;
  const found = currentKey === null ? -1 : raw.findIndex((step) => step.key === currentKey);
  const currentIndex = found === -1 ? null : found;

  return withStates(raw, currentIndex).map((step) =>
    step.key === 'penalty' && step.state !== 'current' ? { ...step, state: 'conditional' } : step,
  );
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
