'use client';

import Image from 'next/image';
import { useCallback, useEffect, useState } from 'react';

/**
 * Ensure upload paths returned by the backend (e.g. "uploads/2025/04/file.webp")
 * are root-relative so next/image can resolve them.
 * Absolute URLs and already-rooted paths pass through unchanged.
 */
function normalizeSrc(src?: string | null): string | null {
  if (!src) return null;
  // Reject path traversal attempts regardless of how they arrive
  if (src.includes('..')) return null;
  if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('/') || src.startsWith('data:')) return src;
  return `/${src}`;
}

type SafeImageProps = {
  src?: string | null;
  fallbackSrc?: string | null;
  alt?: string;
  className?: string;
  priority?: boolean;
  fill?: boolean;
  width?: number;
  height?: number;
  sizes?: string;
  onError?: () => void;
  style?: React.CSSProperties;
  onClick?: React.MouseEventHandler;
  /** @deprecated pass priority={false} instead; kept for backward-compat with legacy callers */
  loading?: 'lazy' | 'eager';
};

export function SafeImage({
  src,
  fallbackSrc,
  alt = '',
  className,
  priority,
  fill,
  width,
  height,
  sizes,
  onError,
  style,
  onClick,
  loading,
}: SafeImageProps) {
  const initialSrc = normalizeSrc(src) || normalizeSrc(fallbackSrc) || null;
  const [activeSrc, setActiveSrc] = useState(initialSrc);
  const [usedFallback, setUsedFallback] = useState(false);

  useEffect(() => {
    setActiveSrc(normalizeSrc(src) || normalizeSrc(fallbackSrc) || null);
    setUsedFallback(false);
  }, [src, fallbackSrc]);

  // No valid src — render a placeholder div to avoid next/image empty-src error
  if (!activeSrc) {
    return <div className={className} style={style} aria-hidden="true" />;
  }

  const handleError = useCallback(() => {
    const normalizedFallback = normalizeSrc(fallbackSrc);
    if (!usedFallback && normalizedFallback && normalizedFallback !== activeSrc) {
      setUsedFallback(true);
      setActiveSrc(normalizedFallback);
    }
    onError?.();
  }, [fallbackSrc, usedFallback, activeSrc, onError]);

  // Determine sizing mode:
  // 1. fill=true  → fill mode (width/height ignored)
  // 2. width+height provided → fixed size
  // 3. fallback → fill mode so the component is always valid
  const useFill = fill || (!width && !height);

  // Resolve priority: explicit prop wins, then fall back to loading="eager"
  const resolvedPriority = priority ?? (loading === 'eager' ? true : false);

  if (useFill) {
    return (
      <Image
        src={activeSrc}
        alt={alt}
        fill
        className={className}
        sizes={sizes ?? '100vw'}
        priority={resolvedPriority}
        onError={handleError}
        style={style}
        onClick={onClick}
      />
    );
  }

  return (
    <Image
      src={activeSrc}
      alt={alt}
      width={width!}
      height={height!}
      className={className}
      sizes={sizes}
      priority={resolvedPriority}
      onError={handleError}
      style={style}
      onClick={onClick}
    />
  );
}
