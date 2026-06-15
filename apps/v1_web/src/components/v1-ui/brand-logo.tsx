import type { CSSProperties } from 'react';

/**
 * Teameet 로고 마크.
 * - variant 'mark' (기본): 투명 배경 파란 마크 — 밝은 배경(nav·footer·랜딩)용
 * - variant 'tile': 흰 앱아이콘 타일 — 어두운/컬러 배경(인증 패널)용
 * 워드마크 텍스트는 호출부가 기존 클래스로 함께 렌더(로고 락업).
 */
export function BrandMark({
  size = 24,
  variant = 'mark',
  rounded,
  alt = '',
  style,
}: {
  size?: number;
  variant?: 'mark' | 'tile';
  rounded?: number;
  alt?: string;
  style?: CSSProperties;
}) {
  const src = variant === 'tile' ? '/brand/teameet-logo.png' : '/brand/teameet-mark.png';
  return (
    <img
      src={src}
      alt={alt}
      aria-hidden={alt === '' ? true : undefined}
      width={size}
      height={size}
      style={{
        width: size,
        height: size,
        display: 'block',
        flexShrink: 0,
        objectFit: 'contain',
        ...(rounded != null ? { borderRadius: rounded } : {}),
        ...style,
      }}
    />
  );
}
