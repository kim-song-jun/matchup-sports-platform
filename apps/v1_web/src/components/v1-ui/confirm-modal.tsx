'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
  /** 체크해야 확인 버튼이 켜지는 한 줄(예: '이해했어요') — 되돌리기 어려운 작업을 단순 확인보다 한 단계 무겁게(H2). */
  acknowledgement?: string;
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
      acknowledgement={state?.acknowledgement}
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
  acknowledgement?: string;
  /** 확인 창 안에서 사유를 받는다 — 값은 호출자가 들고(제출 실패 뒤에도 남게) 창은 보여 주기만 한다. */
  reasonField?: ConfirmReasonField;
  /** 호출자가 요청을 보내는 동안 true — 버튼·입력과 ESC·바깥 클릭 닫기를 잠근다. */
  busy?: boolean;
  /** 창을 연 채로 보여 줄 실패 사유(role=alert). */
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export interface ConfirmReasonField {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** true 면 공백이 아닌 글자가 있어야 확인 버튼이 켜진다. */
  required?: boolean;
  maxLength?: number;
  /** 입력칸 아래 안내 한 줄 — 사유가 어디에 남는지 등. */
  hint?: string;
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
  acknowledgement,
  reasonField,
  busy = false,
  error = null,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const idPrefix = useId();
  const titleId = `${idPrefix}-confirm-title`;
  const messageId = `${idPrefix}-confirm-message`;
  const reasonId = `${idPrefix}-confirm-reason`;
  const reasonHintId = `${idPrefix}-confirm-reason-hint`;
  const [acknowledged, setAcknowledged] = useState(false);
  const acknowledgementReady = acknowledgement === undefined || acknowledged;
  const reasonReady = !reasonField?.required || reasonField.value.trim().length > 0;
  const canConfirm = acknowledgementReady && reasonReady && !busy;
  // 초기 포커스는 패널의 첫 컨트롤 — 입력칸이 있으면 입력칸, 없으면 취소 버튼(실수로 확인하지 않게).
  const { dialogRef, onBackdropClick } = useModalA11y({ open, onClose: onCancel, pending: busy, exitMs: 0 }); // 닫히면 즉시 렌더를 떼므로 잠금·포커스 복원도 즉시.

  useEffect(() => {
    if (open) setAcknowledged(false);
  }, [open]);

  if (!open || typeof document === 'undefined') return null;

  const isDanger = tone === 'danger';

  // body 로 올린다 — 페이지 전환이 도는 동안 template.tsx 래퍼는 view-transition-name 때문에
  // 스태킹 컨텍스트가 되고, 그 안에서는 z-index 를 얼마로 줘도 셸 네비 아래에 깔린다.
  return createPortal(
    /* Backdrop */
    <div
      className="fixed inset-0 flex items-end justify-center sm:items-center p-4"
      style={{ zIndex: 'var(--z-modal)', background: 'color-mix(in srgb, var(--static-ink) 45%, transparent)' }}
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
          background: 'var(--surface)',
          boxShadow: 'var(--shadow-modal)',
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
          {reasonField ? (
            <div className="tm-create-field" style={{ marginTop: 16 }}>
              <label className="tm-text-label" htmlFor={reasonId}>
                {reasonField.label}
              </label>
              <textarea
                id={reasonId}
                className="tm-input tm-create-input-multiline"
                rows={3}
                maxLength={reasonField.maxLength}
                required={reasonField.required}
                aria-describedby={reasonField.hint ? reasonHintId : undefined}
                value={reasonField.value}
                onChange={(event) => reasonField.onChange(event.target.value)}
                disabled={busy}
              />
              {reasonField.hint || reasonField.maxLength ? (
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span id={reasonHintId} className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>
                    {reasonField.hint}
                  </span>
                  {reasonField.maxLength ? (
                    <span className="tm-text-caption tab-num" style={{ color: 'var(--text-caption)', flexShrink: 0 }}>
                      {reasonField.value.length}/{reasonField.maxLength}
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
          {acknowledgement ? (
            <label
              className="tm-text-label"
              style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, marginTop: 16, color: 'var(--text-strong)', fontWeight: 600, cursor: 'pointer' }}
            >
              <input
                type="checkbox"
                checked={acknowledged}
                onChange={(event) => setAcknowledged(event.target.checked)}
                disabled={busy}
                style={{ width: 20, height: 20, flexShrink: 0, accentColor: 'var(--blue500)' }}
              />
              {acknowledgement}
            </label>
          ) : null}
          {error ? (
            <p role="alert" className="tm-text-caption" style={{ color: 'var(--red700)', margin: '12px 0 0' }}>
              {error}
            </p>
          ) : null}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', gap: 8, padding: '0 24px 24px' }}>
          <button
            type="button"
            className="tm-btn tm-btn-md tm-btn-neutral"
            style={{ flex: 1, minHeight: 44 }}
            disabled={busy}
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`tm-btn tm-btn-md ${isDanger ? 'tm-btn-danger' : 'tm-btn-primary'}`}
            style={{ flex: 1, minHeight: 44 }}
            disabled={!canConfirm}
            onClick={() => {
              if (canConfirm) onConfirm();
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
