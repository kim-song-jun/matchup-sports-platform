'use client';

import { useEffect, useState } from 'react';

const SPORT_IMAGE_FALLBACKS = {
  badminton: '/mock/generated/badminton-club.webp',
  basketball: '/mock/generated/basketball-hardwood.webp',
  futsal: '/mock/generated/futsal-rooftop.webp',
  hockey: '/mock/generated/ice-hockey-arena.webp',
} as const;

const DEFAULT_IMAGE_FALLBACK = '/mock/generated/team-huddle.webp';

type TournamentCampaignMediaProps = {
  readonly src?: string | null;
  readonly sportCode: string;
  readonly alt: string;
  readonly className?: string;
  readonly eager?: boolean;
};

export function TournamentCampaignMedia({
  src,
  sportCode,
  alt,
  className,
  eager = false,
}: TournamentCampaignMediaProps) {
  const fallbackSrc = getSportImageFallback(sportCode);
  const requestedSrc = src?.trim() || fallbackSrc;
  const [currentSrc, setCurrentSrc] = useState(requestedSrc);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    setCurrentSrc(requestedSrc);
    setHidden(false);
  }, [requestedSrc]);

  if (hidden) return null;

  return (
    <img
      src={currentSrc}
      alt={alt}
      width={1600}
      height={900}
      className={className}
      loading={eager ? 'eager' : 'lazy'}
      fetchPriority={eager ? 'high' : 'auto'}
      onError={() => {
        if (currentSrc === fallbackSrc) {
          setHidden(true);
          return;
        }
        setCurrentSrc(fallbackSrc);
      }}
    />
  );
}

function getSportImageFallback(sportCode: string): string {
  switch (sportCode) {
    case 'badminton':
      return SPORT_IMAGE_FALLBACKS.badminton;
    case 'basketball':
      return SPORT_IMAGE_FALLBACKS.basketball;
    case 'futsal':
      return SPORT_IMAGE_FALLBACKS.futsal;
    case 'hockey':
    case 'ice_hockey':
      return SPORT_IMAGE_FALLBACKS.hockey;
    default:
      return DEFAULT_IMAGE_FALLBACK;
  }
}
