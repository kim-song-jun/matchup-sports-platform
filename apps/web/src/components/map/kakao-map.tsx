'use client';

import { useEffect, useRef, useState } from 'react';
import Script from 'next/script';
import { MapPin } from 'lucide-react';
import { clsx } from 'clsx';

interface KakaoMapProps {
  latitude: number;
  longitude: number;
  name?: string;
  className?: string;
  height?: string;
}

export function KakaoMap({ latitude, longitude, name, className, height = 'h-64' }: KakaoMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [sdkReady, setSdkReady] = useState(false);
  const [mapError, setMapError] = useState(false);
  const mapKey = process.env.NEXT_PUBLIC_KAKAO_MAP_KEY;

  useEffect(() => {
    if (!sdkReady || !containerRef.current || !mapKey) return;

    const container = containerRef.current;

    function initMap() {
      if (!window.kakao?.maps || !container) return;

      try {
        const kakaoMaps = window.kakao.maps;
        const center = new kakaoMaps.LatLng(latitude, longitude);
        const map = new kakaoMaps.Map(container, { center, level: 4 });
        const marker = new kakaoMaps.Marker({ position: center, map });

        if (name) {
          const escapedName = name.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
          const infoWindow = new kakaoMaps.InfoWindow({
            content: `<div style="padding:6px 10px;font-size:13px;font-weight:600;white-space:nowrap;">${escapedName}</div>`,
          });
          infoWindow.open(map, marker);

          // Open kakao map app/web on marker click
          kakaoMaps.event.addListener(marker, 'click', () => {
            const kakaoMapUrl = `https://map.kakao.com/link/map/${encodeURIComponent(name)},${latitude},${longitude}`;
            window.open(kakaoMapUrl, '_blank', 'noopener,noreferrer');
          });
        }
      } catch {
        setMapError(true);
      }
    }

    window.kakao?.maps.load(initMap);
  }, [sdkReady, latitude, longitude, name, mapKey]);

  if (!mapKey) {
    return (
      <div
        className={clsx(
          'flex flex-col items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800',
          height,
          className,
        )}
      >
        <MapPin size={24} className="text-gray-400" aria-hidden="true" />
        <p className="text-sm text-gray-500 dark:text-gray-400">지도를 표시하려면 카카오맵 키가 필요합니다</p>
      </div>
    );
  }

  if (mapError) {
    return (
      <div
        className={clsx(
          'flex flex-col items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800',
          height,
          className,
        )}
      >
        <MapPin size={24} className="text-gray-400" aria-hidden="true" />
        <p className="text-sm text-gray-500 dark:text-gray-400">지도를 불러오지 못했어요</p>
      </div>
    );
  }

  return (
    <>
      <Script
        src={`//dapi.kakao.com/v2/maps/sdk.js?appkey=${mapKey}&autoload=false`}
        strategy="lazyOnload"
        onLoad={() => setSdkReady(true)}
        onError={() => setMapError(true)}
      />
      <div
        ref={containerRef}
        className={clsx(
          'w-full overflow-hidden rounded-2xl border border-gray-200 dark:border-gray-700',
          height,
          className,
        )}
        role="img"
        aria-label={name ? `${name} 위치 지도` : '위치 지도'}
      />
    </>
  );
}
