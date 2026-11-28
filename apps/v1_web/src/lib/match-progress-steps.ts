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
