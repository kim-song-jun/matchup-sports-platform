'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

export type ConfirmTone = 'default' | 'danger';

export interface ConfirmOptions {
  title: string;
  message: string;
  /** 확인 버튼 레이블. 기본값 '확인' */
  confirmLabel?: string;
  /** 취소 버튼 레이블. 기본값 '취소' */
  cancelLabel?: string;
  /** 'danger' = 확인 버튼이 빨간색 — 비가역 액션(거절/탈퇴/취소)에 사용 */
  tone?: ConfirmTone;
  /** 정확히 입력해야 확인 버튼이 활성화되는 문구. 비가역 작업의 이중 확인에 사용 */
  confirmationPhrase?: string;
}

interface ConfirmState extends ConfirmOptions {
  resolve: (value: boolean) => void;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

/**
 * useConfirm — promise 기반 확인 모달 훅.
 *
 * @example
 * const { confirm, ConfirmModal } = useConfirm();
 * // ...
 * const ok = await confirm({ title: '삭제할까요?', message: '취소할 수 없어요.', tone: 'danger' });
 * if (!ok) return;
 * mutate();
 */
export function useConfirm() {
  const [state, setState] = useState<ConfirmState | null>(null);

  const confirm = useCallback((opts: ConfirmOptions): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      setState({ ...opts, resolve });
    });
  }, []);

  const handleResolve = useCallback(
    (value: boolean) => {
      state?.resolve(value);
      setState(null);
    },
    [state],
  );

  const modal = (
    <ConfirmModal
      open={state !== null}
      title={state?.title ?? ''}
      message={state?.message ?? ''}
      confirmLabel={state?.confirmLabel}
      cancelLabel={state?.cancelLabel}
      tone={state?.tone}
      confirmationPhrase={state?.confirmationPhrase}
      onConfirm={() => handleResolve(true)}
      onCancel={() => handleResolve(false)}
    />
  );

  return { confirm, ConfirmModal: modal } as const;
}

// ── Component ─────────────────────────────────────────────────────────────────

interface ConfirmModalProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
  confirmationPhrase?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * ConfirmModal — 토스 스타일 확인/취소 모달.
 *
 * - role="dialog" + aria-modal="true"
 * - ESC 키로 취소 처리
 * - focus trap (Tab/Shift-Tab)
 * - 열릴 때 취소 버튼에 포커스, 닫힐 때 이전 포커스 복원
 * - body 스크롤 잠금
 * - backdrop 클릭 시 취소
 */
export function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = '확인',
  cancelLabel = '취소',
  tone = 'default',
  confirmationPhrase,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const idPrefix = useId();
  const titleId = `${idPrefix}-confirm-title`;
  const messageId = `${idPrefix}-confirm-message`;
  const phraseId = `${idPrefix}-confirm-phrase`;
  const dialogRef = useRef<HTMLDivElement>(null);
  // 취소 버튼에 초기 포커스를 줘서 실수로 확인 누르는 것을 방지한다
  const cancelBtnRef = useRef<HTMLButtonElement>(null);
  const confirmationInputRef = useRef<HTMLInputElement>(null);
  const previousFocusRef = useRef<Element | null>(null);
  const [confirmationInput, setConfirmationInput] = useState('');
  const confirmationMatched =
    confirmationPhrase === undefined || confirmationInput === confirmationPhrase;

  // 열릴 때 이전 포커스 저장, 닫힐 때 복원 (WCAG 2.4.3)
  useEffect(() => {
    if (open) {
      previousFocusRef.current = document.activeElement;
    } else {
      const el = previousFocusRef.current;
      if (el && typeof (el as HTMLElement).focus === 'function') {
        (el as HTMLElement).focus();
      }
      previousFocusRef.current = null;
    }
  }, [open]);

  // 입력 확인이 필요한 작업은 입력창, 일반 작업은 취소 버튼에 초기 포커스
  useEffect(() => {
    if (open) {
      setConfirmationInput('');
      const id = setTimeout(() => {
        if (confirmationPhrase) {
          confirmationInputRef.current?.focus();
        } else {
          cancelBtnRef.current?.focus();
        }
      }, 60);
      return () => clearTimeout(id);
    }
  }, [open, confirmationPhrase]);

  // ESC 키로 취소
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onCancel]);

  // focus trap
  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const FOCUSABLE =
      'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

    const trap = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', trap);
    return () => document.removeEventListener('keydown', trap);
  }, [open]);

  // body 스크롤 잠금
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  if (!open) return null;

  const isDanger = tone === 'danger';

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-4"
      style={{ background: 'rgba(25,31,40,0.45)' }}
      onClick={(e) => {
        // backdrop 클릭 시 취소 (패널 클릭은 전파 차단)
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      {/* Panel */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={messageId}
        className="w-full max-w-[360px] rounded-2xl overflow-hidden"
        style={{
          background: 'var(--surface, #fff)',
          boxShadow: '0 8px 32px rgba(20,28,45,0.14)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Body */}
        <div style={{ padding: '28px 24px 20px' }}>
          <p
            id={titleId}
            className="tm-text-body-lg"
            style={{ color: 'var(--text-strong)', fontWeight: 700, marginBottom: 10 }}
          >
            {title}
          </p>
          <p
            id={messageId}
            className="tm-text-label"
            style={{ color: 'var(--text-muted)', lineHeight: 1.6 }}
          >
            {message}
          </p>
          {confirmationPhrase ? (
            <div style={{ marginTop: 18 }}>
              <label
                htmlFor={phraseId}
                className="tm-text-label"
                style={{ display: 'block', color: 'var(--text-strong)', fontWeight: 600, marginBottom: 8 }}
              >
                계속하려면 <strong>{confirmationPhrase}</strong>를 입력해 주세요.
              </label>
              <input
                ref={confirmationInputRef}
                id={phraseId}
                type="text"
                value={confirmationInput}
                onChange={(event) => setConfirmationInput(event.target.value)}
                autoComplete="off"
                placeholder={confirmationPhrase}
                className="tm-input"
                style={{ width: '100%', minHeight: 44 }}
              />
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', gap: 8, padding: '0 24px 24px' }}>
          <button
            ref={cancelBtnRef}
            type="button"
            className="tm-btn tm-btn-md tm-btn-neutral"
            style={{ flex: 1, minHeight: 44 }}
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`tm-btn tm-btn-md ${isDanger ? 'tm-btn-danger' : 'tm-btn-primary'}`}
            style={{ flex: 1, minHeight: 44 }}
            disabled={!confirmationMatched}
            onClick={() => {
              if (confirmationMatched) onConfirm();
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
