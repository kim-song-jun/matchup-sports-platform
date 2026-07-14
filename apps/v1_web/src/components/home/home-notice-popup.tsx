'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { HomePopup } from './home.types';

const HIDE_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
const STORAGE_KEY_PREFIX = 'teameet:v1:home-popup:hidden-until:';
const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function getHomePopupStorageKey(popupId: string) {
  return `${STORAGE_KEY_PREFIX}${popupId}`;
}

export function HomePopupDialog({ popup }: { popup: HomePopup | null }) {
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const bodyId = useId();

  useEffect(() => {
    if (!popup) {
      setOpen(false);
      return;
    }

    try {
      const hiddenUntil = Number(window.localStorage.getItem(getHomePopupStorageKey(popup.id)));
      setOpen(!Number.isFinite(hiddenUntil) || hiddenUntil <= Date.now());
    } catch {
      setOpen(true);
    }
  }, [popup?.id]);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement as HTMLElement | null;
    document.body.style.overflow = 'hidden';
    const focusTimer = window.setTimeout(() => closeButtonRef.current?.focus(), 0);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;

      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [open]);

  if (!popup || !open || typeof document === 'undefined') return null;

  const hideForAWeek = () => {
    try {
      window.localStorage.setItem(getHomePopupStorageKey(popup.id), String(Date.now() + HIDE_DURATION_MS));
    } catch {
      // Storage can be unavailable in private browsing; closing the popup must still work.
    }
    setOpen(false);
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(25, 31, 40, 0.48)' }}
      onClick={(event) => {
        if (event.target === event.currentTarget) setOpen(false);
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        className="w-full max-w-[420px] overflow-hidden rounded-2xl"
        style={{ background: 'var(--surface, #fff)', boxShadow: 'var(--shadow-modal)' }}
      >
        <div style={{ padding: '24px 24px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
            <h2 id={titleId} className="tm-text-subhead" style={{ margin: 0, color: 'var(--text-strong)' }}>
              {popup.title}
            </h2>
            <button
              ref={closeButtonRef}
              type="button"
              className="tm-btn tm-btn-icon tm-btn-ghost"
              aria-label="팝업 닫기"
              onClick={() => setOpen(false)}
              style={{ marginTop: -10, marginRight: -10 }}
            >
              <span aria-hidden="true" style={{ fontSize: 24, lineHeight: 1 }}>×</span>
            </button>
          </div>

          <div className="tm-text-micro" style={{ marginTop: 2, color: 'var(--text-subtle)' }}>
            {popup.trailing}
          </div>
          <p
            id={bodyId}
            className="tm-text-label"
            style={{ margin: '24px 0 0', color: 'var(--text-muted)', lineHeight: 1.65, whiteSpace: 'pre-wrap', maxHeight: 180, overflowY: 'auto' }}
          >
            {popup.body}
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 8, padding: '0 24px 24px' }}>
          <button type="button" className="tm-btn tm-btn-md tm-btn-ghost" onClick={hideForAWeek}>
            일주일 안 보기
          </button>
          <button type="button" className="tm-btn tm-btn-md tm-btn-primary" onClick={() => setOpen(false)}>
            닫기
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
