'use client';

import { Check, Lock } from 'lucide-react';

export interface WizardStep {
  readonly title: string;
  readonly description: string;
}

/**
 * 어드민 생성 마법사의 단계 표시 — done/current/locked 3상태 + 진행률. 대회 만들기와 리그 만들기가
 * 같이 쓴다(components/admin/operation-flag-gate-stepper.tsx 의 패턴). "locked" 단계는 버튼 자체를
 * disabled 로 막는다 — 앞 단계를 다 채우기 전에 건너뛰지 못하게 하는 화면 쪽 이중 방어다.
 */
export function WizardStepper({
  steps,
  currentStep,
  onSelect,
  ariaLabel,
  isLocked = () => false,
}: {
  steps: readonly WizardStep[];
  currentStep: number;
  onSelect: (step: number) => void;
  ariaLabel: string;
  isLocked?: (step: number) => boolean;
}) {
  const doneCount = steps.filter((_, index) => index < currentStep).length;

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-[length:var(--font-size-caption)] font-semibold text-[var(--text-body)]">
          {steps.length}단계 중 {doneCount}단계 완료
        </p>
      </div>
      <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-[var(--grey100)]">
        <div
          className="h-full rounded-full bg-blue-500 transition-[width] duration-150"
          style={{ width: `${(doneCount / steps.length) * 100}%` }}
        />
      </div>
      <nav aria-label={ariaLabel}>
        <ol
          className="grid gap-1 rounded-2xl border border-[var(--border)] bg-[var(--card-surface)] p-2 sm:gap-2"
          style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}
        >
          {steps.map((step, index) => {
            const active = index === currentStep;
            const done = index < currentStep;
            const locked = !active && isLocked(index);
            const statusLabel = done ? '완료' : active ? '진행 중' : locked ? '잠김' : '';
            return (
              <li key={step.title}>
                <button
                  type="button"
                  onClick={() => onSelect(index)}
                  disabled={locked}
                  aria-current={active ? 'step' : undefined}
                  aria-label={`${index + 1}단계 ${step.title}${statusLabel ? ` — ${statusLabel}` : ''}`}
                  title={step.description}
                  className={[
                    'flex min-h-[64px] w-full items-center gap-2 rounded-xl px-2 text-left transition-colors sm:px-3',
                    'disabled:cursor-not-allowed disabled:opacity-60',
                    active ? 'bg-[var(--blue50)] text-[var(--blue700)]' : 'text-[var(--text-caption)] hover:bg-[var(--grey50)] disabled:hover:bg-transparent',
                  ].join(' ')}
                >
                  <span
                    aria-hidden="true"
                    className={[
                      'grid h-7 w-7 shrink-0 place-items-center rounded-full text-[length:var(--font-size-caption)] font-bold',
                      // locked는 색상으로는 아직 안 온 단계와 구분하지 않는다 — 자물쇠 아이콘과
                      // 바깥 버튼의 disabled 스타일이 "지금 누를 수 없음"을 전달한다.
                      active
                        ? 'bg-blue-500 text-white'
                        : done
                          ? 'bg-[var(--blue50)] text-[var(--blue700)]'
                          : 'tm-on-tint bg-[var(--grey150)] text-[var(--text-caption)]',
                    ].join(' ')}
                  >
                    {done ? <Check size={14} /> : locked ? <Lock size={12} /> : index + 1}
                  </span>
                  <span className="hidden min-w-0 sm:block" aria-hidden="true">
                    <span className="block truncate text-[length:var(--font-size-caption)] font-bold">{step.title}</span>
                    <span className="mt-0.5 block truncate text-[length:var(--font-size-caption)]">{step.description}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>
    </div>
  );
}
