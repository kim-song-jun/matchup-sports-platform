import { Check } from 'lucide-react';
import type { ProgressStep } from '@/lib/match-progress-steps';

/**
 * 콘솔 점수 카드의 진행 단계 줄. 단계마다 점 하나를 한 줄로 잇는다 — 지난 구간은 파란 선, 남은 구간은 회색 선.
 * 색만으로 전하지 않는다: 지난 단계는 체크, 지금 단계는 채운 고리와 굵은 글씨(`aria-current="step"`),
 * 남은 단계는 빈 점, 조건부 단계(승부차기)는 점선 고리다.
 *
 * 글자는 지금 단계와 바로 다음 단계만 보인다(`labels="now-next"`, 기본). 나머지 단계의 이름은 스크린리더용
 * `sr-only` 로 남긴다. 단계가 아홉 개여도 폰(390) 폭에서 한 줄에 들어가게 하는 규칙이다 — 연결선은 남는
 * 폭만큼만 늘어나고 최소 4px 이다. 단계가 네 개뿐인 결과 줄은 `labels="all"` 로 이름을 모두 보인다.
 */
export function MatchProgressStrip({
  steps,
  label,
  labels = 'now-next',
}: {
  steps: readonly ProgressStep[];
  label: string;
  labels?: 'now-next' | 'all';
}) {
  if (steps.length === 0) return null;
  const currentIndex = steps.findIndex((step) => step.state === 'current');
  return (
    <ol aria-label={label} className="m-0 flex w-full list-none flex-nowrap items-center overflow-x-auto p-0">
      {steps.map((step, index) => {
        const isLast = index === steps.length - 1;
        const isCurrent = step.state === 'current';
        const showLabel = labels === 'all' || (currentIndex !== -1 && (index === currentIndex || index === currentIndex + 1));
        const conditionNote = step.state === 'conditional' ? '(동점이면)' : '';
        return (
          <li
            key={step.key}
            data-step-state={step.state}
            aria-current={isCurrent ? 'step' : undefined}
            className={['flex shrink-0 items-center', isLast ? '' : 'grow'].join(' ')}
          >
            <span aria-hidden="true" className="inline-flex shrink-0 items-center justify-center">
              {step.state === 'done' ? (
                <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[var(--blue500)] text-white">
                  <Check size={9} strokeWidth={3.5} />
                </span>
              ) : isCurrent ? (
                <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border-2 border-[var(--blue500)]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--blue500)]" />
                </span>
              ) : step.state === 'conditional' ? (
                <span className="h-3.5 w-3.5 rounded-full border-2 border-dashed border-[var(--border-strong)]" />
              ) : (
                <span className="h-2.5 w-2.5 rounded-full border-2 border-[var(--border-strong)]" />
              )}
            </span>
            {showLabel ? (
              <span
                className={[
                  'ml-1 whitespace-nowrap text-[length:var(--font-size-caption)]',
                  isCurrent ? 'font-bold text-[var(--blue700)]' : 'font-medium text-[var(--text-muted)]',
                ].join(' ')}
              >
                {step.label}
                {conditionNote === '' ? null : <span className="sr-only">{conditionNote}</span>}
              </span>
            ) : (
              <span className="sr-only">{`${step.label}${conditionNote}`}</span>
            )}
            {isLast ? null : (
              <span
                aria-hidden="true"
                className={[
                  'mx-0.5 h-0.5 min-w-1 flex-1 basis-0 rounded-sm',
                  step.state === 'done' ? 'bg-[var(--blue500)]' : 'bg-[var(--border-strong)]',
                ].join(' ')}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
