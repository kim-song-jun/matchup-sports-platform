'use client';

import { useEffect, useState, type ImgHTMLAttributes, type SyntheticEvent } from 'react';

type SafeImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
  src?: string | null;
  fallbackSrc?: string | null;
};

export function SafeImage({
  src,
  fallbackSrc,
  alt,
  onError,
  ...props
}: SafeImageProps) {
  const resolvedSrc = src || fallbackSrc || '';
  const [activeSrc, setActiveSrc] = useState(resolvedSrc);

  useEffect(() => {
    setActiveSrc(resolvedSrc);
  }, [resolvedSrc]);

  function handleError(event: SyntheticEvent<HTMLImageElement, Event>) {
    if (fallbackSrc && activeSrc !== fallbackSrc) {
      setActiveSrc(fallbackSrc);
    }

    onError?.(event);
  }

  return <img {...props} src={activeSrc} alt={alt ?? ''} onError={handleError} />;
}
