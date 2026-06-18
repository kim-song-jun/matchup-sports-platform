import type { CSSProperties } from 'react';

function SkeletonBlock({ height, width, radius, style }: { height: number; width?: string; radius?: number; style?: CSSProperties }) {
  return (
    <div
      className="tm-skeleton"
      style={{ width: width ?? '100%', height, borderRadius: radius ?? 12, ...style }}
    />
  );
}

/**
 * 라우트 전환 중 보여줄 스켈레톤. AppChrome 안(.tm-scroll-area)에서 렌더되어
 * 콘텐츠 골격만 채운다. 'list' = 검색바+칩+카드, 'detail' = 헤더+본문 블록.
 */
export function PageSkeleton({ variant = 'list' }: { variant?: 'list' | 'detail' }) {
  return (
    <div
      className="tm-skeleton-page"
      aria-hidden="true"
      style={{
        width: 'min(100%, var(--v1-app-chrome-frame-width, 480px))',
        margin: '0 auto',
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
      }}
    >
      {variant === 'detail' ? (
        <>
          <SkeletonBlock height={172} radius={16} />
          <SkeletonBlock height={22} width="62%" />
          <SkeletonBlock height={14} width="42%" />
          <SkeletonBlock height={120} radius={16} style={{ marginTop: 6 }} />
          <SkeletonBlock height={120} radius={16} />
        </>
      ) : (
        <>
          <SkeletonBlock height={44} radius={12} />
          <div style={{ display: 'flex', gap: 8 }}>
            {Array.from({ length: 4 }).map((_, index) => (
              <SkeletonBlock key={index} height={32} width="72px" radius={16} />
            ))}
          </div>
          {Array.from({ length: 5 }).map((_, index) => (
            <SkeletonBlock key={index} height={96} radius={16} />
          ))}
        </>
      )}
    </div>
  );
}
