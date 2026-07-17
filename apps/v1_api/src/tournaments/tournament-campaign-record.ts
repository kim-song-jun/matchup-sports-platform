import { NotFoundException } from '@nestjs/common';
import type { Prisma, V1TournamentCampaign } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import { parseCampaignContentJson } from './tournament-campaign-content';

type TournamentCampaignClient = PrismaService | Prisma.TransactionClient;

export async function findTournamentCampaign(
  client: TournamentCampaignClient,
  tournamentId: string,
): Promise<V1TournamentCampaign> {
  const campaign = await client.v1TournamentCampaign.findUnique({ where: { tournamentId } });
  if (!campaign) {
    throw new NotFoundException({
      code: 'TOURNAMENT_CAMPAIGN_NOT_FOUND',
      message: '대회 캠페인을 찾을 수 없어요.',
    });
  }
  return campaign;
}

export function serializeTournamentCampaign(campaign: V1TournamentCampaign) {
  return {
    ...campaign,
    content: parseCampaignContentJson(campaign.content),
    publishedAt: campaign.publishedAt?.toISOString() ?? null,
    archivedAt: campaign.archivedAt?.toISOString() ?? null,
    createdAt: campaign.createdAt.toISOString(),
    updatedAt: campaign.updatedAt.toISOString(),
  };
}
