import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { V1AuthUser } from '../auth/v1-auth-user';
import { AdminContextService } from '../common/admin-context.service';
import { PrismaService } from '../prisma/prisma.service';
import type {
  ChangeTournamentCampaignStatusDto,
  TournamentCampaignStatus,
} from './dto/tournament-campaign.dto';
import { PUBLIC_TOURNAMENT_STATUSES } from './dto/tournament-read.dto';
import {
  findTournamentCampaign,
  serializeTournamentCampaign,
} from './tournament-campaign-record';

const CAMPAIGN_TRANSITIONS: Record<TournamentCampaignStatus, readonly TournamentCampaignStatus[]> = {
  draft: ['published', 'archived'],
  published: ['draft', 'archived'],
  archived: ['draft'],
};

@Injectable()
export class TournamentCampaignStatusService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly adminContext: AdminContextService,
  ) {}

  async changeStatus(
    user: V1AuthUser,
    tournamentId: string,
    dto: ChangeTournamentCampaignStatusDto,
  ) {
    const admin = await this.adminContext.getMutationAdmin(user.id);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const existing = await findTournamentCampaign(tx, tournamentId);
        const from: TournamentCampaignStatus = existing.status;
        if (from === dto.status) {
          return {
            tournamentId,
            previousStatus: from,
            status: dto.status,
            alreadyInStatus: true,
          };
        }
        if (!CAMPAIGN_TRANSITIONS[from].includes(dto.status)) {
          throw new ConflictException({
            code: 'NOT_PUBLISHABLE',
            message: `${from} 상태에서 ${dto.status}(으)로 변경할 수 없어요.`,
          });
        }

        let data: Prisma.V1TournamentCampaignUpdateManyMutationInput;
        switch (dto.status) {
          case 'published': {
            const tournament = await tx.v1Tournament.findFirst({
              where: {
                id: tournamentId,
                deletedAt: null,
                status: { in: [...PUBLIC_TOURNAMENT_STATUSES] },
              },
              select: { id: true },
            });
            if (!tournament) {
              throw new ConflictException({
                code: 'NOT_PUBLISHABLE',
                message: '공개 상태인 대회만 캠페인을 공개할 수 있어요.',
              });
            }
            data = {
              status: 'published',
              publishedAt: existing.publishedAt ?? new Date(),
              archivedAt: null,
            };
            break;
          }
          case 'draft':
            data = { status: 'draft', archivedAt: null };
            break;
          case 'archived':
            data = { status: 'archived', archivedAt: new Date() };
            break;
          default: {
            const exhaustive: never = dto.status;
            return exhaustive;
          }
        }

        const result = await tx.v1TournamentCampaign.updateMany({
          where: { id: existing.id, status: from },
          data,
        });
        if (result.count !== 1) this.throwMutationConflict();
        const campaign = await findTournamentCampaign(tx, tournamentId);
        await this.adminContext.logAdminAction(
          admin,
          {
            action: 'tournament_campaign.status',
            targetType: 'tournament_campaign',
            targetId: campaign.id,
            reason: dto.reason,
            beforeJson: {
              slug: existing.slug,
              status: from,
              archivedAt: existing.archivedAt?.toISOString() ?? null,
            },
            afterJson: {
              slug: campaign.slug,
              status: campaign.status,
              archivedAt: campaign.archivedAt?.toISOString() ?? null,
            },
            fromStatus: from,
            toStatus: dto.status,
          },
          tx,
        );
        return serializeTournamentCampaign(campaign);
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
        this.throwMutationConflict();
      }
      throw error;
    }
  }

  private throwMutationConflict(): never {
    throw new ConflictException({
      code: 'TOURNAMENT_CAMPAIGN_CONCURRENT_UPDATE',
      message: '캠페인이 다른 요청에서 변경됐어요. 새로고침 후 다시 시도해 주세요.',
    });
  }
}
