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
 * 콘텐츠 골격만 채운다. 'list' = 검색바+칩+카드, 'detail' = 헤더+본문 블록,
 * 'console' = 연결상태 바+스코어블록+액션버튼 3x2(실시간 소켓 콘솔류),
 * 'auth' = 중앙정렬 아이콘+제목/부제+단일 CTA(온보딩/로그인/약관류),
 * 'form' = 스텝 인디케이터+반복 라벨/인풋 블록(멀티스텝 폼류).
 */
export function PageSkeleton({
  variant = 'list',
}: {
  variant?: 'list' | 'detail' | 'console' | 'auth' | 'form';
}) {
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
        gap: 16,
      }}
    >
      {variant === 'detail' ? (
        <>
          <SkeletonBlock height={172} radius={16} />
          <SkeletonBlock height={22} width="62%" />
          <SkeletonBlock height={14} width="42%" />
          <SkeletonBlock height={120} radius={16} style={{ marginTop: 8 }} />
          <SkeletonBlock height={120} radius={16} />
        </>
      ) : variant === 'console' ? (
        <>
          <SkeletonBlock height={32} radius={16} />
          <SkeletonBlock height={88} radius={16} style={{ marginTop: 8 }} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {Array.from({ length: 6 }).map((_, index) => (
              <SkeletonBlock key={index} height={56} radius={12} />
            ))}
          </div>
        </>
      ) : variant === 'auth' ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, paddingTop: 48 }}>
          <SkeletonBlock height={96} width="96px" radius={999} />
          <SkeletonBlock height={24} width="55%" />
          <SkeletonBlock height={16} width="75%" />
          <SkeletonBlock height={52} radius={14} style={{ marginTop: 24, width: '100%' }} />
        </div>
      ) : variant === 'form' ? (
        <>
          <div style={{ display: 'flex', gap: 6 }}>
            {Array.from({ length: 4 }).map((_, index) => (
              <SkeletonBlock key={index} height={4} radius={2} style={{ flex: 1 }} />
            ))}
          </div>
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
              <SkeletonBlock height={14} width="30%" />
              <SkeletonBlock height={52} radius={12} />
            </div>
          ))}
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
