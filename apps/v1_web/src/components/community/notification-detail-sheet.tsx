'use client';

import { useEffect, useId, useRef } from 'react';
import { useDelayedUnmount } from '@/components/v1-ui/use-delayed-unmount';
import type { NotificationModel } from './community.types';
import { NotificationTypeIcon, notificationTypeLabel } from './notification-visual';

interface NotificationDetailSheetProps {
  /** null이면 닫힌 상태 — 열려 있는 동안에만 알림 모델을 넘긴다. */
  notification: NotificationModel | null;
  onClose: () => void;
  /** CTA(예: '보기') 클릭 — 알림 대상 화면으로 이동시킨다. */
  onNavigate: (notification: NotificationModel) => void;
}

/**
 * NotificationDetailSheet — 알림 상세 바텀시트.
 *
 * 알림 카드는 본문을 2줄로 잘라 보여주므로, 전문·정확한 수신 시각·이동 CTA를
 * 이 시트에서 제공한다. 접근성 처리(ESC·focus trap·스크롤 잠금·포커스 복원)는
 * ConfirmModal(v1-ui/confirm-modal.tsx)과 동일한 규약을 따른다.
 */
export function NotificationDetailSheet({ notification, onClose, onNavigate }: NotificationDetailSheetProps) {
  const idPrefix = useId();
  const titleId = `${idPrefix}-notification-title`;
  const bodyId = `${idPrefix}-notification-body`;
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<Element | null>(null);
  const open = notification !== null;
  // CSS 의 .is-closing 애니메이션(0.22s)과 같은 값이어야 한다.
  const { mounted, closing } = useDelayedUnmount(open, 220);
  const lastNotificationRef = useRef<NotificationModel | null>(null);

  // 열릴 때 이전 포커스 저장, 닫힐 때 복원 (WCAG 2.4.3)
  // 포커스 복원은 **시트가 실제로 사라진 뒤**(mounted=false)에 한다. open 기준으로
  // 하면 퇴장 애니메이션이 도는 220ms 동안 시트는 화면에 있는데 포커스만 뒤로 가서,
  // 그 사이 Tab·ESC 가 시트 밖으로 새어 나간다.
  useEffect(() => {
    if (mounted) {
      if (open) previousFocusRef.current = document.activeElement;
      return;
    }
    const el = previousFocusRef.current;
    if (el && typeof (el as HTMLElement).focus === 'function') {
      (el as HTMLElement).focus();
    }
    previousFocusRef.current = null;
  }, [open, mounted]);

  // 열릴 때 닫기 버튼에 초기 포커스
  useEffect(() => {
    if (!open) return;
    const id = setTimeout(() => closeBtnRef.current?.focus(), 60);
    return () => clearTimeout(id);
  }, [open]);

  // ESC·focus trap 은 시트가 화면에 있는 동안(mounted) 유지한다 — 닫히는 중에
  // 풀리면 그 사이 키 입력이 뒤 화면으로 샌다.
  useEffect(() => {
    if (!mounted) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [mounted, onClose]);

  // focus trap
  useEffect(() => {
    if (!mounted) return;
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
      } else if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', trap);
    return () => document.removeEventListener('keydown', trap);
  }, [mounted]);

  // body 스크롤 잠금도 시트가 사라진 뒤에 푼다 — 닫히는 중에 풀면 시트가 아직
  // 화면에 있는데 뒤 화면이 스크롤된다.
  useEffect(() => {
    if (mounted) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [mounted]);

  // 닫히는 동안 보여줄 내용을 붙들어 둔다 — notification 이 곧 열림 상태라
  // 그대로 두면 퇴장 애니메이션이 도는 사이 빈 시트가 보인다.
  if (notification) lastNotificationRef.current = notification;
  const shown = notification ?? lastNotificationRef.current;

  if (!mounted || !shown) return null;

  return (
    <div
      className={`tm-notification-sheet-backdrop${closing ? ' is-closing' : ''}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        className={`tm-notification-sheet${closing ? ' is-closing' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="tm-notification-sheet-grabber" aria-hidden="true" />

        <div className="tm-notification-sheet-head">
          <div className="tm-notification-icon" aria-hidden="true">
            <NotificationTypeIcon type={shown.type} size={18} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 id={titleId} className="tm-text-body-lg" style={{ margin: 0 }}>
              {shown.title}
            </h2>
            <div className="tm-notification-meta">
              {notificationTypeLabel(shown.type)} · {shown.time}
            </div>
          </div>
        </div>

        <p id={bodyId} className="tm-notification-sheet-body">
          {shown.body || '추가 안내 내용이 없어요.'}
        </p>

        <div className="tm-notification-sheet-actions">
          <button
            ref={closeBtnRef}
            type="button"
            className="tm-btn tm-btn-md tm-btn-neutral"
            style={{ flex: 1, minHeight: 44 }}
            onClick={onClose}
          >
            닫기
          </button>
          <button
            type="button"
            className="tm-btn tm-btn-md tm-btn-primary"
            style={{ flex: 1, minHeight: 44 }}
            onClick={() => onNavigate(shown)}
          >
            {shown.actionLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
