'use client';

import { useState } from 'react';
import Image from 'next/image';
import { publicAssetPath } from '@/lib/assets';
import { resolveTeamLogoUrl } from '@/lib/team-logo-presets';
import { AvatarFallback } from './avatar-fallback';

export type TeamAvatarSize = 'sm' | 'md' | 'lg' | 'xl';

const SIZE_MAP: Record<TeamAvatarSize, { px: number; radius: number }> = {
  sm: { px: 28, radius: 8 },
  md: { px: 40, radius: 14 },
  lg: { px: 54, radius: 16 },
  xl: { px: 72, radius: 22 },
};

export interface TeamAvatarProps {
  /** Stable team identity; missing identities keep the neutral icon. */
  teamId?: string | null;
  name: string;
  logoUrl?: string | null;
  size?: TeamAvatarSize;
  className?: string;
}

/** 이미지가 로드되기 전과 로드에 실패한 경우에는 중립 팀 아이콘을 표시한다. */
function TeamAvatarContent({ teamId, logoUrl, size = 'md', className }: TeamAvatarProps) {
  const { px, radius } = SIZE_MAP[size];
  const url = resolveTeamLogoUrl({ teamId, logoUrl });
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
  const url = resolveTeamLogoUrl({ teamId: props.teamId, logoUrl: props.logoUrl });
  return <TeamAvatarContent key={url || 'empty'} {...props} />;
}
