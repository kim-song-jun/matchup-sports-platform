'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Navigation } from 'lucide-react';
import { getVenueNavigationLinks, type VenueNavPlatform } from './tournament-venue-retention-model';

function detectPlatform(): VenueNavPlatform {
  if (typeof navigator === 'undefined') return 'unknown';
  if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) return 'ios';
  if (/Android/i.test(navigator.userAgent)) return 'android';
  return 'unknown';
}

/**
 * "내비게이션 앱으로 길찾기" 버튼 — 클릭 시 카카오맵/네이버맵/티맵 3개 옵션을 보여주는
 * 드롭다운(role="menu"). 각 행은 앱 딥링크(주 액션) + 웹/설치 폴백(보조 액션)을 함께 제공.
 * 앱 미설치 시 딥링크는 브라우저가 알아서 처리(무반응 포함)하도록 둔다 — 정교한
 * UA 감지·타임아웃 폴백 로직은 의도적으로 넣지 않았다(요청 범위 밖의 과한 엔지니어링).
 */
export function TournamentVenueNavigationButton({
  venue,
  latitude,
  longitude,
}: {
  venue: string;
  latitude: number;
  longitude: number;
}) {
  const [open, setOpen] = useState(false);
  const [platform, setPlatform] = useState<VenueNavPlatform>('unknown');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    setPlatform(detectPlatform());
  }, []);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      setOpen(false);
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handlePointerDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handlePointerDown);
    };
  }, [open]);

  const links = getVenueNavigationLinks(venue, latitude, longitude, platform);

  return (
    <div style={{ position: 'relative', marginTop: 12 }}>
      <button
        ref={triggerRef}
        type="button"
        className="tm-btn tm-btn-sm tm-btn-neutral"
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 44 }}
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((prev) => !prev)}
      >
        <Navigation size={14} strokeWidth={2} aria-hidden="true" />
        내비게이션 앱으로 길찾기
      </button>

      {open ? (
        <div
          ref={panelRef}
          id={menuId}
          role="menu"
          aria-label="내비게이션 앱 선택"
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            marginTop: 6,
            minWidth: 260,
            background: 'var(--surface, #fff)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            boxShadow: '0 8px 24px rgba(20,28,45,0.14)',
            padding: 6,
            zIndex: 20,
          }}
        >
          {links.map((link) => (
            <div
              key={link.key}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
                padding: '4px 8px',
                borderRadius: 8,
              }}
            >
              <a
                role="menuitem"
                href={link.appHref}
                onClick={() => setOpen(false)}
                className="tm-text-label"
                style={{
                  color: 'var(--text-strong)',
                  flex: 1,
                  minHeight: 44,
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                {link.label}
              </a>
              <a
                href={link.fallbackHref}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setOpen(false)}
                className="tm-text-caption"
                style={{ color: 'var(--blue500)', fontWeight: 600, whiteSpace: 'nowrap' }}
              >
                {link.fallbackLabel}
              </a>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
