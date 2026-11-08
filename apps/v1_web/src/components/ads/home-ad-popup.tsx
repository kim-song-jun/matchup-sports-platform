'use client';

import { useState } from 'react';
import { useV1ActiveAds } from '@/hooks/use-v1-ads';
import { useV1Home } from '@/hooks/use-v1-api';
import { isPopupSuppressed, suppressPopupForToday } from '@/lib/ad-suppression';
import { resolveAdLink, type AdLink } from '@/lib/ad-link';
import { reportClientError } from '@/lib/client-error-reporter';
import type { V1PublicPopupAd } from '@/types/ads';
import { HOME_AD_POPUP_PATH } from './home-ad-popup-notice-gate';
import { HomeAdPopupDialog, popupCreativeSrc } from './home-ad-popup-dialog';

// A native <dialog> (the app update gate) carries no role attribute, so it is matched by its open state.
const OTHER_MODAL_SELECTOR = '[role="dialog"], [role="alertdialog"], [aria-modal="true"], dialog[open]';

type ShownAd = { campaign: V1PublicPopupAd; link: AdLink };

function reportCreativeFailure(campaignId: string, stage: 'preload' | 'window') {
  reportClientError({
    message: 'Ad popup creative failed to load',
    level: 'warn',
    context: { campaignId, channel: 'popup', stage },
  });
}

/**
 * The popup ad on the home screen. It opens at most once per mount, and only when all of these hold:
 * the notice step lets it (`noticeAllowsAd`), the home screen has loaded, the campaign link is safe, today is not
 * already used up for this campaign, the creative has arrived, and no other modal is open at that moment.
 * A window that opens uses up the day for its campaign at once, so a reload does not show it again.
 */
export function HomeAdPopup({ noticeAllowsAd }: { noticeAllowsAd: boolean }) {
  const ads = useV1ActiveAds();
  const home = useV1Home();
  const [shown, setShown] = useState<ShownAd | null>(null);
  // This mount has made its decision (opened, yielded to a modal, or hit a broken creative).
  const [decided, setDecided] = useState(false);

  const campaign = ads.data?.popup ?? null;
  const link = campaign ? resolveAdLink(campaign.linkUrl) : null;
  const candidate: ShownAd | null =
    !decided && noticeAllowsAd && home.isSuccess && campaign && link && !isPopupSuppressed(campaign.campaignId)
      ? { campaign, link }
      : null;

  // The window opens only after its creative is in the browser cache: a missing picture means no window at all,
  // so nothing half-empty is shown and the day is not spent on an ad nobody saw.
  const openAfterCreativeLoaded = (ad: ShownAd) => {
    setDecided(true);
    // Checked again here, not only at render: a second tab may have opened this campaign while the picture loaded.
    if (isPopupSuppressed(ad.campaign.campaignId)) return;
    if (document.querySelector(OTHER_MODAL_SELECTOR)) return;
    suppressPopupForToday(ad.campaign.campaignId);
    setShown(ad);
  };

  return (
    <>
      {candidate ? (
        <img
          key={candidate.campaign.campaignId}
          src={popupCreativeSrc(candidate.campaign.imageUrl)}
          alt=""
          aria-hidden="true"
          hidden
          onLoad={() => openAfterCreativeLoaded(candidate)}
          onError={() => {
            setDecided(true);
            reportCreativeFailure(candidate.campaign.campaignId, 'preload');
          }}
        />
      ) : null}
      {shown ? (
        <HomeAdPopupDialog
          campaign={shown.campaign}
          link={shown.link}
          currentPath={HOME_AD_POPUP_PATH}
          onClose={() => setShown(null)}
          onImageError={() => {
            reportCreativeFailure(shown.campaign.campaignId, 'window');
            setShown(null);
          }}
        />
      ) : null}
    </>
  );
}
