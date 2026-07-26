import { http, HttpResponse } from 'msw';
import type {
  V1ChangeTournamentCampaignStatusPayload,
  V1CreateTournamentCampaignPayload,
  V1TournamentCampaignStatus,
  V1UpdateTournamentCampaignPayload,
} from '@/types/tournament-campaign';
import {
  createV1AdminTournamentCampaignPreviewFixture,
  createV1PublicTournamentCampaignFixture,
  createV1TournamentCampaignFixture,
  createV1TournamentCampaignListItemFixture,
} from './tournament-campaign-fixtures';

const api = '*/api/v1';

function ok<T>(data: T) {
  return HttpResponse.json({
    status: 'success',
    data,
    timestamp: '2026-05-18T00:00:00.000Z',
  });
}

function notFound(message: string) {
  return HttpResponse.json(
    {
      status: 'error',
      statusCode: 404,
      code: 'TOURNAMENT_CAMPAIGN_NOT_FOUND',
      message,
      timestamp: '2026-05-18T00:00:00.000Z',
    },
    { status: 404 },
  );
}

export function createV1TournamentCampaignMswHandlers(
  initialStatus: V1TournamentCampaignStatus = 'published',
) {
  let campaign = createV1TournamentCampaignFixture(initialStatus);

  return [
    http.get(`${api}/tournaments/campaigns`, () => {
      const item = createV1TournamentCampaignListItemFixture(campaign);
      const items = item ? [item] : [];
      return ok({ items, nextCursor: null });
    }),
    http.get(`${api}/tournaments/campaigns/:slug`, ({ params }) => {
      const publicCampaign = createV1PublicTournamentCampaignFixture(campaign);
      if (!publicCampaign || params.slug !== publicCampaign.slug) {
        return notFound('공개된 대회 캠페인을 찾을 수 없어요.');
      }
      return ok(publicCampaign);
    }),
    http.get(`${api}/admin/tournaments/:tournamentId/campaign`, ({ params }) => {
      if (params.tournamentId !== campaign.tournamentId) {
        return notFound('대회 캠페인을 찾을 수 없어요.');
      }
      return ok(campaign);
    }),
    http.get(`${api}/admin/tournaments/:tournamentId/campaign/preview`, ({ params }) => {
      if (params.tournamentId !== campaign.tournamentId) {
        return notFound('대회 캠페인을 찾을 수 없어요.');
      }
      return ok(createV1AdminTournamentCampaignPreviewFixture(campaign));
    }),
    http.post(`${api}/admin/tournaments/:tournamentId/campaign`, async ({ params, request }) => {
      const body = await request.json() as V1CreateTournamentCampaignPayload;
      campaign = {
        ...createV1TournamentCampaignFixture('draft'),
        tournamentId: String(params.tournamentId),
        slug: body.slug,
        content: body.content,
        updatedAt: new Date().toISOString(),
      };
      return ok(campaign);
    }),
    http.patch(`${api}/admin/tournaments/:tournamentId/campaign`, async ({ params, request }) => {
      if (params.tournamentId !== campaign.tournamentId) {
        return notFound('대회 캠페인을 찾을 수 없어요.');
      }
      const body = await request.json() as V1UpdateTournamentCampaignPayload;
      campaign = { ...campaign, ...body, updatedAt: new Date().toISOString() };
      return ok(campaign);
    }),
    http.post(`${api}/admin/tournaments/:tournamentId/campaign/status`, async ({ params, request }) => {
      if (params.tournamentId !== campaign.tournamentId) {
        return notFound('대회 캠페인을 찾을 수 없어요.');
      }
      const body = await request.json() as V1ChangeTournamentCampaignStatusPayload;
      const now = new Date().toISOString();
      campaign = {
        ...campaign,
        status: body.status,
        publishedAt: body.status === 'published' ? campaign.publishedAt ?? now : campaign.publishedAt,
        archivedAt: body.status === 'archived' ? now : null,
        updatedAt: now,
      };
      return ok(campaign);
    }),
  ];
}

export const v1TournamentCampaignMswHandlers = createV1TournamentCampaignMswHandlers();
