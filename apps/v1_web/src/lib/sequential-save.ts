import { josa } from '@/lib/korean';

/** 한 번의 「저장」이 차례로 부르는 호출 하나. `label` 은 실패·부분 저장 안내에 쓰는 이름이다. */
export interface SaveStep {
  /** 단계의 자리(예: `periods:default`). 자리마다 마지막으로 저장된 내용 하나만 기억한다. */
  readonly key: string;
  /** 보낼 내용의 지문 — 같은 자리라도 내용이 달라지면 다시 보낸다. */
  readonly payload: string;
  readonly label: string;
  readonly run: () => Promise<void>;
}

export function saveStep(key: string, label: string, payload: unknown, run: () => Promise<void>): SaveStep {
  return { key, payload: JSON.stringify(payload), label, run };
}

/** 자리별로 마지막에 저장된 내용 — 저장 화면이 열려 있는 동안 든다. */
export type SavedSteps = Map<string, string>;

export type SaveOutcome = { status: 'saved' } | { status: 'failed'; failedKey: string; message: string };

/**
 * 순서대로 실행하고 첫 실패에서 멈춘다. 그 자리에 마지막으로 저장된 내용과 같은 단계는 건너뛴다 — 다시 누른 저장이
 * 끝난 호출을 또 보내지 않게. 내용이 달라지면(예전에 저장했던 값으로 돌아온 경우 포함) 다시 보낸다.
 * 끝난 단계는 `saved` 에 적는다.
 */
export async function runSaveSteps(
  steps: readonly SaveStep[],
  saved: SavedSteps,
  toReason: (error: unknown, step: SaveStep) => string,
): Promise<SaveOutcome> {
  const doneLabels: string[] = [];
  for (const step of steps) {
    if (saved.get(step.key) !== step.payload) {
      try {
        await step.run();
      } catch (error) {
        return {
          status: 'failed',
          failedKey: step.key,
          message: partialSaveMessage(doneLabels, step.label, toReason(error, step)),
        };
      }
      saved.set(step.key, step.payload);
    }
    doneLabels.push(step.label);
  }
  return { status: 'saved' };
}

/** 앞선 호출이 저장된 뒤 실패했으면 어디까지 됐는지 붙인다. 저장된 것이 없으면 사유만 돌려준다. */
export function partialSaveMessage(doneLabels: readonly string[], failedLabel: string, reason: string): string {
  const saved = [...new Set(doneLabels)].join('·');
  if (!saved) return reason;
  return `${josa(saved, ['은', '는'])} 저장됐고, ${failedLabel} 저장에 실패했어요. ${reason}`;
}
