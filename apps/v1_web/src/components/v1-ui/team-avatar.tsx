'use client';

import { useState } from 'react';
import Image from 'next/image';
import { publicAssetPath } from '@/lib/assets';
import { AvatarFallback } from './avatar-fallback';

export type TeamAvatarSize = 'sm' | 'md' | 'lg' | 'xl';

const SIZE_MAP: Record<TeamAvatarSize, { px: number; radius: number }> = {
  sm: { px: 28, radius: 8 },
  md: { px: 40, radius: 14 },
  lg: { px: 54, radius: 16 },
  xl: { px: 72, radius: 22 },
};

export interface TeamAvatarProps {
  /** 기존 호출 계약 유지용. 기본 아이콘은 팀 이름/ID와 무관하다. */
  seed: string;
  name: string;
  logoUrl?: string | null;
  size?: TeamAvatarSize;
  className?: string;
}

/** 팀 로고의 로딩/실패/미등록 상태는 공용 팀 아이콘으로 표시한다. */
function TeamAvatarContent({ logoUrl, size = 'md', className }: TeamAvatarProps) {
  const { px, radius } = SIZE_MAP[size];
  const url = logoUrl?.trim() || null;
  // URL 단위로 도착/실패를 기억해야 로고 교체·삭제 때 이전 이미지 상태가 남지 않는다.
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const loaded = url !== null && loadedUrl === url && failedUrl !== url;
  return (
    <div
      className={className}
      aria-hidden="true"
      style={{ position: 'relative', width: px, height: px, borderRadius: radius,
        background: loaded ? 'var(--card-surface)' : 'var(--grey150)', color: 'var(--text-muted)',
        flexShrink: 0, overflow: 'hidden', display: 'grid', placeItems: 'center' }}
    >
      {!loaded ? <AvatarFallback kind="team" size={Math.round(px / 2)} /> : null}
      {url && failedUrl !== url ? (
        <Image
          key={url}
          src={publicAssetPath(url)}
          alt=""
          width={px}
          height={px}
          loading="lazy"
          onLoad={() => setLoadedUrl(url)}
          onError={() => setFailedUrl(url)}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: loaded ? 1 : 0 }}
        />
      ) : null}
    </div>
  );
}

export function TeamAvatar(props: TeamAvatarProps) {
  return <TeamAvatarContent key={props.logoUrl?.trim() || 'empty'} {...props} />;
}
