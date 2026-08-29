'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { useModalA11y } from '../v1-ui/use-modal-a11y';

// ── Types ─────────────────────────────────────────────────────────────────
export interface GateConfirmModalProps {
  open: boolean;
  pending: boolean;
  title: string;
  /** 본문 경고 문단. 되돌릴 수 있는 조작이면 그 사실도 이 문자열에 포함해서 넘긴다. */
  description: string;
  confirmLabel: string;
  /**
   * 강조색: 되돌릴 수 없는 조작(2단계)만 amber, 나머지는 blue.
   * R-C1(단일 블루 액센트) 준수 — amber는 이 한 곳(되돌릴 수 없음 경고)에만 쓴다.
   */
  tone: 'blue' | 'amber';
  /**
   * 되돌릴 수 없는 조작에만 넘긴다 — 값을 넘기면 사용자가 이 문자열을 정확히 타이핑해야
   * 확인 버튼이 활성화된다("전환" 같은 짧은 단어). 마찰은 위험에 비례해야 하므로 다른
   * 단계에는 이 prop 자체를 넘기지 않는다.
   */
  typedChallenge?: string;
  onConfirm: (reason: string) => void;
  onClose: () => void;
}

const REASON_MAX = 500;

/**
 * 목적격 조사를 앞말의 받침 유무로 고른다 — "전환"처럼 받침으로 끝나면 '을', "정지"처럼
 * 받침이 없으면 '를'. 조사를 문구에 박아두면 확인 문구(typedChallenge)를 바꾸는 순간
 * 조용히 비문이 된다(실제로 로컬 화면 검수에서 `"전환"를`로 잡혔다). 한글 음절은
 * U+AC00부터 종성 28개 주기로 배열되므로 (코드 - 0xAC00) % 28 로 받침 유무가 나온다.
 * 한글이 아닌 확인 문구는 판단 근거가 없으므로 더 흔한 '를'로 둔다.
 */
function objectParticle(word: string): '을' | '를' {
  const last = word.at(-1);
  if (!last) return '를';
  const code = last.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) return '를';
  return (code - 0xac00) % 28 === 0 ? '를' : '을';
}

// ── Component ─────────────────────────────────────────────────────────────
/**
 * operation-flag-toggle-panel.tsx 의 옛 ToggleConfirmModal 을 일반화한 버전 — 마스터 스위치
 * (간소 전환 모드 on/off)와 스테퍼 단계 실행 확인에 공용으로 쓴다. focus trap / Escape /
 * body scroll lock / 이전 포커스 복원은 그대로 보존.
 */
export function GateConfirmModal({
  open,
  pending,
  title,
  description,
  confirmLabel,
  tone,
  typedChallenge,
  onConfirm,
  onClose,
}: GateConfirmModalProps) {
  const [reason, setReason] = useState('');
  const [typedInput, setTypedInput] = useState('');
  // "포커스 되채감 방지" 가드까지 포함해 공용 훅으로 — 이 모달의 가드가 훅에 흡수됐다.
  const {
    dialogRef: panelRef,
    initialFocusRef,
    onBackdropClick,
    mounted,
    closing,
  } = useModalA11y<HTMLTextAreaElement>({ open, onClose, pending });

  useEffect(() => {
    if (open) {
      setReason('');
      setTypedInput('');
    }
  }, [open]);

  if (!mounted) return null;

  const trimmedReason = reason.trim();
  const typedOk = !typedChallenge || typedInput.trim() === typedChallenge;
  const canSubmit = trimmedReason.length > 0 && typedOk && !pending;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-[2px] tm-modal-scrim${closing ? ' is-closing' : ''}`}
      onClick={onBackdropClick}
    >
      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="gate-confirm-title"
        aria-describedby="gate-confirm-desc"
        className={`bg-[var(--card-surface)] rounded-2xl shadow-[var(--shadow-modal)] w-full max-w-[440px] overflow-hidden tm-modal-panel${closing ? ' is-closing' : ''}`}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
          <h2 id="gate-confirm-title" className="text-[16px] font-bold text-[var(--text-strong)] flex items-center gap-2">
            {tone === 'amber' && <AlertTriangle size={17} className="text-[var(--orange700)]" aria-hidden="true" />}
            {title}
          </h2>
          <button
            type="button"
            onClick={() => !pending && onClose()}
            disabled={pending}
            aria-label="모달 닫기"
            className="flex items-center justify-center w-[44px] h-[44px] rounded-lg text-[var(--text-muted)] hover:text-[var(--text-muted)] hover:bg-[var(--surface-soft)] transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 disabled:opacity-40"
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
          <div className="px-5 py-5 flex flex-col gap-4">
            <p
              id="gate-confirm-desc"
              className={[
                'text-[13px] leading-relaxed rounded-xl border px-4 py-3',
                tone === 'amber' ? 'text-[var(--orange700)] bg-[var(--tint-orange)] border-[var(--tint-orange-border)]' : 'text-[var(--blue700)] bg-[var(--blue50)] border-[var(--tint-blue-border)]',
              ].join(' ')}
            >
              {description}
            </p>

            <div className="flex flex-col gap-2">
              <label htmlFor="gate-confirm-reason" className="text-[13px] font-semibold text-[var(--text-body)]">
                사유 <span className="text-[var(--red700)]" aria-hidden="true">*</span>
                <span className="sr-only">(필수)</span>
              </label>
              <textarea
                id="gate-confirm-reason"
                ref={initialFocusRef}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={REASON_MAX}
                rows={3}
                disabled={pending}
                placeholder="이 작업이 왜 필요한지 남겨 주세요. 감사 로그에 그대로 기록돼요."
                className={[
                  'px-3 py-3 text-[13px] bg-[var(--card-surface)] border border-[var(--border)] rounded-xl text-[var(--text-strong)] resize-none',
                  'placeholder:text-[var(--text-muted)]',
                  'focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20',
                  'transition-colors disabled:opacity-50',
                ].join(' ')}
                aria-required="true"
              />
              <p className="text-[length:var(--font-size-caption)] text-right text-[var(--text-muted)] tabular-nums">
                {reason.length} / {REASON_MAX}
              </p>
            </div>

            {typedChallenge && (
              <div className="flex flex-col gap-2">
                <label htmlFor="gate-confirm-typed" className="text-[13px] font-semibold text-[var(--text-body)]">
                  확인을 위해 <span className="text-[var(--orange700)]">&ldquo;{typedChallenge}&rdquo;</span>
                  {objectParticle(typedChallenge)} 그대로 입력해 주세요{' '}
                  <span className="text-[var(--red700)]" aria-hidden="true">*</span>
                  <span className="sr-only">(필수)</span>
                </label>
                <input
                  id="gate-confirm-typed"
                  type="text"
                  value={typedInput}
                  onChange={(e) => setTypedInput(e.target.value)}
                  disabled={pending}
                  autoComplete="off"
                  placeholder={typedChallenge}
                  className={[
                    'h-[44px] px-3 text-[13px] bg-[var(--card-surface)] border rounded-xl text-[var(--text-strong)]',
                    'placeholder:text-[var(--text-caption)]',
                    'focus:outline-none focus:ring-2 focus:ring-[var(--orange500)]/20',
                    'transition-colors disabled:opacity-50',
                    typedInput.length > 0 && !typedOk ? 'border-red-300 focus:border-red-400' : 'border-[var(--border)] focus:border-[var(--orange500)]',
                  ].join(' ')}
                  aria-required="true"
                  aria-invalid={typedInput.length > 0 && !typedOk}
                />
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 px-5 pb-5">
            <button
              type="button"
              onClick={() => !pending && onClose()}
              disabled={pending}
              className="flex-1 h-[48px] rounded-xl text-[13px] font-semibold text-[var(--text-muted)] bg-[var(--surface-soft)] hover:bg-[var(--border)] transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 disabled:opacity-50"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className={[
                'flex-1 h-[48px] rounded-xl text-[13px] font-semibold transition-colors',
                'focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2',
                canSubmit
                  ? tone === 'amber'
                    ? 'bg-[var(--button-fill-warning)] text-white hover:bg-[var(--button-fill-warning-hover)]'
                    : 'bg-blue-500 text-white hover:bg-blue-600'
                  : 'bg-[var(--grey100)] text-[var(--text-caption)] cursor-not-allowed',
              ].join(' ')}
              aria-disabled={!canSubmit}
            >
              {pending ? '처리 중…' : confirmLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
