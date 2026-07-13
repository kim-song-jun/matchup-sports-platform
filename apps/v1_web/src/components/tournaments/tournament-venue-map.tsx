'use client';

import { useEffect, useRef, useState } from 'react';
import { useV1PublicKakaoMapsKey } from '@/hooks/use-v1-api';

// ── 카카오맵 JS SDK 최소 타입 shim(우리가 실제로 쓰는 부분만) ────────────────────
interface KakaoLatLng {}
interface KakaoMapInstance {}
interface KakaoMarkerInstance {
  setMap: (map: KakaoMapInstance | null) => void;
}
interface KakaoMapsNamespace {
  maps: {
    load: (callback: () => void) => void;
    LatLng: new (lat: number, lng: number) => KakaoLatLng;
    Map: new (container: HTMLElement, options: { center: KakaoLatLng; level: number }) => KakaoMapInstance;
    Marker: new (options: { position: KakaoLatLng }) => KakaoMarkerInstance;
  };
}

declare global {
  interface Window {
    kakao?: KakaoMapsNamespace;
  }
}

let sdkLoadPromise: Promise<void> | null = null;

/** 카카오맵 JS SDK를 앱당 한 번만 로드(중복 <script> 삽입 방지, 여러 지도 인스턴스가 재사용). */
function loadKakaoMapsSdk(appKey: string): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.kakao?.maps) return Promise.resolve();
  if (sdkLoadPromise) return sdkLoadPromise;

  sdkLoadPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `//dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(appKey)}&autoload=false`;
    script.async = true;
    script.onload = () => {
      if (!window.kakao) {
        reject(new Error('Kakao Maps SDK loaded but window.kakao is missing'));
        return;
      }
      window.kakao.maps.load(() => resolve());
    };
    script.onerror = () => {
      sdkLoadPromise = null;
      reject(new Error('Failed to load Kakao Maps SDK script'));
    };
    document.head.appendChild(script);
  });

  return sdkLoadPromise;
}

/**
 * 대회 장소 지도 임베드. JS 키가 없으면(env var·어드민 설정 둘 다 없음) 아무것도
 * 렌더하지 않는다 — WebPushService와 동일한 graceful-disable 패턴. 호출부
 * (TournamentVenuePrepSection)는 좌표가 있을 때만 이 컴포넌트를 렌더하므로, 키만
 * 없는 경우에도 내비게이션 딥링크 버튼은 별도로 계속 동작한다.
 */
export function TournamentVenueMap({
  venue,
  latitude,
  longitude,
}: {
  venue: string;
  latitude: number;
  longitude: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { data } = useV1PublicKakaoMapsKey();
  const [loadFailed, setLoadFailed] = useState(false);
  const appKey = data?.kakaoMapsJsKey ?? null;

  useEffect(() => {
    if (!appKey || !containerRef.current) return;
    let cancelled = false;

    loadKakaoMapsSdk(appKey)
      .then(() => {
        if (cancelled || !containerRef.current || !window.kakao) return;
        const center = new window.kakao.maps.LatLng(latitude, longitude);
        const map = new window.kakao.maps.Map(containerRef.current, { center, level: 4 });
        const marker = new window.kakao.maps.Marker({ position: center });
        marker.setMap(map);
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [appKey, latitude, longitude]);

  if (!appKey || loadFailed) return null;

  return (
    <div
      ref={containerRef}
      role="img"
      aria-label={`${venue} 위치 지도`}
      style={{
        width: '100%',
        height: 180,
        borderRadius: 12,
        overflow: 'hidden',
        marginTop: 12,
        background: 'var(--surface-alt, #eef1f4)',
      }}
    />
  );
}
