import type { CSSProperties } from 'react';
import { publicAssetPath } from '@/lib/assets';

/**
 * Teameet 로고 마크 — 실제 브랜드 자산(두 사람이 함께 뛰는 모양, favicon·PWA 아이콘과
 * 동일한 원본 `/brand/icon-512.png`)을 그대로 렌더링한다. 예전엔 이 실제 마크와 다른
 * 임의의 손그림 SVG 경로(T자+아령 모양)를 썼는데, 실제 브랜드 자산과 전혀 달라 보였다
 * (사용자 피드백: "우리 teameet 아이콘이 아닌데"). `/brand/icon-512.png` 자체에 파란
 * 둥근모서리 타일 배경이 이미 구워져 있으므로 별도 CSS 배경·border-radius가 필요 없다
 * — favicon(`/favicon.png`)도 동일 원본에서 생성돼 탭 아이콘까지 일관된 모양을 보장한다.
 */
export function BrandMark({
  size = 24,
  alt = '',
  style,
}: {
  size?: number;
  alt?: string;
  style?: CSSProperties;
}) {
  return (
    <img
      src={publicAssetPath('/brand/icon-512.png')}
      alt={alt}
      aria-hidden={alt === '' ? true : undefined}
      width={size}
      height={size}
      style={{ display: 'block', flexShrink: 0, ...style }}
    />
  );
}
