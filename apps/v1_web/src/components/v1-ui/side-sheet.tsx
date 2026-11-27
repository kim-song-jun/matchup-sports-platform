'use client';

import { useCallback, useId, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useConfirm, type ConfirmOptions } from './confirm-modal';
import { useModalA11y } from './use-modal-a11y';
import { useOverlayHistory } from './use-overlay-history';

/** 바꾼 내용이 있는 시트를 닫으려 할 때 묻는 창 — 자체 「취소」 버튼을 가진 소비처도 같은 문구를 쓴다. */
export const SIDE_SHEET_DISCARD_CONFIRM: ConfirmOptions = {
  title: '저장하지 않고 닫을까요?',
  message: '바꾼 내용이 저장되지 않아요.',
  confirmLabel: '닫기',
  cancelLabel: '계속 고치기',
  tone: 'danger',
};

export interface SideSheetProps {
  readonly open: boolean;
  /** 시트 제목 겸 dialog 접근 이름. */
  readonly title: string;
  readonly onClose: () => void;
  readonly children: ReactNode;
  /** 스크롤되는 본문 아래에 고정되는 영역(저장·취소 버튼). */
  readonly footer?: ReactNode;
  /** 바꾼 내용이 있으면 true — 모든 닫기 경로(✕·ESC·바깥·뒤로가기)가 버릴지 먼저 묻는다. */
  readonly dirty?: boolean;
}

/**
 * 오른쪽 수정 시트 — 1024px 이상은 오른쪽에 붙은 480px 패널, 미만은 아래에서 올라오는 90% 높이 시트.
 * 폭별 모양은 클래스(`lg:`)만으로 가른다.
 */
export function SideSheet({ open, title, onClose, children, footer, dirty = false }: SideSheetProps) {
  const titleId = useId();
  const { confirm, ConfirmModal } = useConfirm();
  // 뒤로가기(SideSheetHistory)로 닫으려다 거절하면 이미 걷힌 표식을 다시 쌓아야 한다 — 그 훅만 새로 마운트하려고 key 를 바꾼다.
  const [historyEpoch, setHistoryEpoch] = useState(0);

  const requestClose = useCallback(async () => {
    if (!dirty || (await confirm(SIDE_SHEET_DISCARD_CONFIRM))) onClose();
  }, [dirty, confirm, onClose]);

  const closeFromHistory = useCallback(async () => {
    if (!dirty || (await confirm(SIDE_SHEET_DISCARD_CONFIRM))) onClose();
    else setHistoryEpoch((epoch) => epoch + 1);
  }, [dirty, confirm, onClose]);

  const { dialogRef, onBackdropClick } = useModalA11y<HTMLElement, HTMLDivElement>({
    open,
    onClose: () => void requestClose(),
    closeOnBack: false,
    exitMs: 0,
  });

  if (typeof document === 'undefined') return null;

  const panel = (
    <div
      className="fixed inset-0 flex items-end justify-center lg:items-stretch lg:justify-end"
      style={{ zIndex: 'var(--z-modal)', background: 'color-mix(in srgb, var(--static-ink) 45%, transparent)' }}
      onClick={onBackdropClick}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex h-[90vh] w-full flex-col rounded-t-2xl bg-[var(--card-surface)] lg:h-full lg:w-[480px] lg:rounded-none lg:rounded-l-2xl"
      >
        <div
          aria-hidden="true"
          className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-[var(--radius-pill)] bg-[var(--border-strong)] lg:hidden"
        />
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--border)] px-5 py-3">
          <h2 id={titleId} className="min-w-0 text-[length:var(--font-size-body-lg)] font-bold text-[var(--text-strong)]">
            {title}
          </h2>
          <button
            type="button"
            onClick={() => void requestClose()}
            aria-label="닫기"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-soft)] focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <div data-testid="side-sheet-body" className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {children}
        </div>
        {footer ? (
          <div
            className="shrink-0 border-t border-[var(--border)] px-5 pt-4"
            style={{ paddingBottom: 'calc(16px + var(--v1-shell-safe-bottom, 0px))' }}
          >
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );

  // 확인 창은 시트가 닫혀도 렌더한다 — 열린 채 부모가 시트를 걷어도 확인 상태가 남아 다음에 저절로 뜨지 않게.
  return (
    <>
      {open ? <SideSheetHistory key={historyEpoch} onClose={() => void closeFromHistory()} /> : null}
      {open ? createPortal(panel, document.body) : null}
      {ConfirmModal}
    </>
  );
}

/** 화면에 아무것도 그리지 않고 뒤로가기 표식만 쌓는다 — 다시 마운트하면 표식을 새로 쌓는다. */
function SideSheetHistory({ onClose }: { onClose: () => void }) {
  useOverlayHistory({ open: true, onClose });
  return null;
}
