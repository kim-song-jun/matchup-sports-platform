'use client';

import { useSyncExternalStore } from 'react';

/**
 * CSS 미디어쿼리 하나의 현재 일치 여부.
 *
 * `useState` + `useEffect` 로 쓰면 첫 렌더가 항상 false 라 데스크톱에서도 모바일 화면이
 * 한 프레임 지나간다. `useSyncExternalStore` 는 서버 스냅샷을 따로 받으므로 하이드레이션
 * 불일치 없이 클라이언트 첫 렌더부터 실제 값을 쓴다.
 *
 * @param query   예: `(min-width: 768px)`
 * @param serverFallback 서버 렌더에서 가정할 값. 이 앱은 모바일이 본무대라 기본 false다.
 */
export function useMediaQuery(query: string, serverFallback = false): boolean {
  return useSyncExternalStore(
    (onChange) => {
      // matchMedia 가 없는 환경(구형 jsdom 등)에서는 구독할 것이 없다 — 항상 fallback.
      if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
        return () => {};
      }
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    () => {
      if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
        return serverFallback;
      }
      return window.matchMedia(query).matches;
    },
    () => serverFallback,
  );
}

/**
 * 목록형 화면이 데스크톱 배치로 넘어가는 지점. `app/desktop/tournaments.css` 의
 * `.tm-tournament-list-grid` 가 여러 열로 펴지는 폭과 **같은 값**이어야 한다 —
 * 어긋나면 "카드는 이미 2열인데 하단은 아직 모바일용 무한 스크롤"처럼 화면이 갈린다.
 */
export const DESKTOP_LIST_MEDIA_QUERY = '(min-width: 1024px)';

/**
 * 어드민 대진 그림이 편집 가능한 캔버스(데스크톱)로 바뀌는 폭. 스펙 D8 — 구조 편집은 768px 이상.
 * Tailwind `md` 와 같은 값이다.
 */
export const BRACKET_CANVAS_WIDE_MEDIA_QUERY = '(min-width: 768px)';

/**
 * 대진 그림에서 칸 패널이 캔버스 옆 열로 붙는 최소 폭. 이보다 좁은 태블릿(768~1023)은 패널을
 * 시트로 띄우고 참가팀 트레이를 접는다 — 옆 열이 없으면 패널이 그림 아래로 밀려 보이지 않는다.
 */
export const BRACKET_CANVAS_SIDE_PANEL_MEDIA_QUERY = '(min-width: 1024px)';
