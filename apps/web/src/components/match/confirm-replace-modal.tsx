'use client';

import { useEffect, useRef } from 'react';
import { AlertTriangle, X } from 'lucide-react';

// ── Props ──────────────────────────────────────────────────────────────────────

export interface ConfirmReplaceModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  currentTeams: { teamName: string; memberCount: number }[];
  loading?: boolean;
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * Standalone alertdialog for confirming team-composition replacement.
 * Intentionally does NOT wrap components/ui/modal.tsx because that component
 * hardcodes role="dialog". Task 72 A3 requires role="alertdialog" here,
 * and placing this at z-[100] avoids focus-trap conflicts with the parent
 * AutoBalanceModal (z-[90]).
 *
 * ESC / backdrop click = 취소 (no mutation fired).
 */
export function ConfirmReplaceModal({
  open,
  onClose,
  onConfirm,
  currentTeams,
  loading = false,
}: ConfirmReplaceModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // ESC key + focus trap
  useEffect(() => {
    if (!open) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !panelRef.current) return;

      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown);

    // Auto-focus the first focusable element (cancel button)
    const timer = setTimeout(() => {
      const first = panelRef.current?.querySelector<HTMLElement>('button:not([disabled])');
      first?.focus();
    }, 50);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      clearTimeout(timer);
    };
  }, [open, onClose]);

  if (!open) return null;

  // Build summary text: "A팀(5명) · B팀(5명)" joined by middle dot
  const teamSummary = currentTeams
    .map((t) => `${t.teamName}(${t.memberCount}명)`)
    .join(' · ');

  return (
    // Backdrop — higher z than parent modal (z-[90]) to stack correctly
    <div
      className="fixed inset-0 z-[100] flex items-end lg:items-center justify-center"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="confirm-replace-title"
      aria-describedby="confirm-replace-desc"
    >
      {/* Scrim */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        ref={panelRef}
        className="relative w-full max-w-sm mx-4 lg:mx-auto bg-white dark:bg-gray-800 rounded-t-2xl lg:rounded-2xl p-6 animate-slide-up lg:animate-scale-in"
      >
        {/* Close button */}
        <button
          onClick={onClose}
          aria-label="닫기"
          className="absolute top-3 right-3 rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 active:bg-gray-200 transition-colors min-w-11 min-h-[44px] flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
        >
          <X size={20} aria-hidden="true" />
        </button>

        {/* Warning icon */}
        <div className="flex items-center justify-center w-12 h-12 rounded-full bg-amber-50 dark:bg-amber-900/20 mx-auto mb-4">
          <AlertTriangle
            size={24}
            aria-hidden="true"
            className="text-amber-600 dark:text-amber-400"
          />
        </div>

        {/* Title */}
        <h2
          id="confirm-replace-title"
          className="text-base font-bold text-gray-900 dark:text-white text-center mb-2"
        >
          팀 구성을 교체할까요?
        </h2>

        {/* Description */}
        <p
          id="confirm-replace-desc"
          className="text-sm text-gray-600 dark:text-gray-300 text-center mb-5 leading-relaxed"
        >
          현재{' '}
          <span className="font-semibold text-gray-800 dark:text-gray-100">
            {teamSummary}
          </span>{' '}
          구성이 새 배정으로 교체돼요. 참가자에게는 새 구성만 보여요.
        </p>

        {/* CTAs */}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="flex-1 rounded-xl bg-gray-100 dark:bg-gray-700 py-3 text-base font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors min-h-[44px] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          >
            취소
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 rounded-xl bg-red-500 py-3 text-base font-bold text-white hover:bg-red-600 active:bg-red-700 transition-colors min-h-[44px] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span
                  className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"
                  aria-hidden="true"
                />
                교체 중...
              </span>
            ) : (
              '교체'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
