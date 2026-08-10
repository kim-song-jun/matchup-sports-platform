'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Eye, EyeOff, Lock, X } from 'lucide-react';
import {
  useV1OperationFlag,
  useV1SimplifiedOperationFlagGateStatus,
  useV1SimplifiedToggleOperationFlag,
} from '@/hooks/use-v1-api';
import { V1ApiError } from '@/lib/api-client';
import { extractErrorMessage } from '@/lib/error-message';
import { useAdminToast, AdminToasts } from './admin-toast';
import type { V1GameOperationFlag, V1GameOperationFlagKey } from '@/types/api';

// ── Copy ─────────────────────────────────────────────────────────────────
type FlagMeta = {
  key: V1GameOperationFlagKey;
  label: string;
  onSummary: string;
  onWarning: string;
  offSummary: string;
};

const FLAGS: readonly FlagMeta[] = [
  {
    key: 'PUBLIC_LIVE',
    label: '관전자 실시간 점수 공개',
    onSummary:
      '켜져 있으면 진행 중인 대회 경기의 점수·경기 시계가 관전자 화면(비로그인 포함)에 그대로 보여요.',
    onWarning:
      '지금 켜면 진행 중인 모든 경기의 실시간 점수가 즉시 공개돼요. 문제가 생기면 언제든 다시 끌 수 있어요.',
    offSummary: '꺼져 있으면 관전자에게는 경기 상태(진행중·종료)만 보이고 점수는 가려져요.',
  },
  {
    key: 'DIRECTOR_OFFICIALIZE',
    label: '심판 결과 공식화',
    onSummary: '켜져 있으면 대회 진행 요원이 경기 결과를 공식 기록으로 확정할 수 있어요.',
    onWarning: '지금 켜면 대회 진행 요원이 즉시 결과를 공식화할 수 있게 돼요. 언제든 다시 끌 수 있어요.',
    offSummary: '꺼져 있으면 결과 공식화 화면이 비활성 상태로 보여요.',
  },
] as const;

// ── Error copy ───────────────────────────────────────────────────────────
function friendlyErrorMessage(err: unknown): string {
  if (err instanceof V1ApiError) {
    switch (err.code) {
      case 'SIMPLIFIED_GATE_DISABLED':
        return '이 환경에서는 간소 토글을 쓸 수 없어요 — 프로덕션 게이트 절차를 따라야 해요.';
      case 'CUTOVER_ORDER_VIOLATION':
        return '아직 켤 수 없어요 — 경기 데이터 이관(GAME_WRITE/GAME_READ)이 새 시스템으로 완전히 넘어간 뒤에만 켤 수 있어요.';
      case 'VERSION_CONFLICT':
        return '다른 곳에서 이미 값이 바뀌었어요. 화면을 새로고침한 뒤 다시 시도해 주세요.';
      case 'PERMISSION_DENIED':
        return '이 작업은 운영진(ops) 이상 권한이 필요해요.';
      case 'SIMPLIFIED_GATE_KEY_NOT_ALLOWED':
        return '이 플래그는 간소 토글로 바꿀 수 없어요.';
      default:
        break;
    }
  }
  return extractErrorMessage(err, '처리에 실패했어요.');
}

// ── Confirm modal ────────────────────────────────────────────────────────
interface ConfirmModalProps {
  open: boolean;
  pending: boolean;
  turningOn: boolean;
  flagLabel: string;
  warningText: string;
  onConfirm: (reason: string) => void;
  onClose: () => void;
}

const REASON_MAX = 500;

function ToggleConfirmModal({
  open,
  pending,
  turningOn,
  flagLabel,
  warningText,
  onConfirm,
  onClose,
}: ConfirmModalProps) {
  const [reason, setReason] = useState('');
  const panelRef = useRef<HTMLDivElement>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<Element | null>(null);

  useEffect(() => {
    if (open) setReason('');
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
      const t = setTimeout(() => confirmButtonRef.current?.focus(), 60);
      return () => clearTimeout(t);
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
    const panel = panelRef.current;
    if (!panel) return;
    const sel = 'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';
    const trap = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>(sel));
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
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
    if (open) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  if (!open) return null;

  const trimmedReason = reason.trim();
  const canSubmit = trimmedReason.length > 0 && !pending;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-[2px]"
      onClick={(e) => {
        if (e.target === e.currentTarget && !pending) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="operation-flag-confirm-title"
        aria-describedby="operation-flag-confirm-desc"
        className="bg-white rounded-2xl shadow-[var(--shadow-modal)] w-full max-w-[440px] overflow-hidden"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2
            id="operation-flag-confirm-title"
            className="text-[16px] font-bold text-gray-900 flex items-center gap-1.5"
          >
            <AlertTriangle size={17} className="text-amber-500" aria-hidden="true" />
            {flagLabel} {turningOn ? '켜기' : '끄기'}
          </h2>
          <button
            type="button"
            onClick={() => !pending && onClose()}
            disabled={pending}
            aria-label="모달 닫기"
            className="flex items-center justify-center w-[44px] h-[44px] rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 disabled:opacity-40"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (canSubmit) onConfirm(trimmedReason);
          }}
          noValidate
        >
          <div className="px-5 py-5 flex flex-col gap-3.5">
            <p
              id="operation-flag-confirm-desc"
              className={[
                'text-[13px] leading-relaxed rounded-xl border px-3.5 py-3',
                turningOn
                  ? 'text-amber-800 bg-amber-50 border-amber-100'
                  : 'text-blue-700 bg-blue-50 border-blue-100',
              ].join(' ')}
            >
              {warningText}
              {turningOn && ' 되돌릴 수 있는 조작이에요.'}
            </p>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="operation-flag-confirm-reason" className="text-[13px] font-semibold text-gray-700">
                사유 <span className="text-red-500" aria-hidden="true">*</span>
                <span className="sr-only">(필수)</span>
              </label>
              <textarea
                id="operation-flag-confirm-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={REASON_MAX}
                rows={3}
                disabled={pending}
                placeholder="이 작업이 왜 필요한지 남겨 주세요. 감사 로그에 그대로 기록돼요."
                className={[
                  'px-3 py-2.5 text-sm bg-white border border-gray-200 rounded-xl text-gray-900 resize-none',
                  'placeholder:text-gray-400',
                  'focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20',
                  'transition-colors disabled:opacity-50',
                ].join(' ')}
                aria-required="true"
              />
              <p className="text-[11px] text-right text-gray-400 tabular-nums">
                {reason.length} / {REASON_MAX}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 px-5 pb-5">
            <button
              type="button"
              onClick={() => !pending && onClose()}
              disabled={pending}
              className="flex-1 h-[48px] rounded-xl text-[15px] font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 disabled:opacity-50"
            >
              취소
            </button>
            <button
              ref={confirmButtonRef}
              type="submit"
              disabled={!canSubmit}
              className={[
                'flex-1 h-[48px] rounded-xl text-[15px] font-semibold transition-colors',
                'focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2',
                canSubmit
                  ? turningOn
                    ? 'bg-amber-500 text-white hover:bg-amber-600'
                    : 'bg-blue-500 text-white hover:bg-blue-600'
                  : 'bg-gray-200 text-white cursor-not-allowed',
              ].join(' ')}
              aria-disabled={!canSubmit}
            >
              {pending ? '처리 중…' : turningOn ? '공개하기' : '끄기'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Flag card ────────────────────────────────────────────────────────────
function FlagCard({
  meta,
  gateEnabled,
  showToast,
}: {
  meta: FlagMeta;
  gateEnabled: boolean;
  showToast: (message: string, variant?: 'success' | 'error') => void;
}) {
  const { data: flag, isPending, isError } = useV1OperationFlag(meta.key);
  const toggleMutation = useV1SimplifiedToggleOperationFlag(meta.key);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const isOn = flag?.value === 'on';
  const turningOn = !isOn;

  function submit(reason: string) {
    if (!flag) return;
    toggleMutation.mutate(
      { expectedVersion: flag.version, value: turningOn ? 'on' : 'off', reason },
      {
        onSuccess: (updated: V1GameOperationFlag) => {
          showToast(
            `${meta.label}: ${updated.value === 'on' ? '공개로 전환했어요.' : '비공개로 전환했어요.'}`,
            'success',
          );
          setConfirmOpen(false);
        },
        onError: (err) => {
          showToast(friendlyErrorMessage(err), 'error');
          setConfirmOpen(false);
        },
      },
    );
  }

  return (
    <div className="flex flex-col gap-3 bg-white border border-gray-100 rounded-2xl p-5 md:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-[15px] font-bold text-gray-900">{meta.label}</h3>
            {!isPending && flag && (
              <span
                className={[
                  'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold',
                  isOn ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500',
                ].join(' ')}
              >
                {isOn ? <Eye size={11} aria-hidden="true" /> : <EyeOff size={11} aria-hidden="true" />}
                {isOn ? '공개 중' : '비공개'}
              </span>
            )}
          </div>
          <p className="text-[13px] text-gray-500 mt-1 leading-relaxed">
            {isOn ? meta.onSummary : meta.offSummary}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          disabled={isPending || isError || !gateEnabled}
          className={[
            'shrink-0 inline-flex items-center justify-center min-h-[40px] px-4 rounded-xl text-[13px] font-semibold transition-colors',
            'focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 disabled:opacity-40 disabled:cursor-not-allowed',
            isOn ? 'bg-gray-100 text-gray-700 hover:bg-gray-200' : 'bg-blue-500 text-white hover:bg-blue-600',
          ].join(' ')}
        >
          {isOn ? '끄기' : '켜기'}
        </button>
      </div>

      {flag && (
        <dl className="grid grid-cols-3 gap-2 pt-3 border-t border-gray-50 text-[12px]">
          <div>
            <dt className="text-gray-400">버전</dt>
            <dd className="text-gray-700 font-medium tabular-nums">v{flag.version}</dd>
          </div>
          <div>
            <dt className="text-gray-400">마지막 변경자</dt>
            <dd className="text-gray-700 font-medium truncate">{flag.updatedByUserId ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-gray-400">마지막 변경 시각</dt>
            <dd className="text-gray-700 font-medium">
              {new Date(flag.updatedAt).toLocaleString('ko-KR', {
                month: 'numeric',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </dd>
          </div>
        </dl>
      )}

      <ToggleConfirmModal
        open={confirmOpen}
        pending={toggleMutation.isPending}
        turningOn={turningOn}
        flagLabel={meta.label}
        warningText={turningOn ? meta.onWarning : meta.offSummary}
        onConfirm={submit}
        onClose={() => {
          if (!toggleMutation.isPending) setConfirmOpen(false);
        }}
      />
    </div>
  );
}

// ── Panel ────────────────────────────────────────────────────────────────
export function OperationFlagTogglePanel() {
  const {
    data: gateStatus,
    isPending: gateStatusPending,
    isError: gateStatusError,
  } = useV1SimplifiedOperationFlagGateStatus();
  const { toasts, showToast } = useAdminToast();
  const gateEnabled = gateStatus?.enabled ?? false;

  return (
    <div className="flex flex-col gap-4">
      {/* Copilot 리뷰: 조회가 403(권한 없음)·네트워크 오류로 실패해도
          `gateStatus?.enabled ?? false` 때문에 "이 환경에서는 간소 토글이
          꺼져 있어요"로 읽혔다. 운영자는 "환경 설정이 그렇구나"로 오해하고
          권한 문제를 영영 못 찾는다. 조회 실패는 별도로 안내한다. */}
      {!gateStatusPending && gateStatusError && (
        <p className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400">
          <Lock size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
          간소 토글을 쓸 수 있는지 확인하지 못했어요. 권한이 없거나 일시적인 오류일 수 있어요 —
          새로고침해도 같으면 플랫폼 운영자에게 문의해 주세요.
        </p>
      )}

      {!gateStatusPending && !gateStatusError && !gateEnabled && (
        <p
          role="note"
          className="text-[13px] text-gray-700 bg-gray-100 border border-gray-200 rounded-xl px-3.5 py-3 flex items-start gap-2"
        >
          <Lock size={15} className="text-gray-400 shrink-0 mt-0.5" aria-hidden="true" />
          이 환경에서는 간소 토글이 꺼져 있어요. 실서비스 프로덕션에서는 항상 이 상태이고, 값을
          바꾸려면 <code className="text-[12px] bg-gray-200 rounded px-1 py-0.5">docs/api/domains/game-migration.md</code>의
          정식 게이트 번들(R1/R2 서명, 최소 14일) 절차를 거쳐야 해요.
        </p>
      )}

      <div className="flex flex-col gap-3.5">
        {FLAGS.map((meta) => (
          <FlagCard key={meta.key} meta={meta} gateEnabled={gateEnabled} showToast={showToast} />
        ))}
      </div>

      <AdminToasts toasts={toasts} />
    </div>
  );
}
