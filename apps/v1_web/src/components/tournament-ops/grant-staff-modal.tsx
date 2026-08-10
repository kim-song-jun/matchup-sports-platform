'use client';

import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { V1GrantTournamentStaffPayload, V1TournamentField, V1TournamentStaffRole } from '@/types/api';

export interface GrantableRoleOption {
  value: Exclude<V1TournamentStaffRole, 'PLATFORM_OPS'>;
  label: string;
}

interface GrantStaffModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (payload: V1GrantTournamentStaffPayload) => void;
  roleOptions: GrantableRoleOption[];
  fields: V1TournamentField[];
  pending?: boolean;
  errorMessage?: string | null;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function GrantStaffModal({
  open,
  onClose,
  onSubmit,
  roleOptions,
  fields,
  pending = false,
  errorMessage,
}: GrantStaffModalProps) {
  const [userId, setUserId] = useState('');
  const [role, setRole] = useState<Exclude<V1TournamentStaffRole, 'PLATFORM_OPS'>>(
    roleOptions[0]?.value ?? 'SUPPORT_READONLY',
  );
  const [fieldId, setFieldId] = useState('');
  const [expiresAt, setExpiresAt] = useState('');

  const dialogRef = useRef<HTMLDivElement>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const previousFocusRef = useRef<Element | null>(null);

  useEffect(() => {
    if (open) {
      setUserId('');
      setRole(roleOptions[0]?.value ?? 'SUPPORT_READONLY');
      setFieldId('');
      setExpiresAt('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (open) {
      previousFocusRef.current = document.activeElement;
    } else {
      const el = previousFocusRef.current;
      if (el && typeof (el as HTMLElement).focus === 'function') (el as HTMLElement).focus();
      previousFocusRef.current = null;
    }
  }, [open]);

  useEffect(() => {
    if (open) {
      const id = setTimeout(() => firstFieldRef.current?.focus(), 60);
      return () => clearTimeout(id);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !pending) onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose, pending]);

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const FOCUSABLE = 'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';
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
      } else if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', trap);
    return () => document.removeEventListener('keydown', trap);
  }, [open]);

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  if (!open) return null;

  const trimmedUserId = userId.trim();
  const userIdValid = UUID_PATTERN.test(trimmedUserId);
  const requiresField = role === 'FIELD_OPERATOR';
  const canSubmit = userIdValid && (!requiresField || fieldId !== '') && !pending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    onSubmit({
      userId: trimmedUserId,
      role,
      ...(requiresField ? { fieldId } : {}),
      ...(expiresAt ? { expiresAt: new Date(expiresAt).toISOString() } : {}),
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-[2px]"
      onClick={(e) => {
        if (e.target === e.currentTarget && !pending) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="grant-staff-modal-title"
        className="bg-[var(--card-surface)] rounded-2xl shadow-[0_8px_32px_rgba(20,28,45,0.14)] w-full max-w-[440px] overflow-hidden"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
          <h2 id="grant-staff-modal-title" className="text-[16px] font-bold text-[var(--text-strong)]">
            스태프 배정
          </h2>
          <button
            type="button"
            onClick={() => !pending && onClose()}
            disabled={pending}
            aria-label="모달 닫기"
            className="flex items-center justify-center w-[44px] h-[44px] rounded-lg text-gray-400 hover:text-[var(--text-muted)] hover:bg-[var(--surface-soft)] transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 disabled:opacity-40"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <div className="px-5 py-5 flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="grant-staff-user-id" className="text-[13px] font-semibold text-[var(--text-body)]">
                사용자 ID (UUID) <span className="text-red-500" aria-hidden="true">*</span>
                <span className="sr-only">(필수)</span>
              </label>
              <input
                id="grant-staff-user-id"
                ref={firstFieldRef}
                type="text"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                disabled={pending}
                placeholder="00000000-0000-4000-8000-000000000000"
                className="h-[44px] px-3 text-sm bg-[var(--card-surface)] border border-[var(--border)] rounded-xl text-[var(--text-strong)] placeholder:text-gray-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-colors disabled:opacity-50"
              />
              {userId.length > 0 && !userIdValid && (
                <p className="text-[12px] text-red-500" role="alert">
                  올바른 UUID 형식이 아니에요.
                </p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="grant-staff-role" className="text-[13px] font-semibold text-[var(--text-body)]">
                역할
              </label>
              <select
                id="grant-staff-role"
                value={role}
                onChange={(e) => setRole(e.target.value as Exclude<V1TournamentStaffRole, 'PLATFORM_OPS'>)}
                disabled={pending}
                className="h-[44px] px-3 text-sm bg-[var(--card-surface)] border border-[var(--border)] rounded-xl text-[var(--text-strong)] focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-colors disabled:opacity-50"
              >
                {roleOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {requiresField && (
              <div className="flex flex-col gap-1.5">
                <label htmlFor="grant-staff-field" className="text-[13px] font-semibold text-[var(--text-body)]">
                  담당 필드 <span className="text-red-500" aria-hidden="true">*</span>
                  <span className="sr-only">(필수)</span>
                </label>
                <select
                  id="grant-staff-field"
                  value={fieldId}
                  onChange={(e) => setFieldId(e.target.value)}
                  disabled={pending}
                  className="h-[44px] px-3 text-sm bg-[var(--card-surface)] border border-[var(--border)] rounded-xl text-[var(--text-strong)] focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-colors disabled:opacity-50"
                >
                  <option value="">필드를 선택해주세요</option>
                  {fields.map((field) => (
                    <option key={field.id} value={field.id}>
                      {field.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label htmlFor="grant-staff-expires" className="text-[13px] font-semibold text-[var(--text-body)]">
                만료 시각 (선택)
              </label>
              <input
                id="grant-staff-expires"
                type="datetime-local"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                disabled={pending}
                className="h-[44px] px-3 text-sm bg-[var(--card-surface)] border border-[var(--border)] rounded-xl text-[var(--text-strong)] focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-colors disabled:opacity-50"
              />
            </div>

            {errorMessage && (
              <p className="text-[13px] text-red-500" role="alert">
                {errorMessage}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2 px-5 pb-5">
            <button
              type="button"
              onClick={() => !pending && onClose()}
              disabled={pending}
              className="flex-1 h-[48px] rounded-xl text-[15px] font-semibold text-[var(--text-muted)] bg-[var(--surface-soft)] hover:bg-gray-200 dark:hover:bg-white/20 transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 disabled:opacity-50"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className={[
                'flex-1 h-[48px] rounded-xl text-[15px] font-semibold transition-colors',
                'focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2',
                canSubmit
                  ? 'bg-blue-500 text-white hover:bg-blue-600'
                  : 'bg-blue-200 dark:bg-blue-500/30 text-white cursor-not-allowed',
              ].join(' ')}
            >
              {pending ? '배정 중…' : '배정하기'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
