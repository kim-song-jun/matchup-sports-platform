import type { PageInfo } from './api';

export type V1AdChannel = 'banner' | 'popup';
export type V1AdEventType = 'impression' | 'click';

export type V1AdEvent = {
  campaignId: string;
  channel: V1AdChannel;
  type: V1AdEventType;
};

/** Public creative (`GET /ads/active`). Memo, version and window fields never leave the admin API. */
export type V1PublicAd = {
  campaignId: string;
  advertiserName: string;
  imageUrl: string;
  altText: string;
  linkUrl: string;
};

export type V1PublicPopupAd = V1PublicAd & {
  headline: string;
  description: string | null;
};

export type V1ActiveAds = {
  banner: V1PublicAd | null;
  popup: V1PublicPopupAd | null;
};

export type V1AdCampaignStatus = 'draft' | 'published' | 'stopped';

/** Derived by the server, `null` unless the campaign is published. */
export type V1AdChannelPhase = 'scheduled' | 'live' | 'ended';

/** Instants arrive as UTC ISO strings. A configured channel may still be incomplete while the campaign is a draft. */
export type V1AdChannelCreative = {
  imageUrl: string | null;
  altText: string | null;
  linkUrl: string | null;
  startAt: string | null;
  endAt: string | null;
  phase: V1AdChannelPhase | null;
};

export type V1AdPopupCreative = V1AdChannelCreative & {
  headline: string | null;
  description: string | null;
};

export type V1AdCampaign = {
  id: string;
  advertiserName: string;
  /** Internal memo title; the public API never returns it. */
  title: string;
  status: V1AdCampaignStatus;
  version: number;
  banner: V1AdChannelCreative | null;
  popup: V1AdPopupCreative | null;
  publishedAt: string | null;
  stoppedAt: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: { adminUserId: string; name: string | null };
};

export type V1AdChannelTotals = {
  impressions: number;
  clicks: number;
};

export type V1AdCampaignTotals = Record<V1AdChannel, V1AdChannelTotals>;

export type V1AdCampaignListItem = V1AdCampaign & { stats: V1AdCampaignTotals };

export type V1AdCampaignSummary = {
  total: number;
  byStatus: Record<V1AdCampaignStatus, number>;
};

export type V1AdCampaignList = {
  items: V1AdCampaignListItem[];
  pageInfo: PageInfo;
  summary: V1AdCampaignSummary;
};

export type V1AdDailyStat = {
  /** KST calendar date, `YYYY-MM-DD`. */
  date: string;
  channel: V1AdChannel;
  impressions: number;
  clicks: number;
};

export type V1AdCampaignDetail = {
  campaign: V1AdCampaign;
  stats: V1AdCampaignTotals & {
    /** Newest KST day first. */
    daily: V1AdDailyStat[];
    /** When a counter last changed; `null` before the first event. */
    updatedAt: string | null;
  };
};

export type V1AdCampaignResult = { campaign: V1AdCampaign };

export type V1AdCampaignListFilters = {
  status?: V1AdCampaignStatus;
  q?: string;
  page?: number;
  cursor?: string;
  limit?: number;
};

/** Timestamps must carry a UTC offset (`2026-11-10T00:00:00+09:00`); a bare date is a 400. */
export type V1AdChannelCreativeInput = {
  imageUrl?: string | null;
  altText?: string | null;
  linkUrl?: string | null;
  startAt?: string | null;
  endAt?: string | null;
};

export type V1AdPopupCreativeInput = V1AdChannelCreativeInput & {
  headline?: string | null;
  description?: string | null;
};

/** PUT replaces every editable field: an omitted or `null` channel removes that channel. */
export type V1SaveAdCampaignPayload = {
  advertiserName: string;
  title: string;
  banner?: V1AdChannelCreativeInput | null;
  popup?: V1AdPopupCreativeInput | null;
};

/** `expectedVersion` is the `version` the editor loaded. */
export type V1UpdateAdCampaignPayload = V1SaveAdCampaignPayload & { expectedVersion: number };

export type V1AdPublishMissingField = 'imageUrl' | 'altText' | 'linkUrl' | 'startAt' | 'endAt' | 'headline';

/** `details[]` of a publish refusal; the first entry's `code` is the response `code`. */
export type V1AdPublishProblem =
  | { code: 'AD_CHANNEL_REQUIRED' }
  | { code: 'AD_CHANNEL_INCOMPLETE'; channel: V1AdChannel; missing: V1AdPublishMissingField[] }
  | { code: 'AD_WINDOW_ENDED'; channel: V1AdChannel };

/** `details` of `409 AD_CAMPAIGN_VERSION_CONFLICT`. */
export type V1AdVersionConflictDetails = { currentVersion: number };
