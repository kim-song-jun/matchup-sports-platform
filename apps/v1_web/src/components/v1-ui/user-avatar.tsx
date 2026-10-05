'use client';

import { useState } from 'react';
import { publicAssetPath } from '@/lib/assets';
import { AvatarFallback } from './avatar-fallback';

function UserAvatarContent({ imageUrl, size = 40, className, radius = 'var(--radius-circle)' }: {
  imageUrl?: string | null;
  size?: number;
  className?: string;
  radius?: string;
}) {
  const url = imageUrl?.trim() || null;
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const loaded = url !== null && loadedUrl === url && failedUrl !== url;
  return (
    <div className={className} aria-hidden="true" style={{ position: 'relative', width: size, height: size,
      borderRadius: radius, background: loaded ? 'var(--card-surface)' : 'var(--grey150)',
      color: 'var(--text-muted)', overflow: 'hidden', flexShrink: 0, display: 'grid', placeItems: 'center' }}>
      {!loaded ? <AvatarFallback kind="user" size={Math.round(size / 2)} /> : null}
      {url && failedUrl !== url ? (
        // eslint-disable-next-line @next/next/no-img-element -- 업로드 원본/외부 URL을 유지하며 실패는 공용 사람 아이콘으로 처리한다.
        <img key={url} src={publicAssetPath(url)} alt="" onLoad={() => setLoadedUrl(url)} onError={() => setFailedUrl(url)}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: loaded ? 1 : 0 }} />
      ) : null}
    </div>
  );
}

export function UserAvatar(props: Parameters<typeof UserAvatarContent>[0]) {
  return <UserAvatarContent key={props.imageUrl?.trim() || 'empty'} {...props} />;
}
