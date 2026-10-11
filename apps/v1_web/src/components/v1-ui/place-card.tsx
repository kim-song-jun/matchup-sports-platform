'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Check, Copy, MapPin, Navigation, Search } from 'lucide-react';
import { ActionSheet, type ActionSheetAction } from '@/components/v1-ui/action-sheet';
import { closeOverlayThenNavigate } from '@/lib/overlay-history';
import { KakaoMapPreview } from '@/components/v1-ui/kakao-map-preview';
import {
  detectPlaceNavPlatform,
  hasCoordinates,
  placeNavigationLinks,
  type PlaceNavPlatform,
} from '@/lib/place';
import type { V1PlaceView } from '@/types/api';

type CopyState = 'idle' | 'copied' | 'failed';

/**
 * 장소 상세 카드(표시용). 좌표가 있으면 지도 미리보기 + 앱별 길찾기, 없으면 지도 없이
 * 지도 앱 "이름 검색" 버튼만 보여 준다. `badge` 는 "이 경기만 장소가 달라요" 같은 보조 표식 자리.
 */
export function PlaceCard({
  place,
  badge,
  platform: platformOverride,
}: {
  place: V1PlaceView;
  badge?: ReactNode;
  /** 테스트·스토리용. 생략하면 UA 로 감지한다. */
  platform?: PlaceNavPlatform;
}) {
  const [platform, setPlatform] = useState<PlaceNavPlatform>(platformOverride ?? 'web');
  const [navOpen, setNavOpen] = useState(false);
  const [storeHint, setStoreHint] = useState<{ label: string; href: string } | null>(null);
  const [copyState, setCopyState] = useState<CopyState>('idle');
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!platformOverride) setPlatform(detectPlaceNavPlatform());
  }, [platformOverride]);

  useEffect(
    () => () => {
      if (resetTimer.current) clearTimeout(resetTimer.current);
    },
    [],
  );

  const coords = hasCoordinates(place) ? place : null;
  const navTitle = coords ? '길찾기' : '지도 앱에서 찾기';
  const navActions: ActionSheetAction[] = placeNavigationLinks(place, platform).map((link) => {
    const base = {
      key: link.key,
      label: link.label,
      description: link.description,
      // 장식(alt="") — 라벨이 앱 이름을 말한다. 흰 바탕 아이콘(네이버·티맵)이 배경에 묻히지 않게 테두리를 둔다.
      icon: (
        <img src={link.iconSrc} alt="" width={36} height={36} style={{ borderRadius: 'var(--radius-chip)', border: '1px solid var(--border)' }} />
      ),
    };
    if (link.onSelect) {
      const { onSelect: open, storeHref, label } = link;
      const close = () => {
        setNavOpen(false);
        setStoreHint({ label, href: storeHref });
      };
      return { ...base, onSelect: () => void closeOverlayThenNavigate(close, open) };
    }
    return { ...base, externalHref: link.href, newTab: link.newTab };
  });

  async function copyAddress() {
    if (!place.address) return;
    try {
      await navigator.clipboard.writeText(place.address);
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }
    if (resetTimer.current) clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => setCopyState('idle'), 4000);
  }

  return (
    // 정보 행 안에 놓이면 행의 `text-align: right !important`(데스크톱 팀매치 상세)를 물려받는다 — 카드가 스스로 정한다.
    <div style={{ textAlign: 'left' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <MapPin size={18} strokeWidth={2} aria-hidden="true" style={{ color: 'var(--blue700)', marginTop: 2, flex: 'none' }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="tm-text-label" style={{ color: 'var(--text-strong)' }}>{place.name}</div>
          {place.address ? (
            <div className="tm-text-caption" style={{ color: 'var(--text-muted)', marginTop: 2 }}>{place.address}</div>
          ) : null}
          {badge ? <div style={{ marginTop: 8 }}>{badge}</div> : null}
        </div>
        {place.address ? (
          <button
            type="button"
            onClick={copyAddress}
            className="tm-text-caption transition-colors"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              minHeight: 44,
              padding: '0 4px',
              color: 'var(--blue700)',
              fontWeight: 700,
              background: 'none',
              border: 0,
              flex: 'none',
            }}
          >
            {copyState === 'copied' ? (
              <Check size={14} strokeWidth={2.4} aria-hidden="true" />
            ) : (
              <Copy size={14} strokeWidth={2} aria-hidden="true" />
            )}
            주소 복사
          </button>
        ) : null}
      </div>
      <div role="status" aria-live="polite" className="tm-text-caption" style={{ minHeight: copyState === 'idle' ? 0 : undefined, marginTop: copyState === 'idle' ? 0 : 4 }}>
        {copyState === 'copied' ? <span style={{ color: 'var(--text-muted)' }}>주소를 복사했어요.</span> : null}
        {copyState === 'failed' ? (
          <span style={{ color: 'var(--orange700)' }}>주소를 복사하지 못했어요. 주소를 길게 눌러 직접 복사해 주세요.</span>
        ) : null}
      </div>

      {coords ? (
        <div style={{ marginTop: 12 }}>
          <KakaoMapPreview name={place.name} latitude={coords.latitude} longitude={coords.longitude} />
        </div>
      ) : (
        <p className="tm-text-caption" style={{ color: 'var(--text-muted)', marginTop: 12, lineHeight: 1.5 }}>
          정확한 위치가 등록되지 않았어요. 지도 앱에서 이름으로 찾아볼 수 있어요.
        </p>
      )}

      <button
        type="button"
        onClick={() => setNavOpen(true)}
        className="tm-btn tm-btn-md tm-btn-neutral"
        style={{ width: '100%', marginTop: 12, gap: 6 }}
      >
        {coords ? <Navigation size={16} aria-hidden="true" /> : <Search size={16} aria-hidden="true" />}
        {navTitle}
      </button>
      {storeHint ? (
        <div role="status" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 8 }}>
          <span className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>{storeHint.label} 앱이 열리지 않았다면</span>
          <a href={storeHint.href} className="tm-btn tm-btn-sm tm-btn-neutral" style={{ flex: 'none' }}>
            앱스토어에서 받기
          </a>
        </div>
      ) : null}
      <ActionSheet
        open={navOpen}
        title={navTitle}
        subtitle={place.address ? `${place.name} · ${place.address}` : place.name}
        actions={navActions}
        onClose={() => setNavOpen(false)}
      />
    </div>
  );
}
