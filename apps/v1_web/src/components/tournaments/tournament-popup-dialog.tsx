'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { V1TournamentDetailPopup } from '@/types/api';
import { TournamentCampaignMedia } from './tournament-campaign-media';

const HIDE_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
const STORAGE_KEY_PREFIX = 'teameet:v1:tournament-popup:hidden-until:';
const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function getTournamentPopupStorageKey(popupId: string) {
  return `${STORAGE_KEY_PREFIX}${popupId}`;
}

/**
 * 대회 상세 페이지 전용 공지/홍보 팝업(Task 109 Track 8).
 * 기존 홈 전역 팝업(HomePopupDialog)과 동일한 UX 패턴 — localStorage로 7일 재노출 방지.
 */
export function TournamentPopupDialog({ popup }: { popup: V1TournamentDetailPopup | null }) {
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
      const hiddenUntil = Number(window.localStorage.getItem(getTournamentPopupStorageKey(popup.popupId)));
      setOpen(!Number.isFinite(hiddenUntil) || hiddenUntil <= Date.now());
    } catch {
      setOpen(true);
    }
  }, [popup?.popupId]);

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
      window.localStorage.setItem(
        getTournamentPopupStorageKey(popup.popupId),
        String(Date.now() + HIDE_DURATION_MS),
      );
    } catch {
      // Storage can be unavailable in private browsing; closing the popup must still work.
    }
    setOpen(false);
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 p-4"
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
        className="w-full max-w-[420px] overflow-hidden rounded-2xl bg-[var(--surface)] shadow-[var(--shadow-modal)]"
      >
        {popup.imageUrl ? (
          <TournamentCampaignMedia
            src={popup.imageUrl}
            sportCode=""
            alt=""
            className="h-auto max-h-[240px] w-full object-cover"
          />
        ) : null}

        <div className="px-6 pb-5 pt-6">
          <div className="flex items-start justify-between gap-4">
            <h2 id={titleId} className="tm-text-subhead m-0 text-[var(--text-strong)]">
              {popup.title}
            </h2>
            <button
              ref={closeButtonRef}
              type="button"
              className="tm-btn tm-btn-icon tm-btn-ghost"
              aria-label="팝업 닫기"
              onClick={() => setOpen(false)}
            >
              <span aria-hidden="true" className="text-2xl leading-none">×</span>
            </button>
          </div>

          <p
            id={bodyId}
            className="tm-text-label mt-4 max-h-56 overflow-y-auto whitespace-pre-wrap leading-relaxed text-[var(--text-muted)]"
          >
            {popup.body}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 px-6 pb-6">
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
