'use client';

import type { ReactNode } from 'react';
import { BRACKET_CANVAS_WIDE_MEDIA_QUERY, useMediaQuery } from '@/hooks/use-media-query';

/**
 * 폭에 따라 뷰를 **하나만** 마운트한다. CSS 로 숨기지 않는 이유: 캔버스는 끌어 놓기와 칸 aria-label 을
 * 갖고 있어 숨겨진 채로 남으면 모바일에서도 같은 칸이 두 벌이 된다.
 * 서버 렌더 기본값은 모바일이다 — 이 화면은 데이터가 스켈레톤 뒤에서 오므로 첫 페인트에 번쩍이지 않는다.
 */
export function BracketCanvasResponsive({ wide, narrow }: { wide: ReactNode; narrow: ReactNode }) {
  const isWide = useMediaQuery(BRACKET_CANVAS_WIDE_MEDIA_QUERY);
  return <>{isWide ? wide : narrow}</>;
}
