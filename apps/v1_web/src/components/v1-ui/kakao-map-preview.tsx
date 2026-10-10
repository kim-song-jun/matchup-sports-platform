'use client';

import { useEffect, useRef, useState } from 'react';
import { useV1PublicKakaoMapsKey } from '@/hooks/use-v1-api';
import { loadKakaoMapsSdk } from '@/lib/kakao-maps-sdk';
import { placeKakaoMapUrl } from '@/lib/place';

/**
 * 장소 미니 지도(비대화형). 상자 전체가 카카오맵 웹 페이지로 가는 링크라 지도 안에서는
 * 드래그·확대를 모두 끈다. 화면에 들어올 때 SDK 를 로드하고, JS 키가 없거나 로드가 실패하면
 * 아무것도 렌더하지 않는다(호출부 레이아웃에 빈 칸이 남지 않는다).
 * 높이는 폭의 절반(160~240)이라 넓은 화면에서도 납작한 띠가 되지 않는다.
 */
export function KakaoMapPreview({
  name,
  latitude,
  longitude,
  revealOnShow = false,
}: {
  name: string;
  latitude: number;
  longitude: number;
  /** 지도 상자가 처음 나타날 때 한 번 화면 안으로 스크롤한다 — 하단 고정 바에 가리지 않게 장소를 고른 직후에만 켠다. */
  revealOnShow?: boolean;
}) {
  const boxRef = useRef<HTMLAnchorElement>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const { data } = useV1PublicKakaoMapsKey();
  const appKey = data?.kakaoMapsJsKey ?? null;
  const [visible, setVisible] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  // 지도 키 조회는 브라우저 캐시에서 먼저 복원될 수 있다 — 서버 HTML(키 없음)과 첫 렌더를 맞추려고 마운트 뒤에만 그린다.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const shown = mounted && Boolean(appKey) && !loadFailed;

  // 고른 직후 상자가 나타나는 자리가 화면 아래(또는 고정 바 밑)면 지도 아랫부분이 가려진다 — 한 번 안으로 끌어온다.
  useEffect(() => {
    if (shown && revealOnShow) boxRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [shown, revealOnShow]);

  useEffect(() => {
    if (!mounted || !appKey || visible) return;
    const box = boxRef.current;
    if (!box) return;
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setVisible(true);
        observer.disconnect();
      }
    });
    observer.observe(box);
    return () => observer.disconnect();
  }, [mounted, appKey, visible]);

  useEffect(() => {
    if (!appKey || !visible || !mapRef.current) return;
    let cancelled = false;
    let marker: InstanceType<NonNullable<Window['kakao']>['maps']['Marker']> | null = null;
    let resizeObserver: ResizeObserver | null = null;
    const container = mapRef.current;
    loadKakaoMapsSdk(appKey)
      .then(() => {
        if (cancelled || !mapRef.current || !window.kakao) return;
        const { maps } = window.kakao;
        const center = new maps.LatLng(latitude, longitude);
        const map = new maps.Map(mapRef.current, {
          center,
          level: 4,
          draggable: false,
          scrollwheel: false,
          disableDoubleClick: true,
          disableDoubleClickZoom: true,
        });
        marker = new maps.Marker({ position: center });
        marker.setMap(map);
        // SDK 는 컨테이너 크기 변화를 모른다 — 창 폭이 바뀌어 상자가 커지면 늘어난 자리가 회색으로 남고 핀이 가운데서 밀린다.
        if (typeof ResizeObserver !== 'undefined') {
          resizeObserver = new ResizeObserver(() => {
            map.relayout();
            map.setCenter(center);
          });
          resizeObserver.observe(container);
        }
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      });
    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      // 좌표가 바뀌면 같은 컨테이너에 두 번째 지도가 쌓이지 않도록 이전 핀과 DOM 을 비운다.
      marker?.setMap(null);
      container.replaceChildren();
    };
  }, [appKey, visible, latitude, longitude]);

  if (!shown) return null;

  return (
    <a
      ref={boxRef}
      href={placeKakaoMapUrl({ name, latitude, longitude })}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${name} 지도 크게 보기`}
      className="tm-on-tint"
      style={{
        display: 'block',
        position: 'relative',
        width: '100%',
        aspectRatio: '2 / 1',
        minHeight: 160,
        maxHeight: 240,
        // `revealOnShow` 가 하단 고정 바(약 70px)에 가리지 않을 만큼 띄워 스크롤한다.
        scrollMarginBottom: 120,
        borderRadius: 'var(--radius-control)',
        overflow: 'hidden',
        background: 'var(--surface-soft)',
        border: '1px solid var(--border)',
      }}
    >
      <div ref={mapRef} aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />
    </a>
  );
}
