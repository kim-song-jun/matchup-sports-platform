'use client';

import { useId, useRef, useState, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useModalA11y } from '@/components/v1-ui/use-modal-a11y';
import { useAdImpression } from '@/hooks/use-ad-impression';
import { trackAdClick } from '@/lib/ad-events';
import type { AdLink } from '@/lib/ad-link';
import { optimizedImageSrc } from '@/lib/assets';
import { overlayLinkClick } from '@/lib/overlay-history';
import type { V1PublicPopupAd } from '@/types/ads';

const DETAIL_BUTTON_CLASS = 'tm-btn tm-btn-md tm-btn-primary tm-btn-block';

/** The window is at most 420px wide (`max-w-[420px]`); the optimizer picks the 2x size for this width. */
const POPUP_MEDIA_PX = 420;

/**
 * The address the creative is fetched and shown from. The preloader and the window must use the same one,
 * or the browser cache does not carry the picture over and the window opens with an image still loading.
 */
export function popupCreativeSrc(imageUrl: string): string {
  return optimizedImageSrc(imageUrl, POPUP_MEDIA_PX);
}

export interface HomeAdPopupDialogProps {
  campaign: V1PublicPopupAd;
  /** The campaign link already classified by `resolveAdLink`; an unsafe link never reaches this component. */
  link: AdLink;
  /** Path of the page the window sits on, so an internal link to that same page only closes it. */
  currentPath: string;
  /** Close, "오늘 하루 안 보기", Escape, outside press and the back gesture all end here. */
  onClose: () => void;
  /** The creative failed after the window opened. The owner decides what to record and whether to close. */
  onImageError: () => void;
}

/**
 * The ad popup window (4:3 creative, advertiser, headline, optional description). The creative is a picture,
 * not a control: the only ad click is the detail button, and nothing else on the window is counted.
 * The caller mounts it only while it is open and unmounts it to close, which releases focus, scroll lock and history.
 */
export function HomeAdPopupDialog({ campaign, link, currentPath, onClose, onImageError }: HomeAdPopupDialogProps) {
  const headlineId = useId();
  const descriptionId = useId();
  const creativeRef = useRef<HTMLDivElement>(null);
  const [creativeLoaded, setCreativeLoaded] = useState(false);
  // It opens without a user action, so focus goes to the panel itself: a script focusing the first control makes
  // WebKit draw a keyboard focus ring there.
  const { dialogRef, onBackdropClick } = useModalA11y<HTMLElement, HTMLDivElement>({
    open: true,
    onClose,
    initialFocus: 'dialog',
  });
  useAdImpression(creativeRef, { campaignId: campaign.campaignId, channel: 'popup', enabled: creativeLoaded });

  const description = campaign.description?.trim() || null;
  const followInternalLink = overlayLinkClick(link.href, currentPath, onClose);
  const countClick = () => trackAdClick(campaign.campaignId, 'popup');
  // A middle-click opens the link in a new tab and fires `auxclick` instead of `click`; the window stays open.
  const countMiddleClick = (event: MouseEvent) => {
    if (event.button === 1) countClick();
  };

  return createPortal(
    <div
      className="tm-modal-scrim fixed inset-0 flex items-center justify-center bg-[var(--scrim-dark-48)] p-4"
      style={{ zIndex: 'var(--z-modal)' }}
      onClick={onBackdropClick}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headlineId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className="w-full max-w-[420px] rounded-2xl"
        style={{
          background: 'var(--surface)',
          boxShadow: 'var(--shadow-modal)',
          maxHeight: 'calc(100dvh - 32px)',
          overflowX: 'hidden',
          overflowY: 'auto',
          overscrollBehavior: 'contain',
        }}
      >
        <div ref={creativeRef} style={{ position: 'relative', aspectRatio: '4 / 3' }}>
          <img
            src={popupCreativeSrc(campaign.imageUrl)}
            alt={campaign.altText}
            onLoad={() => setCreativeLoaded(true)}
            onError={onImageError}
            style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' }}
          />
          {/* A fixed dark chip keeps 4.5:1 over any creative and in both themes. */}
          <span
            className="tm-badge"
            style={{
              position: 'absolute',
              top: 'var(--spacing-2)',
              right: 'var(--spacing-2)',
              borderRadius: 'var(--radius-chip)',
              background: 'var(--scrim-dark-94)',
              color: 'var(--static-white)',
            }}
          >
            광고
          </span>
        </div>

        <div style={{ padding: 'var(--spacing-4) var(--spacing-5) 0' }}>
          <p className="tm-text-micro" style={{ margin: 0, color: 'var(--text-muted)' }}>
            {campaign.advertiserName}
          </p>
          <h2
            id={headlineId}
            className="tm-text-subhead"
            style={{ margin: '2px 0 0', wordBreak: 'keep-all', overflowWrap: 'anywhere' }}
          >
            {campaign.headline}
          </h2>
          {description ? (
            <p
              id={descriptionId}
              className="tm-text-label"
              style={{ margin: 'var(--spacing-1) 0 0', color: 'var(--text-muted)', overflowWrap: 'anywhere' }}
            >
              {description}
            </p>
          ) : null}
        </div>

        <div style={{ padding: 'var(--spacing-4) var(--spacing-5)' }}>
          {link.kind === 'external' ? (
            <a
              className={DETAIL_BUTTON_CLASS}
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => {
                countClick();
                onClose();
              }}
              onAuxClick={countMiddleClick}
            >
              자세히 보기
            </a>
          ) : (
            <Link
              className={DETAIL_BUTTON_CLASS}
              href={link.href}
              onClick={(event) => {
                countClick();
                followInternalLink(event);
              }}
              onAuxClick={countMiddleClick}
            >
              자세히 보기
            </Link>
          )}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
              gap: 'var(--spacing-2)',
              marginTop: 'var(--spacing-2)',
            }}
          >
            <button type="button" className="tm-btn tm-btn-md tm-btn-ghost" onClick={onClose}>
              오늘 하루 안 보기
            </button>
            <button type="button" className="tm-btn tm-btn-md tm-btn-ghost" onClick={onClose}>
              닫기
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
