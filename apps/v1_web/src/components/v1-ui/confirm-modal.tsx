'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { waitForOverlayHistory } from '@/lib/overlay-history';
import { useModalA11y } from './use-modal-a11y';

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
  const settledRef = useRef<(() => void) | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  const confirm = useCallback((opts: ConfirmOptions): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      setState({ ...opts, resolve });
    });
  }, []);

  const handleResolve = useCallback(
    (value: boolean) => {
      if (!state) return;
      const { resolve } = state;
      settledRef.current = () => resolve(value);
      setState(null);
    },
    [state],
  );

  // 모달의 히스토리 항목이 걷힌 뒤에 알린다 — 곧바로 router.push·back 하는 호출자와 엇갈리지 않게.
  useEffect(() => {
    if (state !== null || !settledRef.current) return;
    const settled = settledRef.current;
    settledRef.current = null;
    void waitForOverlayHistory().then(settled);
  }, [state]);

  // 호스트가 먼저 사라지면(같은 커밋의 언마운트 포함) 기다리는 쪽이 영원히 멈추지 않게 끝낸다.
  useEffect(
    () => () => {
      const settled = settledRef.current;
      settledRef.current = null;
      if (settled) settled();
      else stateRef.current?.resolve(false);
    },
    [],
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
  /**
   * 확인 버튼 문구. **취소 버튼 문구(기본 '취소')와 같아지지 않게** 실행할 행동을 적는다.
   * 취소 성격의 작업이면 '취소'가 아니라 '초대 취소' / '신청 취소'처럼 대상을 붙인다
   * — 같은 문구가 나란히 두 개 있으면 어느 쪽이 실행인지 구분되지 않는다.
   */
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
 * 접근성·ESC·backdrop·뒤로가기 닫기는 useModalA11y 가 맡는다(닫힘 = onCancel).
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
  const [confirmationInput, setConfirmationInput] = useState('');
  const confirmationMatched =
    confirmationPhrase === undefined || confirmationInput === confirmationPhrase;
  // 초기 포커스는 패널의 첫 컨트롤 — 입력 확인이 있으면 입력창, 없으면 취소 버튼(실수로 확인하지 않게).
  const { dialogRef, onBackdropClick } = useModalA11y({ open, onClose: onCancel });

  useEffect(() => {
    if (open) setConfirmationInput('');
  }, [open]);

  if (!open) return null;

  const isDanger = tone === 'danger';

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-4"
      style={{ background: 'rgba(25,31,40,0.45)' }}
      onClick={onBackdropClick}
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
            style={{ color: 'var(--text-strong)', fontWeight: 700, marginBottom: 12 }}
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
            <div style={{ marginTop: 20 }}>
              <label
                htmlFor={phraseId}
                className="tm-text-label"
                style={{ display: 'block', color: 'var(--text-strong)', fontWeight: 600, marginBottom: 8 }}
              >
                계속하려면 <strong>{confirmationPhrase}</strong>를 입력해 주세요.
              </label>
              <input
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
