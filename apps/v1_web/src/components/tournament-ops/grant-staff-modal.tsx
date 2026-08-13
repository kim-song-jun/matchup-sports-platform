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

/**
 * 입력값이 왜 막혔는지 말해 준다(해요체). 종전에는 제출 버튼이 조용히 잠겨 있을 뿐이라
 * 운영자가 "왜 안 눌리는지" 알 방법이 없었다 — 특히 담당 필드 미선택이 그랬다.
 */
function validationMessage(
  trimmedUserId: string,
  role: Exclude<V1TournamentStaffRole, 'PLATFORM_OPS'>,
  fieldId: string,
  fieldCount: number,
): string | null {
  if (trimmedUserId.length === 0) {
    return '배정할 사용자 ID를 입력해 주세요.';
  }
  if (!UUID_PATTERN.test(trimmedUserId)) {
    return '올바른 UUID 형식이 아니에요. 사용자 관리 화면에서 복사한 ID를 그대로 붙여넣어 주세요.';
  }
  if (role === 'FIELD_OPERATOR' && fieldId === '') {
    return fieldCount === 0
      ? '등록된 경기장이 없어 필드 담당자를 배정할 수 없어요. 위쪽 “경기장(필드)”에서 먼저 등록해 주세요.'
      : '필드 담당자는 담당 경기장을 골라야 해요.';
  }
  return null;
}

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
  const [submitAttempted, setSubmitAttempted] = useState(false);

  const dialogRef = useRef<HTMLDivElement>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const fieldSelectRef = useRef<HTMLSelectElement>(null);
  const previousFocusRef = useRef<Element | null>(null);

  useEffect(() => {
    if (open) {
      setUserId('');
      setRole(roleOptions[0]?.value ?? 'SUPPORT_READONLY');
      setFieldId('');
      setExpiresAt('');
      setSubmitAttempted(false);
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
  const validationError = validationMessage(trimmedUserId, role, fieldId, fields.length);
  // 버튼은 잠그지 않는다 — 눌러야 막힌 이유를 알 수 있다(제출 시 검증).
  const canSubmit = !pending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pending) return;
    setSubmitAttempted(true);
    if (validationError !== null) {
      // 막힌 입력으로 초점을 옮겨 준다 — 사유만 띄우고 커서를 그대로 두면
      // 키보드 사용자는 어디를 고쳐야 하는지 찾아다녀야 한다.
      const target = userIdValid ? fieldSelectRef.current : firstFieldRef.current;
      target?.focus();
      return;
    }
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
                사용자 ID (UUID) <span className="text-[var(--red700)]" aria-hidden="true">*</span>
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
                aria-describedby="grant-staff-user-id-help"
                aria-invalid={submitAttempted && !userIdValid ? true : undefined}
                className="h-[44px] px-3 text-sm bg-[var(--card-surface)] border border-[var(--border)] rounded-xl text-[var(--text-strong)] placeholder:text-gray-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-colors disabled:opacity-50"
              />
              <p id="grant-staff-user-id-help" className="text-[12px] text-[var(--text-muted)]">
                배정할 분의 사용자 ID예요. 어드민 &gt; 사용자 관리에서 그 사람의 ID를 복사해 붙여넣어 주세요.
              </p>
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
                  담당 필드 <span className="text-[var(--red700)]" aria-hidden="true">*</span>
                  <span className="sr-only">(필수)</span>
                </label>
                <select
                  id="grant-staff-field"
                  ref={fieldSelectRef}
                  value={fieldId}
                  onChange={(e) => setFieldId(e.target.value)}
                  disabled={pending || fields.length === 0}
                  aria-describedby="grant-staff-field-help"
                  className="h-[44px] px-3 text-sm bg-[var(--card-surface)] border border-[var(--border)] rounded-xl text-[var(--text-strong)] focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-colors disabled:opacity-50"
                >
                  <option value="">{fields.length === 0 ? '등록된 경기장이 없어요' : '필드를 선택해주세요'}</option>
                  {fields.map((field) => (
                    <option key={field.id} value={field.id}>
                      {field.name}
                    </option>
                  ))}
                </select>
                {/* 등록된 필드가 하나도 없으면 이 select 는 영영 비어 있고 제출 버튼도 계속 잠긴다.
                    잠긴 이유와 다음 행동을 적지 않으면 운영자는 "필드"가 뭔지도 모른 채 막힌다(#373). */}
                <p id="grant-staff-field-help" className="text-[12px] text-[var(--text-muted)]">
                  {fields.length === 0
                    ? '필드는 경기가 열리는 코트·구장이에요. 스태프 화면 위쪽 “경기장(필드)”에서 먼저 등록해 주세요.'
                    : '이 담당자가 맡을 코트·구장이에요. 배정하면 그 경기장의 경기만 담당해요.'}
                </p>
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

            {/* 배정 후 그 사람이 어디로 들어가는지 — 배정만 하고 "이제 뭘 하라고 전해야
                하는지"를 모르면 배정이 끝나도 현장은 그대로 막힌다. */}
            <p className="text-[12px] text-[var(--text-muted)] leading-relaxed bg-[var(--surface-soft)] rounded-xl px-3 py-2">
              {requiresField
                ? '배정하면 그분은 마이페이지 → “대회 운영을 맡고 있어요”에서 담당 경기 기록 화면으로 바로 들어갈 수 있어요.'
                : '배정하면 그분은 마이페이지 → “대회 운영을 맡고 있어요”에서 이 대회 운영 보드로 들어갈 수 있어요.'}
            </p>

            {submitAttempted && validationError !== null && (
              <p className="text-[13px] text-[var(--red700)]" role="alert">
                {validationError}
              </p>
            )}

            {errorMessage && (
              <p className="text-[13px] text-[var(--red700)]" role="alert">
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
