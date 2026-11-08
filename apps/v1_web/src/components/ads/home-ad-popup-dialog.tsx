'use client';

import { useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { HOME_POPUP_SCRIM_BACKGROUND } from '@/components/home/home-notice-popup';
import { useModalA11y } from '@/components/v1-ui/use-modal-a11y';
import { useAdImpression } from '@/hooks/use-ad-impression';
import { trackAdClick } from '@/lib/ad-events';
import type { AdLink } from '@/lib/ad-link';
import { overlayLinkClick } from '@/lib/overlay-history';
import type { V1PublicPopupAd } from '@/types/ads';

const DETAIL_BUTTON_CLASS = 'tm-btn tm-btn-md tm-btn-primary tm-btn-block';

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

  return createPortal(
    <div
      className="tm-modal-scrim fixed inset-0 flex items-center justify-center p-4"
      style={{ background: HOME_POPUP_SCRIM_BACKGROUND, zIndex: 'var(--z-modal)' }}
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
            src={campaign.imageUrl}
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
                trackAdClick(campaign.campaignId, 'popup');
                onClose();
              }}
            >
              자세히 보기
            </a>
          ) : (
            <Link
              className={DETAIL_BUTTON_CLASS}
              href={link.href}
              onClick={(event) => {
                trackAdClick(campaign.campaignId, 'popup');
                followInternalLink(event);
              }}
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
