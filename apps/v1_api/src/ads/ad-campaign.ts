import type { Prisma, V1AdCampaign } from '@prisma/client';

export const AD_CHANNELS = ['banner', 'popup'] as const;
export type AdChannel = (typeof AD_CHANNELS)[number];

export const AD_EVENT_TYPES = ['impression', 'click'] as const;
export type AdEventType = (typeof AD_EVENT_TYPES)[number];

/** Events for a channel are still counted this long after its window ends (cached responses, tabs left open). */
export const AD_EVENT_GRACE_MS = 10 * 60 * 1000;

export type AdChannelFields = {
  imageUrl: string | null;
  altText: string | null;
  /** Popup only (always null for a banner): the title line of the 4:3 popup card. */
  headline: string | null;
  /** Popup only (always null for a banner): optional supporting line under the headline. */
  description: string | null;
  linkUrl: string | null;
  startAt: Date | null;
  endAt: Date | null;
};

export type AdChannels = Record<AdChannel, AdChannelFields | null>;

/** A channel is configured as soon as any of its fields is set; a draft may be incomplete. */
export function hasAnyChannelField(fields: AdChannelFields): boolean {
  return Object.values(fields).some((value) => value !== null);
}

const EMPTY_CHANNEL: AdChannelFields = { imageUrl: null, altText: null, headline: null, description: null, linkUrl: null, startAt: null, endAt: null };

export function channelColumns(channel: AdChannel, fields: AdChannelFields | null) {
  const f = fields ?? EMPTY_CHANNEL;
  return channel === 'banner'
    ? { bannerImageUrl: f.imageUrl, bannerAltText: f.altText, bannerLinkUrl: f.linkUrl, bannerStartAt: f.startAt, bannerEndAt: f.endAt }
    : {
        popupImageUrl: f.imageUrl, popupAltText: f.altText, popupHeadline: f.headline, popupDescription: f.description,
        popupLinkUrl: f.linkUrl, popupStartAt: f.startAt, popupEndAt: f.endAt,
      };
}

export function allChannelColumns(channels: AdChannels) {
  return { ...channelColumns('banner', channels.banner), ...channelColumns('popup', channels.popup) };
}

type ChannelRow = Pick<
  V1AdCampaign,
  | 'bannerImageUrl' | 'bannerAltText' | 'bannerLinkUrl' | 'bannerStartAt' | 'bannerEndAt'
  | 'popupImageUrl' | 'popupAltText' | 'popupHeadline' | 'popupDescription' | 'popupLinkUrl' | 'popupStartAt' | 'popupEndAt'
>;

export function channelFromRow(row: ChannelRow, channel: AdChannel): AdChannelFields | null {
  const fields: AdChannelFields = channel === 'banner'
    ? { imageUrl: row.bannerImageUrl, altText: row.bannerAltText, headline: null, description: null, linkUrl: row.bannerLinkUrl, startAt: row.bannerStartAt, endAt: row.bannerEndAt }
    : {
        imageUrl: row.popupImageUrl, altText: row.popupAltText, headline: row.popupHeadline, description: row.popupDescription,
        linkUrl: row.popupLinkUrl, startAt: row.popupStartAt, endAt: row.popupEndAt,
      };
  return hasAnyChannelField(fields) ? fields : null;
}

export function channelsFromRow(row: ChannelRow): AdChannels {
  return { banner: channelFromRow(row, 'banner'), popup: channelFromRow(row, 'popup') };
}

export function imageUrlsOf(channels: AdChannels): string[] {
  const urls = AD_CHANNELS.map((channel) => channels[channel]?.imageUrl).filter((url): url is string => Boolean(url));
  return [...new Set(urls)];
}

export type AdPublishProblem =
  | { code: 'AD_CHANNEL_REQUIRED' }
  | { code: 'AD_CHANNEL_INCOMPLETE'; channel: AdChannel; missing: Array<'imageUrl' | 'altText' | 'headline' | 'linkUrl' | 'startAt' | 'endAt'> }
  | { code: 'AD_WINDOW_ENDED'; channel: AdChannel };

const REQUIRED_FIELDS: Record<AdChannel, ReadonlyArray<'imageUrl' | 'altText' | 'headline' | 'linkUrl' | 'startAt' | 'endAt'>> = {
  banner: ['imageUrl', 'altText', 'linkUrl', 'startAt', 'endAt'],
  popup: ['imageUrl', 'altText', 'headline', 'linkUrl', 'startAt', 'endAt'],
};

/**
 * What a campaign must satisfy to be live: one channel at least, and every configured channel carries an
 * image, its alt text, a link and a window (a popup also needs its headline). `requireFutureEnd` is only for the publish transition; editing an already
 * published campaign whose window has passed must not fail on the date.
 */
export function findPublishProblems(channels: AdChannels, now: Date, requireFutureEnd: boolean): AdPublishProblem[] {
  const problems: AdPublishProblem[] = [];
  const configured = AD_CHANNELS.filter((channel) => channels[channel] !== null);
  if (configured.length === 0) return [{ code: 'AD_CHANNEL_REQUIRED' }];
  for (const channel of configured) {
    const fields = channels[channel] as AdChannelFields;
    const missing = REQUIRED_FIELDS[channel].filter((name) => fields[name] === null);
    if (missing.length > 0) {
      problems.push({ code: 'AD_CHANNEL_INCOMPLETE', channel, missing: [...missing] });
    } else if (requireFutureEnd && (fields.endAt as Date).getTime() <= now.getTime()) {
      problems.push({ code: 'AD_WINDOW_ENDED', channel });
    }
  }
  return problems;
}

// One window rule everywhere: a channel is live over the half-open interval [startAt, endAt). The two Prisma
// filters below are that rule for queries; `windowPhase` is the same rule for rows already in memory, and
// `ad-campaign.spec.ts` checks all of them against each other at the boundary instants.

/** Another published campaign whose window on this channel intersects [startAt, endAt). Touching edges do not overlap. */
export function overlapWhere(
  channel: AdChannel,
  window: { startAt: Date; endAt: Date },
  excludeCampaignId: string,
): Prisma.V1AdCampaignWhereInput {
  return channel === 'banner'
    ? { id: { not: excludeCampaignId }, status: 'published', bannerStartAt: { lt: window.endAt }, bannerEndAt: { gt: window.startAt } }
    : { id: { not: excludeCampaignId }, status: 'published', popupStartAt: { lt: window.endAt }, popupEndAt: { gt: window.startAt } };
}

/** A published campaign whose channel is complete and has `startAt <= now < endAt`. */
export function servingWhere(channel: AdChannel, now: Date): Prisma.V1AdCampaignWhereInput {
  return channel === 'banner'
    ? { status: 'published', bannerImageUrl: { not: null }, bannerAltText: { not: null }, bannerLinkUrl: { not: null }, bannerStartAt: { lte: now }, bannerEndAt: { gt: now } }
    : { status: 'published', popupImageUrl: { not: null }, popupAltText: { not: null }, popupHeadline: { not: null }, popupLinkUrl: { not: null }, popupStartAt: { lte: now }, popupEndAt: { gt: now } };
}

export type AdChannelPhase = 'scheduled' | 'live' | 'ended';

/** Where `now` sits against [startAt, endAt). */
export function windowPhase(startAt: Date, endAt: Date, now: Date): AdChannelPhase {
  if (now.getTime() < startAt.getTime()) return 'scheduled';
  return now.getTime() < endAt.getTime() ? 'live' : 'ended';
}

/** Derived, never stored. Only a published campaign has a phase. */
export function channelPhase(
  status: V1AdCampaign['status'],
  fields: AdChannelFields | null,
  now: Date,
): AdChannelPhase | null {
  if (status !== 'published' || !fields?.startAt || !fields.endAt) return null;
  return windowPhase(fields.startAt, fields.endAt, now);
}

/** Whether an event for this channel lands in its window or the grace period after it. The caller has already limited rows to published campaigns. */
export function acceptsEvents(row: ChannelRow, channel: AdChannel, now: Date): boolean {
  const fields = channelFromRow(row, channel);
  if (!fields?.imageUrl || !fields.startAt || !fields.endAt) return false;
  const phase = windowPhase(fields.startAt, fields.endAt, now);
  return phase === 'live' || (phase === 'ended' && now.getTime() < fields.endAt.getTime() + AD_EVENT_GRACE_MS);
}

export type PublicAd = {
  campaignId: string;
  advertiserName: string;
  imageUrl: string;
  altText: string;
  linkUrl: string;
};

export type PublicPopupAd = PublicAd & { headline: string; description: string | null };

type PublicRow = Pick<V1AdCampaign, 'id' | 'advertiserName'> & ChannelRow;

export function toPublicBanner(row: PublicRow): PublicAd | null {
  const fields = channelFromRow(row, 'banner');
  if (!fields?.imageUrl || !fields.altText || !fields.linkUrl) return null;
  return { campaignId: row.id, advertiserName: row.advertiserName, imageUrl: fields.imageUrl, altText: fields.altText, linkUrl: fields.linkUrl };
}

export function toPublicPopup(row: PublicRow): PublicPopupAd | null {
  const fields = channelFromRow(row, 'popup');
  if (!fields?.imageUrl || !fields.altText || !fields.headline || !fields.linkUrl) return null;
  return {
    campaignId: row.id,
    advertiserName: row.advertiserName,
    imageUrl: fields.imageUrl,
    altText: fields.altText,
    headline: fields.headline,
    description: fields.description,
    linkUrl: fields.linkUrl,
  };
}
