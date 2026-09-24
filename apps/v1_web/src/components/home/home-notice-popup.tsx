'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { RichContentRenderer } from '@/components/content/rich-content-renderer';
import type { HomePopup } from './home.types';
import { useOverlayHistory } from '@/components/v1-ui/use-overlay-history';
import { closeIfCurrentPage } from '@/lib/overlay-history';

const HIDE_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
const STORAGE_KEY_PREFIX = 'teameet:v1:home-popup:hidden-until:';
const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function getHomePopupStorageKey(popupId: string) {
  return `${STORAGE_KEY_PREFIX}${popupId}`;
}

export const getPopupStorageKey = getHomePopupStorageKey;

/**
 * location(경로+쿼리)을 주면(전역 팝업) URL 이 바뀔 때 닫는다 — 팝업 링크는 이동만 하고, 닫기는 URL 이
 * 바뀐 뒤라 오버레이 항목을 back 으로 걷지 않는다(닫기 back 과 이동 push 가 엇갈리지 않게).
 */
export function HomePopupDialog({ popup, location }: { popup: HomePopup | null; location?: string | null }) {
  const [open, setOpen] = useState(false);
  const shownLocationRef = useRef(location);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const bodyId = useId();

  // 새 화면의 팝업(id 변경) 효과보다 먼저 돌아야 그 팝업을 덮어 닫지 않는다.
  useEffect(() => {
    if (shownLocationRef.current === location) return;
    shownLocationRef.current = location;
    setOpen(false);
  }, [location]);

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

  useOverlayHistory({ open, onClose: () => setOpen(false) });
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

  const closePopup = () => setOpen(false);
  const linkLabel = popup.linkLabel?.trim() || '자세히 보기';
  // 앱 밖으로 나가는 링크는 앱 안 이동이 없어 클릭 즉시 닫아도 닫기 back 과 엇갈리지 않는다.
  const externalLink = popup.linkUrl ? !popup.linkUrl.startsWith('/') : false;

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
          <div
            id={bodyId}
            className="tm-text-label"
            style={{ margin: '24px 0 0', color: 'var(--text-muted)', lineHeight: 1.65, maxHeight: 'min(52vh, 440px)', overflowY: 'auto' }}
          >
            <RichContentRenderer content={popup.content} legacyBody={popup.body} />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 8, padding: '0 24px 24px' }}>
          <button type="button" className="tm-btn tm-btn-md tm-btn-ghost" onClick={hideForAWeek}>
            일주일 안 보기
          </button>
          {popup.linkUrl ? (
            externalLink ? (
              <a className="tm-btn tm-btn-md tm-btn-primary" href={popup.linkUrl} target="_blank" rel="noreferrer" onClick={closePopup}>
                {linkLabel}
              </a>
            ) : (
              <Link className="tm-btn tm-btn-md tm-btn-primary" href={popup.linkUrl} onClick={closeIfCurrentPage(popup.linkUrl, location ?? '', closePopup)}>
                {linkLabel}
              </Link>
            )
          ) : (
            <button type="button" className="tm-btn tm-btn-md tm-btn-primary" onClick={closePopup}>
              닫기
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
