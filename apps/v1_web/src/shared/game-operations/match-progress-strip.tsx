import { Check } from 'lucide-react';
import type { ProgressStep } from '@/lib/match-progress-steps';

/**
 * 콘솔 헤더의 진행 단계 스트립. 상태 라벨만으로는 "전반 끝, 지금 하프타임"이 안 읽히던 자리를
 * 단계 선으로 보여 준다. 색만으로 전하지 않는다 — 지난 단계는 체크, 지금 단계는 굵은 글씨와
 * `aria-current="step"`, 남은 단계는 빈 원이다.
 */
export function MatchProgressStrip({ steps, label }: { steps: readonly ProgressStep[]; label: string }) {
  if (steps.length === 0) return null;
  return (
    <ol aria-label={label} className="mt-3 flex list-none flex-nowrap items-center gap-2 overflow-x-auto p-0">
      {steps.flatMap((step, index) => {
        const item = (
          <li
            key={step.key}
            aria-current={step.state === 'current' ? 'step' : undefined}
            className={[
              'inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-[length:var(--font-size-caption)]',
              step.state === 'current' ? 'font-bold text-[var(--blue700)]' : 'font-medium text-[var(--text-muted)]',
            ].join(' ')}
          >
            <span
              aria-hidden="true"
              className={[
                'inline-flex h-4 w-4 items-center justify-center rounded-full',
                step.state === 'done'
                  ? 'bg-[var(--blue500)] text-white'
                  : step.state === 'current'
                    ? 'border-2 border-[var(--blue500)]'
                    : 'border-2 border-[var(--border-strong)]',
              ].join(' ')}
            >
              {step.state === 'done' ? <Check size={10} strokeWidth={3.5} /> : null}
              {step.state === 'current' ? <span className="h-1.5 w-1.5 rounded-full bg-[var(--blue500)]" /> : null}
            </span>
            {step.label}
          </li>
        );
        if (index === steps.length - 1) return [item];
        return [
          item,
          <li
            key={`${step.key}-line`}
            aria-hidden="true"
            className={[
              'h-0.5 w-3.5 shrink-0 rounded-sm',
              step.state === 'done' ? 'bg-[var(--blue500)]' : 'bg-[var(--border-strong)]',
            ].join(' ')}
          />,
        ];
      })}
    </ol>
  );
}
