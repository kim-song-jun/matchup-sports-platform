'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useId, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { overlayLinkClick } from '@/lib/overlay-history';
import { useModalA11y } from './use-modal-a11y';

interface ActionSheetActionBase {
  readonly key: string;
  readonly label: string;
  readonly description?: string;
  /** 되돌릴 수 없는 동작은 라벨을 빨강으로 낮춰 다른 행동과 구분한다. */
  readonly destructive?: boolean;
  /** 묶음 이름 — 앞 항목과 다르면 이 항목 위에 소제목을 둔다(예: 되돌리기 어려운 동작을 따로 떼기). */
  readonly groupLabel?: string;
}

export type ActionSheetAction =
  | (ActionSheetActionBase & {
      readonly onSelect: () => void;
      readonly disabled?: boolean;
      /** 비활성일 때 왜 못 누르는지. 비활성 버튼만 두면 현장에서 이유를 못 찾는다. */
      readonly disabledReason?: string | null;
      readonly href?: undefined;
    })
  | (ActionSheetActionBase & {
      /** 다른 화면으로 가는 항목 — 링크로 그려 새 탭·복사 같은 브라우저 기본 동작을 살린다. */
      readonly href: string;
      readonly onSelect?: undefined;
      readonly disabled?: undefined;
      readonly disabledReason?: undefined;
    });

export interface ActionSheetProps {
  readonly open: boolean;
  /** 시트 제목 겸 dialog 접근 이름. */
  readonly title: string;
  /** 제목 아래 한 줄 — 누구·무엇에 대한 시트인지(역할·등번호 등). */
  readonly subtitle?: string;
  readonly actions: readonly ActionSheetAction[];
  readonly onClose: () => void;
}

const ROW_CLASS =
  'flex min-h-[56px] w-full flex-col items-start justify-center rounded-xl border border-[var(--border)] px-4 py-2 text-left transition-colors hover:bg-[var(--surface-soft)] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2';

/**
 * ⋯ 더보기 시트 — 자주 누르지 않거나 잘못 누르면 되돌릴 수 없는 동작을 주 조작 줄에서 떼어
 * 둔다(운영 콘솔의 종료 계열, 운영 보드 행의 결과 정정·명단).
 *
 * 열림은 URL 이 아니라 부모의 로컬 상태가 소유한다(그래서 URL 이 소유하는 `BottomSheet` 가
 * 아니라 다른 상태 기반 시트들처럼 `useModalA11y` 를 쓴다). 동작을 고르면 부모가 시트를 먼저
 * 닫아야 뒤이어 뜨는 확인 창과 겹치지 않는다 — 링크 항목은 `overlayLinkClick` 으로 이동하며 시트가 닫힌다.
 */
export function ActionSheet({ open, title, subtitle, actions, onClose }: ActionSheetProps) {
  const titleId = useId();
  const pathname = usePathname();
  const { dialogRef, onBackdropClick } = useModalA11y<HTMLElement, HTMLDivElement>({ open, onClose });

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 flex items-end justify-center bg-gray-900/50 sm:items-center sm:p-4"
      style={{ zIndex: 'var(--z-modal)' }}
      onClick={onBackdropClick}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-[85vh] w-full max-w-[440px] flex-col rounded-t-2xl bg-[var(--card-surface)] p-5 sm:rounded-2xl"
      >
        <div className={`flex items-center justify-between gap-2 ${subtitle ? '' : 'mb-3'}`}>
          <h2
            id={titleId}
            className="min-w-0 text-[length:var(--font-size-body-lg)] font-bold text-[var(--text-strong)]"
          >
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-soft)] focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        {subtitle ? (
          <p className="mb-3 text-[length:var(--font-size-caption)] text-[var(--text-muted)]">{subtitle}</p>
        ) : null}
        <ul className="flex flex-col gap-2 overflow-y-auto">
          {actions.map((action, index) => (
            <li key={action.key}>
              {action.groupLabel && action.groupLabel !== actions[index - 1]?.groupLabel ? (
                <p className="mb-2 mt-2 text-[length:var(--font-size-caption)] font-bold text-[var(--text-muted)]">{action.groupLabel}</p>
              ) : null}
              {action.href !== undefined ? (
                // 오버레이 안 링크는 일반 push 가 아니라 이 경로로 이동한다 — 시트의 뒤로가기 표식 항목이 새
                // 페이지 앞에 남아 다음 뒤로가기가 죽은 정류장에 서는 것을 막는다.
                <Link href={action.href} className={ROW_CLASS} onClick={overlayLinkClick(action.href, pathname ?? '', onClose)}>
                  <ActionLabel action={action}>{action.description}</ActionLabel>
                </Link>
              ) : (
                <button type="button" disabled={action.disabled} onClick={action.onSelect} className={ROW_CLASS}>
                  <ActionLabel action={action}>
                    {action.disabled && action.disabledReason ? action.disabledReason : action.description}
                  </ActionLabel>
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function ActionLabel({ action, children }: { action: ActionSheetAction; children: ReactNode }) {
  return (
    <>
      <span
        className={[
          'text-[length:var(--font-size-body-sm)] font-bold',
          action.destructive ? 'text-[var(--red700)]' : 'text-[var(--text-strong)]',
        ].join(' ')}
      >
        {action.label}
      </span>
      {children ? (
        <span className="text-[length:var(--font-size-caption)] text-[var(--text-muted)]">{children}</span>
      ) : null}
    </>
  );
}
