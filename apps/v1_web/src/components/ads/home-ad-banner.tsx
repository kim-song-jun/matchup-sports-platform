'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { useAdImpression } from '@/hooks/use-ad-impression';
import { useV1ActiveAds } from '@/hooks/use-v1-ads';
import { resolveAdLink } from '@/lib/ad-link';
import { trackAdClick } from '@/lib/ad-events';
import { optimizedImageSrc } from '@/lib/assets';
import { reportClientError } from '@/lib/client-error-reporter';
import type { V1PublicAd } from '@/types/ads';

/** The banner is widest in the desktop main column (636px); the optimizer picks the 2x size for this width. */
const BANNER_MEDIA_PX = 640;

/**
 * Home banner ad. Renders nothing while loading, when no banner is live, when the request fails, when the
 * stored link is not safe and when the image fails — a collapsed slot, never a placeholder or a substitute ad.
 */
export function HomeAdBanner() {
  const { data } = useV1ActiveAds();
  const ad = data?.banner;
  if (!ad) return null;
  // A new creative starts from a clean loaded/failed state; the same creative keeps it across refetches.
  return <HomeAdBannerCreative key={`${ad.campaignId}:${ad.imageUrl}`} ad={ad} />;
}

function HomeAdBannerCreative({ ad }: { ad: V1PublicAd }) {
  const linkRef = useRef<HTMLAnchorElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const link = resolveAdLink(ad.linkUrl);

  // Only a painted image can be seen, so the impression clock starts at `load`, not at render.
  useAdImpression(linkRef, { campaignId: ad.campaignId, channel: 'banner', enabled: loaded });

  useEffect(() => {
    if (link) return;
    reportClientError({
      message: 'Ad banner skipped: stored link is not safe',
      level: 'warn',
      context: { campaignId: ad.campaignId, channel: 'banner' },
    });
  }, [link, ad.campaignId]);

  if (!link || failed) return null;

  const handleImageError = () => {
    setFailed(true);
    reportClientError({
      message: 'Ad banner image failed to load',
      context: { campaignId: ad.campaignId, channel: 'banner', imageUrl: ad.imageUrl },
    });
  };
  const countClick = () => trackAdClick(ad.campaignId, 'banner');
  // A middle-click opens the link in a new tab and fires `auxclick` instead of `click`.
  const countMiddleClick = (event: MouseEvent) => {
    if (event.button === 1) countClick();
  };

  const content = (
    <>
      <span className="tm-home-ad-banner-badge">광고</span>
      {/* eslint-disable-next-line @next/next/no-img-element -- the fixed-ratio frame owns the size; src goes through optimizedImageSrc. */}
      <img
        className="tm-home-ad-banner-image"
        src={optimizedImageSrc(ad.imageUrl, BANNER_MEDIA_PX)}
        alt={ad.altText}
        loading="eager"
        decoding="async"
        onLoad={() => setLoaded(true)}
        onError={handleImageError}
      />
    </>
  );
  const shared = {
    ref: linkRef,
    className: 'tm-home-ad-banner',
    onClick: countClick,
    onAuxClick: countMiddleClick,
  };

  return link.kind === 'internal' ? (
    <Link href={link.href} {...shared}>
      {content}
    </Link>
  ) : (
    <a href={link.href} target="_blank" rel="noopener noreferrer" {...shared}>
      {content}
    </a>
  );
}
