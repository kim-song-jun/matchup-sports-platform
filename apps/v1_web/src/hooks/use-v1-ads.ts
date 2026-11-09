import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useV1DataSource } from '@/components/providers/v1-data-source';
import { v1Get } from '@/lib/api-client';
import { v1Keys } from '@/lib/query-keys';
import type {
  V1ActiveAds,
  V1AdCampaignDetail,
  V1AdCampaignList,
  V1AdCampaignListFilters,
  V1AdCampaignResult,
  V1SaveAdCampaignPayload,
  V1UpdateAdCampaignPayload,
} from '@/types/ads';

/** The server caches `/ads/active` for 30 seconds, so refetching sooner returns the same bytes. */
const ACTIVE_ADS_STALE_MS = 30_000;

/**
 * Banner and popup that are live right now. Public: no session needed. A failure resolves to a query error
 * and `v1Get` already records it, so callers render the page without ads when `data` is missing.
 */
export function useV1ActiveAds() {
  return useQuery({
    queryKey: v1Keys.activeAds(),
    queryFn: () => v1Get<V1ActiveAds>('/ads/active'),
    staleTime: ACTIVE_ADS_STALE_MS,
  });
}

export function useV1AdminAdCampaigns(filters?: V1AdCampaignListFilters) {
  const { v1Get } = useV1DataSource();
  return useQuery({
    queryKey: v1Keys.adminAdCampaigns(filters),
    queryFn: () => v1Get<V1AdCampaignList>('/admin/ad-campaigns', filters),
    placeholderData: keepPreviousData,
  });
}

export function useV1AdminAdCampaign(campaignId: string) {
  const { v1Get } = useV1DataSource();
  return useQuery({
    queryKey: v1Keys.adminAdCampaign(campaignId),
    queryFn: () => v1Get<V1AdCampaignDetail>(`/admin/ad-campaigns/${campaignId}`),
    enabled: Boolean(campaignId),
  });
}

/**
 * Refresh on success and on failure: a version conflict or an invalid-state refusal means the screen
 * is showing an older campaign than the server holds.
 */
function useAdCampaignWriteSettled({ affectsPublicAds }: { affectsPublicAds: boolean }) {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: v1Keys.adminAdCampaignsAll() });
    if (affectsPublicAds) queryClient.invalidateQueries({ queryKey: v1Keys.activeAds() });
  };
}

/** Creates a draft (`version: 1`). Drafts are never public, so the public ad is left alone. */
export function useV1CreateAdCampaign() {
  const { v1Post } = useV1DataSource();
  return useMutation({
    mutationFn: (body: V1SaveAdCampaignPayload) => v1Post<V1AdCampaignResult>('/admin/ad-campaigns', body),
    onSettled: useAdCampaignWriteSettled({ affectsPublicAds: false }),
  });
}

/** `expectedVersion` is the `version` the editor loaded; a different stored version is `409 AD_CAMPAIGN_VERSION_CONFLICT`. */
export function useV1UpdateAdCampaign() {
  const { v1Put } = useV1DataSource();
  return useMutation({
    mutationFn: ({ campaignId, expectedVersion, body }: {
      campaignId: string;
      expectedVersion: number;
      body: V1SaveAdCampaignPayload;
    }) => {
      const payload: V1UpdateAdCampaignPayload = { ...body, expectedVersion };
      return v1Put<V1AdCampaignResult>(`/admin/ad-campaigns/${campaignId}`, payload);
    },
    onSettled: useAdCampaignWriteSettled({ affectsPublicAds: true }),
  });
}

export function useV1PublishAdCampaign() {
  const { v1Post } = useV1DataSource();
  return useMutation({
    mutationFn: ({ campaignId, expectedVersion }: { campaignId: string; expectedVersion: number }) =>
      v1Post<V1AdCampaignResult>(`/admin/ad-campaigns/${campaignId}/publish`, { expectedVersion }),
    onSettled: useAdCampaignWriteSettled({ affectsPublicAds: true }),
  });
}

/** Stops a published campaign; it can be published again afterwards. The server accepts no version here. */
export function useV1StopAdCampaign() {
  const { v1Post } = useV1DataSource();
  return useMutation({
    mutationFn: (campaignId: string) => v1Post<V1AdCampaignResult>(`/admin/ad-campaigns/${campaignId}/stop`),
    onSettled: useAdCampaignWriteSettled({ affectsPublicAds: true }),
  });
}
