'use client';

import { useId } from 'react';
import { X } from 'lucide-react';
import { useModalA11y } from '@/components/v1-ui/use-modal-a11y';

export interface ConsoleMoreAction {
  readonly key: string;
  readonly label: string;
  readonly description: string;
  /** 되돌릴 수 없는 종료 계열은 라벨을 빨강으로 낮춰 다른 행동과 구분한다. */
  readonly destructive?: boolean;
  readonly disabled?: boolean;
  /** 비활성일 때 왜 못 누르는지. 비활성 버튼만 두면 현장에서 이유를 못 찾는다. */
  readonly disabledReason?: string | null;
  readonly onSelect: () => void;
}

export interface ConsoleMoreSheetProps {
  readonly open: boolean;
  readonly actions: readonly ConsoleMoreAction[];
  readonly onClose: () => void;
}

/**
 * 콘솔의 ⋯ 더보기 시트 — 자주 누르지 않고 잘못 누르면 되돌릴 수 없는 종료 계열
 * (조기 정상 종료·몰수/중단 종료)을 주 조작 줄에서 떼어 둔다.
 *
 * 열림은 URL 이 아니라 콘솔 로컬 상태가 소유한다(그래서 `BottomSheet` 가 아니라 다른
 * 콘솔 시트들처럼 `useModalA11y` 를 쓴다). 항목을 고르면 시트는 먼저 닫히고 뒤이어
 * 확인 창이 뜬다 — 다이얼로그 두 개가 겹치지 않는다.
 */
export function ConsoleMoreSheet({ open, actions, onClose }: ConsoleMoreSheetProps) {
  const titleId = useId();
  const { dialogRef, onBackdropClick } = useModalA11y<HTMLElement, HTMLDivElement>({ open, onClose });

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-gray-900/50 sm:items-center sm:p-4"
      onClick={onBackdropClick}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-[85vh] w-full max-w-[440px] flex-col rounded-t-2xl bg-[var(--card-surface)] p-5 sm:rounded-2xl"
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 id={titleId} className="text-[length:var(--font-size-body-lg)] font-bold text-[var(--text-strong)]">
            경기 더보기
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="flex h-11 w-11 items-center justify-center rounded-lg text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-soft)] focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <ul className="flex flex-col gap-2">
          {actions.map((action) => (
            <li key={action.key}>
              <button
                type="button"
                disabled={action.disabled}
                onClick={action.onSelect}
                className="flex min-h-[56px] w-full flex-col items-start justify-center rounded-xl border border-[var(--border)] px-4 py-2 text-left transition-colors hover:bg-[var(--surface-soft)] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
              >
                <span
                  className={[
                    'text-[length:var(--font-size-body-sm)] font-bold',
                    action.destructive ? 'text-[var(--red700)]' : 'text-[var(--text-strong)]',
                  ].join(' ')}
                >
                  {action.label}
                </span>
                <span className="text-[length:var(--font-size-caption)] text-[var(--text-muted)]">
                  {action.disabled && action.disabledReason ? action.disabledReason : action.description}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
