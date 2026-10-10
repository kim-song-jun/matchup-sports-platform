'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Check, Copy, MapPin } from 'lucide-react';
import { KakaoMapPreview } from '@/components/v1-ui/kakao-map-preview';
import {
  detectPlaceNavPlatform,
  hasCoordinates,
  placeNavigationLinks,
  type PlaceNavLink,
  type PlaceNavPlatform,
} from '@/lib/place';
import type { V1PlaceView } from '@/types/api';

/** 지도 앱 브랜드 마크. 색은 의미 구분이 아니라 로고 표기라 이 한 곳에만 둔다(텍스트 라벨 병행). */
const BRAND_DOT_BACKGROUND: Record<PlaceNavLink['key'], string> = {
  kakao: 'var(--map-brand-kakao)',
  naver: 'var(--map-brand-naver)',
  tmap: 'linear-gradient(135deg, var(--map-brand-tmap-from), var(--map-brand-tmap-to))',
};

function BrandDot({ appKey }: { appKey: PlaceNavLink['key'] }) {
  return (
    <i
      aria-hidden="true"
      style={{
        width: 16,
        height: 16,
        borderRadius: 'var(--radius-tight)',
        flex: 'none',
        display: 'inline-block',
        background: BRAND_DOT_BACKGROUND[appKey],
        boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--static-ink) 8%, transparent)',
      }}
    />
  );
}

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
  const links = placeNavigationLinks(place, platform);

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
    <div>
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

      <div
        role="group"
        aria-label={coords ? '길찾기 앱 선택' : '지도 앱에서 장소 찾기'}
        style={{ display: 'grid', gridTemplateColumns: `repeat(${links.length}, minmax(0, 1fr))`, gap: 8, marginTop: 12 }}
      >
        {links.map((link) => (
          <a
            key={link.key}
            href={link.href}
            target={link.href.startsWith('http') ? '_blank' : undefined}
            rel={link.href.startsWith('http') ? 'noopener noreferrer' : undefined}
            aria-label={`${link.label}${link.mode === 'route' ? '으로 길찾기' : '에서 이름 검색'}`}
            className="tm-btn tm-btn-sm tm-btn-neutral"
            style={{ width: '100%', padding: '0 8px', gap: 6 }}
          >
            <BrandDot appKey={link.key} />
            {link.label}
          </a>
        ))}
      </div>
    </div>
  );
}
