'use client';

import { useEffect, useId, useRef, useState } from 'react';

type SavePresetDialogProps = {
  open: boolean;
  onClose: () => void;
  /** 이미 저장된 프리셋 이름들 — 같은 이름을 고르면 덮어쓰기임을 미리 알려준다. */
  existingNames: string[];
  saving: boolean;
  error: string | null;
  onSave: (name: string) => void;
};

/**
 * 지금 짜 놓은 명단을 이름 붙여 저장하는 다이얼로그.
 *
 * 이름이 겹치면 서버가 409로 막지만, 그때 가서 알려주면 사용자는 이미 저장 버튼을 누른
 * 뒤다. 입력하는 동안 "이 이름은 이미 있어요 — 저장하면 덮어써요"를 미리 말해 주고,
 * 그대로 진행하면 덮어쓰기로 처리한다.
 */
export function SavePresetDialog({ open, onClose, existingNames, saving, error, onSave }: SavePresetDialogProps) {
  const idPrefix = useId();
  const titleId = `${idPrefix}-save-preset-title`;
  const inputId = `${idPrefix}-save-preset-name`;
  const dialogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const previousFocusRef = useRef<Element | null>(null);
  const [name, setName] = useState('');

  useEffect(() => {
    if (open) {
      previousFocusRef.current = document.activeElement;
      setName('');
      const id = setTimeout(() => inputRef.current?.focus(), 60);
      return () => clearTimeout(id);
    }
    const element = previousFocusRef.current;
    if (element && typeof (element as HTMLElement).focus === 'function') {
      (element as HTMLElement).focus();
    }
    previousFocusRef.current = null;
  }, [open]);

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

  const trimmed = name.trim();
  const overwrites = trimmed.length > 0 && existingNames.includes(trimmed);

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
        className="w-full max-w-[360px] rounded-2xl overflow-hidden"
        style={{ background: 'var(--card-surface)', boxShadow: '0 8px 32px rgba(20,28,45,0.14)' }}
        onClick={(event) => event.stopPropagation()}
      >
        <div style={{ padding: '24px 20px 16px', display: 'grid', gap: 10 }}>
          <p id={titleId} className="tm-text-body-lg" style={{ fontWeight: 700, margin: 0 }}>
            프리셋으로 저장
          </p>
          <p className="tm-text-caption" style={{ color: 'var(--text-muted)', margin: 0 }}>
            지금 명단을 이름 붙여 저장해 두면 다음 경기에서 그대로 불러올 수 있어요.
          </p>

          <label htmlFor={inputId} className="tm-text-caption" style={{ fontWeight: 600 }}>
            프리셋 이름
          </label>
          <input
            ref={inputRef}
            id={inputId}
            type="text"
            className="tm-input"
            placeholder="예: 주전 4-4-2"
            maxLength={30}
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && trimmed.length > 0 && !saving) onSave(trimmed);
            }}
          />

          {overwrites ? (
            <p className="tm-text-caption" style={{ color: 'var(--orange700)', margin: 0 }}>
              같은 이름의 프리셋이 이미 있어요 — 저장하면 덮어써요.
            </p>
          ) : null}
          {error !== null ? (
            <p className="tm-text-caption" role="alert" style={{ color: 'var(--red600, #d63636)', margin: 0 }}>
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
            disabled={trimmed.length === 0 || saving}
            onClick={() => onSave(trimmed)}
          >
            {saving ? '저장 중…' : overwrites ? '덮어쓰기' : '저장'}
          </button>
        </div>
      </div>
    </div>
  );
}
