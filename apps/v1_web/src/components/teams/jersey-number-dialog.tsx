'use client';

import { useEffect, useId, useRef, useState } from 'react';

type JerseyNumberDialogProps = {
  open: boolean;
  memberName: string;
  /** 지금 지정돼 있는 번호. 없으면 null. */
  current: number | null;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  /** null이면 등번호 해제. */
  onSave: (jerseyNumber: number | null) => void;
};

/**
 * 팀 고정 등번호를 지정·해제하는 다이얼로그.
 *
 * 라인업 화면에서 고치는 등번호와 다르다. 이쪽은 팀의 **영구 번호**라 다음 경기에도
 * 계속 따라오고, 라인업에서 한 경기만 다르게 단다고 해서 바뀌지 않는다.
 */
export function JerseyNumberDialog({
  open,
  memberName,
  current,
  saving,
  error,
  onClose,
  onSave,
}: JerseyNumberDialogProps) {
  const idPrefix = useId();
  const titleId = `${idPrefix}-jersey-title`;
  const inputId = `${idPrefix}-jersey-input`;
  const dialogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const previousFocusRef = useRef<Element | null>(null);
  const [value, setValue] = useState('');

  useEffect(() => {
    if (open) {
      previousFocusRef.current = document.activeElement;
      setValue(current === null ? '' : String(current));
      const id = setTimeout(() => inputRef.current?.focus(), 60);
      return () => clearTimeout(id);
    }
    const element = previousFocusRef.current;
    if (element && typeof (element as HTMLElement).focus === 'function') {
      (element as HTMLElement).focus();
    }
    previousFocusRef.current = null;
  }, [open, current]);

  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const FOCUSABLE =
      'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';
    const trap = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', trap);
    return () => document.removeEventListener('keydown', trap);
  }, [open]);

  if (!open) return null;

  const trimmed = value.trim();
  const parsed = trimmed === '' ? null : Number(trimmed);
  const invalid = parsed !== null && (!Number.isInteger(parsed) || parsed < 0 || parsed > 999);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-4"
      style={{ background: 'rgba(25,31,40,0.45)' }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-[340px] rounded-2xl overflow-hidden"
        style={{ background: 'var(--card-surface, #fff)', boxShadow: '0 8px 32px rgba(20,28,45,0.14)' }}
        onClick={(event) => event.stopPropagation()}
      >
        <div style={{ padding: '24px 20px 16px', display: 'grid', gap: 12 }}>
          <p id={titleId} className="tm-text-body-lg" style={{ fontWeight: 700, margin: 0 }}>
            {memberName}님 등번호
          </p>
          <p className="tm-text-caption" style={{ color: 'var(--text-muted)', margin: 0 }}>
            팀에서 계속 쓰는 번호예요. 라인업을 짤 때 자동으로 채워지고, 한 경기만 다른 번호를
            달아도 이 값은 그대로예요.
          </p>

          <label htmlFor={inputId} className="tm-text-caption" style={{ fontWeight: 600 }}>
            등번호 (비우면 해제)
          </label>
          <input
            ref={inputRef}
            id={inputId}
            type="number"
            inputMode="numeric"
            min={0}
            max={999}
            className="tm-input"
            placeholder="예: 7"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !invalid && !saving) onSave(parsed);
            }}
          />

          {invalid ? (
            <p className="tm-text-caption" style={{ color: 'var(--orange700)', margin: 0 }}>
              0부터 999 사이의 숫자를 넣어 주세요.
            </p>
          ) : null}
          {error !== null ? (
            <p className="tm-text-caption" role="alert" style={{ color: 'var(--red700)', margin: 0 }}>
              {error}
            </p>
          ) : null}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, padding: '0 20px 20px' }}>
          <button type="button" className="tm-btn tm-btn-lg tm-btn-neutral" onClick={onClose} disabled={saving}>
            취소
          </button>
          <button
            type="button"
            className="tm-btn tm-btn-lg tm-btn-primary"
            disabled={invalid || saving}
            onClick={() => onSave(parsed)}
          >
            {saving ? '저장 중…' : '저장'}
          </button>
        </div>
      </div>
    </div>
  );
}
