import { http, HttpResponse } from 'msw';
import type {
  V1AdCampaign,
  V1AdChannel,
  V1AdChannelCreative,
  V1AdChannelCreativeInput,
  V1AdChannelPhase,
  V1AdEvent,
  V1AdPopupCreative,
  V1AdPopupCreativeInput,
  V1AdPublishMissingField,
  V1AdPublishProblem,
  V1AdCampaignStatus,
  V1SaveAdCampaignPayload,
} from '@/types/ads';
import {
  createV1ActiveAdsFixture,
  createV1AdCampaignDetailFixture,
  createV1AdCampaignFixture,
  createV1AdCampaignListItemFixture,
  type V1AdsScenario,
} from './ads-fixtures';

const api = '*/api/v1';
const TIMESTAMP = '2026-11-08T00:00:00.000Z';
const EVENT_BATCH_MAX = 20;
/** Mirrors `REQUIRED_FIELDS` in `apps/v1_api/src/ads/ad-campaign.ts`, in the same order, so `missing` reads like the server's. */
const PUBLISH_REQUIRED_FIELDS: Record<V1AdChannel, readonly V1AdPublishMissingField[]> = {
  banner: ['imageUrl', 'altText', 'linkUrl', 'startAt', 'endAt'],
  popup: ['imageUrl', 'altText', 'headline', 'linkUrl', 'startAt', 'endAt'],
};

function ok<T>(data: T) {
  return HttpResponse.json({ status: 'success', data, timestamp: TIMESTAMP });
}

function failure(statusCode: number, code: string, message: string, details?: unknown) {
  return HttpResponse.json(
    { status: 'error', statusCode, code, message, details, timestamp: TIMESTAMP },
    { status: statusCode },
  );
}

const notFound = () => failure(404, 'AD_CAMPAIGN_NOT_FOUND', '광고 캠페인을 찾을 수 없어요.');

function derivePhase(status: V1AdCampaignStatus, creative: Pick<V1AdChannelCreative, 'startAt' | 'endAt'>): V1AdChannelPhase | null {
  if (status !== 'published' || !creative.startAt || !creative.endAt) return null;
  const now = Date.now();
  if (now < Date.parse(creative.startAt)) return 'scheduled';
  return now < Date.parse(creative.endAt) ? 'live' : 'ended';
}

function creativeFromInput(
  status: V1AdCampaignStatus,
  input: V1AdChannelCreativeInput | null | undefined,
): V1AdChannelCreative | null {
  if (!input) return null;
  const creative = {
    imageUrl: input.imageUrl ?? null,
    altText: input.altText?.trim() || null,
    linkUrl: input.linkUrl ?? null,
    startAt: input.startAt ? new Date(input.startAt).toISOString() : null,
    endAt: input.endAt ? new Date(input.endAt).toISOString() : null,
  };
  if (Object.values(creative).every((value) => value === null)) return null;
  return { ...creative, phase: derivePhase(status, creative) };
}

function popupFromInput(status: V1AdCampaignStatus, input: V1AdPopupCreativeInput | null | undefined): V1AdPopupCreative | null {
  const base = creativeFromInput(status, input);
  if (!base) return null;
  return { ...base, headline: input?.headline?.trim() || null, description: input?.description?.trim() || null };
}

function findPublishProblems(campaign: V1AdCampaign): V1AdPublishProblem[] {
  const channels: Array<[V1AdChannel, V1AdChannelCreative | V1AdPopupCreative | null]> = [
    ['banner', campaign.banner],
    ['popup', campaign.popup],
  ];
  const configured = channels.filter(([, creative]) => creative !== null);
  if (configured.length === 0) return [{ code: 'AD_CHANNEL_REQUIRED' }];
  const problems: V1AdPublishProblem[] = [];
  for (const [channel, creative] of configured) {
    const values: Record<string, unknown> = { ...creative };
    const missing = PUBLISH_REQUIRED_FIELDS[channel].filter((name) => (values[name] ?? null) === null);
    if (missing.length > 0) problems.push({ code: 'AD_CHANNEL_INCOMPLETE', channel, missing });
  }
  return problems;
}

function matchesQuery(campaign: V1AdCampaign, q: string | null): boolean {
  if (!q) return true;
  const needle = q.toLowerCase();
  return campaign.title.toLowerCase().includes(needle) || campaign.advertiserName.toLowerCase().includes(needle);
}

/**
 * Handlers for the ads API. `scenario` picks what `GET /ads/active` serves; the admin routes keep one in-memory
 * campaign list per call, so tests never share campaigns. Versions, optimistic-lock conflicts, invalid state
 * transitions and the publish completeness check (per channel, popup headline included) behave like the server.
 * Not modelled (override with `server.use`): window overlap and `AD_WINDOW_ENDED` on publish, `AD_INVALID_WINDOW`
 * on save, the completeness check when saving an already published campaign, DTO validation (link rule, field
 * lengths, timestamp format) and content-asset ownership of `imageUrl`.
 */
export function createV1AdsMswHandlers(
  scenario: V1AdsScenario = 'none',
  initialCampaigns: V1AdCampaign[] = [createV1AdCampaignFixture()],
) {
  let campaigns = [...initialCampaigns];
  let nextId = campaigns.length + 1;

  const replace = (next: V1AdCampaign) => {
    campaigns = campaigns.map((campaign) => (campaign.id === next.id ? next : campaign));
    return next;
  };

  return [
    http.get(`${api}/ads/active`, () => ok(createV1ActiveAdsFixture(scenario))),
    http.post(`${api}/ads/events`, async ({ request }) => {
      const body = await request.json() as { events?: V1AdEvent[] };
      const size = body.events?.length ?? 0;
      if (size < 1 || size > EVENT_BATCH_MAX) {
        return failure(400, 'VALIDATION_ERROR', `events는 1~${EVENT_BATCH_MAX}건이어야 해요.`);
      }
      return new HttpResponse(null, { status: 204 });
    }),
    http.get(`${api}/admin/ad-campaigns`, ({ request }) => {
      const url = new URL(request.url);
      const status = url.searchParams.get('status');
      const limit = Number(url.searchParams.get('limit')) || 20;
      const scoped = campaigns.filter((campaign) => matchesQuery(campaign, url.searchParams.get('q')));
      const filtered = status ? scoped.filter((campaign) => campaign.status === status) : scoped;
      const byStatus = { draft: 0, published: 0, stopped: 0 };
      for (const campaign of scoped) byStatus[campaign.status] += 1;
      return ok({
        items: filtered.slice(0, limit).map(createV1AdCampaignListItemFixture),
        pageInfo: {
          nextCursor: null,
          hasNext: false,
          hasPrev: false,
          page: 1,
          limit,
          total: filtered.length,
          totalPages: Math.max(1, Math.ceil(filtered.length / limit)),
        },
        summary: { total: scoped.length, byStatus },
      });
    }),
    http.get(`${api}/admin/ad-campaigns/:campaignId`, ({ params }) => {
      const campaign = campaigns.find((item) => item.id === params.campaignId);
      return campaign ? ok(createV1AdCampaignDetailFixture(campaign)) : notFound();
    }),
    http.post(`${api}/admin/ad-campaigns`, async ({ request }) => {
      const body = await request.json() as V1SaveAdCampaignPayload;
      const campaign = createV1AdCampaignFixture({
        id: `ad-campaign-${nextId}`,
        advertiserName: body.advertiserName,
        title: body.title,
        status: 'draft',
        version: 1,
        banner: creativeFromInput('draft', body.banner),
        popup: popupFromInput('draft', body.popup),
      });
      nextId += 1;
      campaigns = [campaign, ...campaigns];
      return ok({ campaign });
    }),
    http.put(`${api}/admin/ad-campaigns/:campaignId`, async ({ params, request }) => {
      const existing = campaigns.find((item) => item.id === params.campaignId);
      if (!existing) return notFound();
      const body = await request.json() as V1SaveAdCampaignPayload & { expectedVersion: number };
      if (body.expectedVersion !== existing.version) {
        return failure(409, 'AD_CAMPAIGN_VERSION_CONFLICT', '다른 운영자가 먼저 저장했어요. 화면을 새로 고쳐 최신 내용을 확인해 주세요.', {
          currentVersion: existing.version,
        });
      }
      return ok({
        campaign: replace({
          ...existing,
          advertiserName: body.advertiserName,
          title: body.title,
          banner: creativeFromInput(existing.status, body.banner),
          popup: popupFromInput(existing.status, body.popup),
          version: existing.version + 1,
          updatedAt: new Date().toISOString(),
        }),
      });
    }),
    http.post(`${api}/admin/ad-campaigns/:campaignId/publish`, async ({ params, request }) => {
      const existing = campaigns.find((item) => item.id === params.campaignId);
      if (!existing) return notFound();
      const body = await request.json() as { expectedVersion: number };
      if (body.expectedVersion !== existing.version) {
        return failure(409, 'AD_CAMPAIGN_VERSION_CONFLICT', '다른 운영자가 먼저 저장했어요. 화면을 새로 고쳐 최신 내용을 확인해 주세요.', {
          currentVersion: existing.version,
        });
      }
      if (existing.status === 'published') return failure(409, 'AD_CAMPAIGN_INVALID_STATE', '이미 게시된 광고예요.');
      const problems = findPublishProblems(existing);
      if (problems.length > 0) {
        return failure(400, problems[0].code, '게시하려면 채우지 않은 항목을 먼저 채워 주세요.', problems);
      }
      const now = new Date().toISOString();
      return ok({
        campaign: replace({
          ...existing,
          status: 'published',
          banner: existing.banner && { ...existing.banner, phase: derivePhase('published', existing.banner) },
          popup: existing.popup && { ...existing.popup, phase: derivePhase('published', existing.popup) },
          publishedAt: now,
          stoppedAt: null,
          version: existing.version + 1,
          updatedAt: now,
        }),
      });
    }),
    http.post(`${api}/admin/ad-campaigns/:campaignId/stop`, ({ params }) => {
      const existing = campaigns.find((item) => item.id === params.campaignId);
      if (!existing) return notFound();
      if (existing.status !== 'published') {
        return failure(409, 'AD_CAMPAIGN_INVALID_STATE', '게시 중인 광고만 중단할 수 있어요.');
      }
      const now = new Date().toISOString();
      return ok({
        campaign: replace({
          ...existing,
          status: 'stopped',
          banner: existing.banner && { ...existing.banner, phase: null },
          popup: existing.popup && { ...existing.popup, phase: null },
          stoppedAt: now,
          version: existing.version + 1,
          updatedAt: now,
        }),
      });
    }),
  ];
}

/** Registered in the shared server: no ad is live, so screens that read `/ads/active` render without one. */
export const v1AdsMswHandlers = createV1AdsMswHandlers('none');
