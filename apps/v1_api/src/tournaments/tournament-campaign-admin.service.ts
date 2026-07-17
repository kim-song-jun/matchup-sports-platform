import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import type { V1AuthUser } from '../auth/v1-auth-user';
import { AdminContextService } from '../common/admin-context.service';
import { PrismaService } from '../prisma/prisma.service';
import type {
  ChangeTournamentCampaignStatusDto,
  CreateTournamentCampaignDto,
  UpdateTournamentCampaignDto,
} from './dto/tournament-campaign.dto';
import {
  parseCampaignContentJson,
  toCampaignContentJson,
} from './tournament-campaign-content';
import {
  findTournamentCampaign,
  serializeTournamentCampaign,
} from './tournament-campaign-record';
import { TournamentCampaignReadService } from './tournament-campaign-read.service';
import { TournamentCampaignStatusService } from './tournament-campaign-status.service';

@Injectable()
export class TournamentCampaignAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly adminContext: AdminContextService,
    private readonly statusService: TournamentCampaignStatusService,
    private readonly readService: TournamentCampaignReadService,
  ) {}

  async get(user: V1AuthUser, tournamentId: string) {
    await this.adminContext.getActiveAdmin(user.id);
    return serializeTournamentCampaign(await findTournamentCampaign(this.prisma, tournamentId));
  }

  async preview(user: V1AuthUser, tournamentId: string) {
    await this.adminContext.getActiveAdmin(user.id);
    return this.readService.getPreview(tournamentId);
  }

  async create(user: V1AuthUser, tournamentId: string, dto: CreateTournamentCampaignDto) {
    const admin = await this.adminContext.getMutationAdmin(user.id);
    const tournament = await this.prisma.v1Tournament.findFirst({
      where: { id: tournamentId, deletedAt: null },
      select: { id: true, status: true },
    });
    if (!tournament) {
      throw new NotFoundException({ code: 'TOURNAMENT_NOT_FOUND', message: '대회를 찾을 수 없어요.' });
    }
    const existing = await this.prisma.v1TournamentCampaign.findUnique({ where: { tournamentId } });
    if (existing) {
      throw new ConflictException({
        code: 'TOURNAMENT_CAMPAIGN_EXISTS',
        message: '이 대회에는 이미 캠페인이 있어요.',
      });
    }
    await this.assertSlugAvailable(dto.slug);

    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const campaign = await tx.v1TournamentCampaign.create({
          data: {
            tournamentId,
            slug: dto.slug,
            status: 'draft',
            content: toCampaignContentJson(dto.content),
          },
        });
        await this.adminContext.logAdminAction(
          admin,
          {
            action: 'tournament_campaign.create',
            targetType: 'tournament_campaign',
            targetId: campaign.id,
            afterJson: { slug: campaign.slug, status: campaign.status },
          },
          tx,
        );
        return campaign;
      });
      return serializeTournamentCampaign(created);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        this.throwUniqueConflict(error);
      }
      throw error;
    }
  }

  async update(user: V1AuthUser, tournamentId: string, dto: UpdateTournamentCampaignDto) {
    const admin = await this.adminContext.getMutationAdmin(user.id);
    if (dto.slug === undefined && dto.content === undefined) {
      this.throwNoChanges();
    }

    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        const existing = await findTournamentCampaign(tx, tournamentId);
        const nextContent = dto.content === undefined ? undefined : toCampaignContentJson(dto.content);
        const slugChanged = dto.slug !== undefined && dto.slug !== existing.slug;
        const contentChanged =
          nextContent !== undefined &&
          JSON.stringify(nextContent) !== JSON.stringify(parseCampaignContentJson(existing.content));
        if (!slugChanged && !contentChanged) {
          this.throwNoChanges();
        }
        if (slugChanged && existing.publishedAt) {
          this.throwSlugLocked();
        }

        const data: Prisma.V1TournamentCampaignUpdateManyMutationInput = {};
        if (slugChanged) data.slug = dto.slug;
        if (contentChanged) data.content = nextContent;
        const result = await tx.v1TournamentCampaign.updateMany({
          where: { id: existing.id, ...(slugChanged ? { publishedAt: null } : {}) },
          data,
        });
        if (result.count !== 1) {
          if (slugChanged) this.throwSlugLocked();
          this.throwMutationConflict();
        }

        const campaign = await findTournamentCampaign(tx, tournamentId);
        const changedFields = [
          ...(slugChanged ? ['slug'] : []),
          ...(contentChanged ? ['content'] : []),
        ];
        await this.adminContext.logAdminAction(
          admin,
          {
            action: 'tournament_campaign.update',
            targetType: 'tournament_campaign',
            targetId: campaign.id,
            beforeJson: {
              slug: existing.slug,
              status: existing.status,
              contentDigest: this.contentDigest(existing.content),
            },
            afterJson: {
              slug: campaign.slug,
              status: campaign.status,
              contentDigest: this.contentDigest(campaign.content),
              changedFields,
            },
          },
          tx,
        );
        return campaign;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      return serializeTournamentCampaign(updated);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        this.throwUniqueConflict(error);
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
        this.throwMutationConflict();
      }
      throw error;
    }
  }

  async changeStatus(
    user: V1AuthUser,
    tournamentId: string,
    dto: ChangeTournamentCampaignStatusDto,
  ) {
    return this.statusService.changeStatus(user, tournamentId, dto);
  }

  private async assertSlugAvailable(slug: string): Promise<void> {
    const campaign = await this.prisma.v1TournamentCampaign.findUnique({ where: { slug } });
    if (campaign) this.throwSlugTaken();
  }

  private throwUniqueConflict(error: Prisma.PrismaClientKnownRequestError): never {
    const target = error.meta?.target;
    if (
      Array.isArray(target) &&
      target.some((field) => field === 'tournament_id' || field === 'tournamentId')
    ) {
      throw new ConflictException({
        code: 'TOURNAMENT_CAMPAIGN_EXISTS',
        message: '이 대회에는 이미 캠페인이 있어요.',
      });
    }
    if (Array.isArray(target) && target.includes('slug')) {
      this.throwSlugTaken();
    }
    if (typeof target === 'string' && target.includes('tournament')) {
      throw new ConflictException({
        code: 'TOURNAMENT_CAMPAIGN_EXISTS',
        message: '이 대회에는 이미 캠페인이 있어요.',
      });
    }
    if (typeof target === 'string' && target.includes('slug')) {
      this.throwSlugTaken();
    }
    throw error;
  }

  private throwSlugTaken(): never {
    throw new ConflictException({
      code: 'TOURNAMENT_CAMPAIGN_SLUG_TAKEN',
      message: '이미 사용 중인 캠페인 주소예요.',
    });
  }

  private throwSlugLocked(): never {
    throw new ConflictException({
      code: 'TOURNAMENT_CAMPAIGN_SLUG_LOCKED',
      message: '한 번 공개된 캠페인의 주소는 변경할 수 없어요.',
    });
  }

  private throwNoChanges(): never {
    throw new BadRequestException({
      code: 'TOURNAMENT_CAMPAIGN_NO_CHANGES',
      message: '변경할 캠페인 내용을 입력해 주세요.',
    });
  }

  private throwMutationConflict(): never {
    throw new ConflictException({
      code: 'TOURNAMENT_CAMPAIGN_CONCURRENT_UPDATE',
      message: '캠페인이 다른 요청에서 변경됐어요. 새로고침 후 다시 시도해 주세요.',
    });
  }

  private contentDigest(content: Prisma.JsonValue): string {
    return createHash('sha256').update(JSON.stringify(content)).digest('hex');
  }

}
