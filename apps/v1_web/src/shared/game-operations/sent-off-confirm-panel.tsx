'use client';

import { useEffect, useId, useRef } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/v1-ui/button';
import { sentOffPlayerNoticeCopy } from './confirm-copy';

export interface SentOffConfirmPanelProps {
  readonly playerName: string;
  /** 레드카드를 받은 시각("후반 8:12"). 모르면 null. */
  readonly sentOffWhen: string | null;
  /** 기록 이름("골"·"레드카드"·"어시스트" …). */
  readonly noun: string;
  readonly verb?: '기록' | '추가';
  /** 선택 화면으로 돌아가 다른 선수를 고른다. */
  readonly onBack: () => void;
  /** 퇴장한 선수인 걸 알고도 이어 간다. */
  readonly onContinue: () => void;
}

/**
 * 퇴장한 선수를 골랐을 때 선수 선택 화면(`ActionTargetPicker`)·어시스트 시트(`AssistPickerSheet`)가
 * 목록 자리에 대신 그리는 확인 패널. 같은 다이얼로그 안에서 바뀌므로 모달이 겹치지 않는다.
 *
 * 처음 포커스는 "다른 선수 고르기"에 둔다 — 습관적으로 Enter 를 눌러도 퇴장 선수에게 기록되지 않게.
 */
export function SentOffConfirmPanel({ playerName, sentOffWhen, noun, verb, onBack, onContinue }: SentOffConfirmPanelProps) {
  const titleId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const copy = sentOffPlayerNoticeCopy({ playerName, sentOffWhen, noun, verb });

  useEffect(() => {
    rootRef.current?.querySelector<HTMLElement>('button')?.focus();
  }, []);

  return (
    <div
      ref={rootRef}
      role="group"
      aria-labelledby={titleId}
      className="rounded-xl border border-[var(--tint-red-border)] bg-[var(--tint-red)] p-4"
    >
      <div className="flex items-start gap-2">
        <AlertTriangle size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-[var(--red700)]" />
        <div className="min-w-0">
          {/* break-keep: 좁은 폭에서 "그래도"가 "그/래도"로 끊기지 않게 어절 단위로 줄바꿈한다. */}
          <h3 id={titleId} className="break-keep text-[length:var(--font-size-body-lg)] font-bold text-[var(--text-strong)]">
            {copy.title}
          </h3>
          <p className="mt-1 break-keep text-[length:var(--font-size-body-sm)] text-[var(--text-body)]">{copy.message}</p>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button size="md" variant="outline" block onClick={onBack}>
          {copy.backLabel}
        </Button>
        <Button size="md" variant="danger" block onClick={onContinue}>
          {copy.continueLabel}
        </Button>
      </div>
    </div>
  );
}
