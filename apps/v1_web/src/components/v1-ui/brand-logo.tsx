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
  const tile = variant === 'tile';
  return (
    <span
      role={alt === '' ? undefined : 'img'}
      aria-label={alt === '' ? undefined : alt}
      aria-hidden={alt === '' ? true : undefined}
      style={{
        width: size,
        height: size,
        display: 'inline-grid',
        placeItems: 'center',
        flexShrink: 0,
        background: tile ? 'var(--static-white)' : 'transparent',
        boxShadow: tile ? 'var(--shadow-1)' : undefined,
        ...(rounded != null ? { borderRadius: rounded } : {}),
        ...style,
      }}
    >
      <svg
        viewBox="0 0 48 48"
        width={size}
        height={size}
        aria-hidden="true"
        focusable="false"
        style={{ display: 'block' }}
      >
        <rect
          x="4"
          y="4"
          width="40"
          height="40"
          rx={tile ? 12 : 10}
          fill="var(--blue500)"
        />
        <path
          d="M16 17.5c0-1.93 1.57-3.5 3.5-3.5h9c1.93 0 3.5 1.57 3.5 3.5V20h2.5c.83 0 1.5.67 1.5 1.5v1.2c0 3.04-2.46 5.5-5.5 5.5h-.7A7.02 7.02 0 0 1 25.5 32v3H30c.83 0 1.5.67 1.5 1.5S30.83 38 30 38H18c-.83 0-1.5-.67-1.5-1.5S17.17 35 18 35h4.5v-3a7.02 7.02 0 0 1-4.3-3.8h-.7c-3.04 0-5.5-2.46-5.5-5.5v-1.2c0-.83.67-1.5 1.5-1.5H16v-2.5Zm3 0v7.5a5 5 0 0 0 10 0v-7.5c0-.28-.22-.5-.5-.5h-9c-.28 0-.5.22-.5.5ZM15 23v.05c0 1.03.68 1.9 1.62 2.18A8.43 8.43 0 0 1 16 23h-1Zm17 0c0 .77-.1 1.52-.3 2.23.94-.28 1.62-1.15 1.62-2.18V23H32Z"
          fill="var(--static-white)"
        />
      </svg>
    </span>
  );
}
