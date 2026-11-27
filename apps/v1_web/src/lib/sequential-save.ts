import { josa } from '@/lib/korean';

/** 한 번의 「저장」이 차례로 부르는 호출 하나. `label` 은 실패·부분 저장 안내에 쓰는 이름이다. */
export interface SaveStep {
  readonly key: string;
  readonly label: string;
  readonly run: () => Promise<void>;
}

/**
 * key 에 보낼 내용까지 담은 단계. 일부만 저장된 뒤 값을 다시 고치면 key 가 달라져, 이미 끝난 호출로 건너뛰지 않는다.
 */
export function saveStep(name: string, label: string, payload: unknown, run: () => Promise<void>): SaveStep {
  return { key: `${name}:${JSON.stringify(payload)}`, label, run };
}

export type SaveOutcome =
  | { status: 'saved'; done: readonly string[] }
  | { status: 'failed'; done: readonly string[]; failedKey: string; message: string };

/**
 * 순서대로 실행하고 첫 실패에서 멈춘다. `completed` 에 든 key 는 건너뛴다 — 다시 누른 저장이 끝난 호출을 또 보내지 않게.
 * `done` 은 건너뛴 것과 이번에 끝난 것을 단계 순서로 담는다.
 */
export async function runSaveSteps(
  steps: readonly SaveStep[],
  completed: ReadonlySet<string>,
  toReason: (error: unknown, step: SaveStep) => string,
): Promise<SaveOutcome> {
  const done: SaveStep[] = [];
  for (const step of steps) {
    if (!completed.has(step.key)) {
      try {
        await step.run();
      } catch (error) {
        return {
          status: 'failed',
          done: done.map((finished) => finished.key),
          failedKey: step.key,
          message: partialSaveMessage(done.map((finished) => finished.label), step.label, toReason(error, step)),
        };
      }
    }
    done.push(step);
  }
  return { status: 'saved', done: done.map((finished) => finished.key) };
}

/** 앞선 호출이 저장된 뒤 실패했으면 어디까지 됐는지 붙인다. 저장된 것이 없으면 사유만 돌려준다. */
export function partialSaveMessage(doneLabels: readonly string[], failedLabel: string, reason: string): string {
  const saved = [...new Set(doneLabels)].join('·');
  if (!saved) return reason;
  return `${josa(saved, ['은', '는'])} 저장됐고, ${failedLabel} 저장에 실패했어요. ${reason}`;
}
