import type {
  V1ActiveAds,
  V1AdCampaign,
  V1AdCampaignDetail,
  V1AdCampaignListItem,
  V1PublicAd,
  V1PublicPopupAd,
} from '@/types/ads';

/** Which creatives `GET /ads/active` serves. */
export type V1AdsScenario = 'none' | 'banner' | 'popup' | 'both';

export const AD_FIXTURE_BANNER_CAMPAIGN_ID = '0d7c1c9e-3f0a-4a52-9a53-0a6f3d7b1001';
export const AD_FIXTURE_POPUP_CAMPAIGN_ID = '0d7c1c9e-3f0a-4a52-9a53-0a6f3d7b1002';

export function createV1PublicBannerAdFixture(overrides: Partial<V1PublicAd> = {}): V1PublicAd {
  return {
    campaignId: AD_FIXTURE_BANNER_CAMPAIGN_ID,
    advertiserName: '에버데이',
    imageUrl: '/uploads/ads/banner.webp',
    altText: '에버데이 신제품 풋살화',
    linkUrl: '/tournaments/tournament-1',
    ...overrides,
  };
}

export function createV1PublicPopupAdFixture(overrides: Partial<V1PublicPopupAd> = {}): V1PublicPopupAd {
  return {
    campaignId: AD_FIXTURE_POPUP_CAMPAIGN_ID,
    advertiserName: '에버데이',
    imageUrl: '/uploads/ads/popup.webp',
    altText: '에버데이 11월 협업 이벤트',
    linkUrl: 'https://everyday.example.com/event',
    headline: '11월 협업 이벤트',
    description: null,
    ...overrides,
  };
}

export function createV1ActiveAdsFixture(scenario: V1AdsScenario): V1ActiveAds {
  return {
    banner: scenario === 'banner' || scenario === 'both' ? createV1PublicBannerAdFixture() : null,
    popup: scenario === 'popup' || scenario === 'both' ? createV1PublicPopupAdFixture() : null,
  };
}

export function createV1AdCampaignFixture(overrides: Partial<V1AdCampaign> = {}): V1AdCampaign {
  return {
    id: AD_FIXTURE_BANNER_CAMPAIGN_ID,
    advertiserName: '에버데이',
    title: '11월 에버데이 협업',
    status: 'draft',
    version: 1,
    banner: {
      imageUrl: '/uploads/ads/banner.webp',
      altText: '에버데이 신제품 풋살화',
      linkUrl: '/tournaments/tournament-1',
      startAt: '2026-11-11T15:00:00.000Z',
      endAt: '2026-11-19T15:00:00.000Z',
      phase: null,
    },
    popup: null,
    publishedAt: null,
    stoppedAt: null,
    createdAt: '2026-11-08T00:00:00.000Z',
    updatedAt: '2026-11-08T00:00:00.000Z',
    createdBy: { adminUserId: 'admin-owner-1', name: '대표' },
    ...overrides,
  };
}

export function createV1AdCampaignListItemFixture(campaign: V1AdCampaign): V1AdCampaignListItem {
  return {
    ...campaign,
    stats: {
      banner: { impressions: 150, clicks: 5 },
      popup: { impressions: 0, clicks: 0 },
    },
  };
}

export function createV1AdCampaignDetailFixture(campaign: V1AdCampaign): V1AdCampaignDetail {
  return {
    campaign,
    stats: {
      banner: { impressions: 150, clicks: 5 },
      popup: { impressions: 0, clicks: 0 },
      daily: [
        { date: '2026-11-12', channel: 'banner', impressions: 100, clicks: 4 },
        { date: '2026-11-11', channel: 'banner', impressions: 50, clicks: 1 },
      ],
      updatedAt: '2026-11-12T12:00:00.000Z',
    },
  };
}
