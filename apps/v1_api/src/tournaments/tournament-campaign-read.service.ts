import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PUBLIC_TOURNAMENT_STATUSES } from './dto/tournament-read.dto';
import type { TournamentCampaignContentDto } from './dto/tournament-campaign.dto';
import { parseCampaignContentJson } from './tournament-campaign-content';

// Helper to extract typed content from the parsed JSON
function parsedToContent(parsed: Prisma.InputJsonObject): TournamentCampaignContentDto {
  return parsed as unknown as TournamentCampaignContentDto;
}

const CAMPAIGN_NOT_FOUND_RESPONSE = {
  code: 'TOURNAMENT_CAMPAIGN_NOT_FOUND',
  message: '대회 캠페인을 찾을 수 없어요.',
} as const;

const CAPACITY_HOLD_STATUSES = [
  'awaiting_payment',
  'payment_checking',
  'paid',
] as const;

type RegistrationAvailability =
  | 'available'
  | 'deadline_passed'
  | 'full'
  | 'started'
  | 'closed';

const CAMPAIGN_PUBLIC_PROJECTION = Prisma.validator<Prisma.V1TournamentCampaignDefaultArgs>()({
  select: {
    id: true,
    slug: true,
    status: true,
    content: true,
    publishedAt: true,
    updatedAt: true,
    tournament: {
      select: {
        id: true,
        title: true,
        status: true,
        format: true,
        sport: { select: { code: true, name: true } },
        scheduledAt: true,
        scheduledEndAt: true,
        registrationDeadlineAt: true,
        venue: true,
        coverImageUrl: true,
        teamCount: true,
        minPlayers: true,
        maxPlayers: true,
        entryFee: true,
        rulesText: true,
        refundPolicyText: true,
        prizePool: true,
        prizeSummary: true,
        prizeBreakdown: true,
        sponsors: {
          where: { isActive: true },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
          select: {
            id: true,
            name: true,
            description: true,
            logoUrl: true,
            websiteUrl: true,
            instagramUrl: true,
            benefitText: true,
            boothText: true,
            eventTitle: true,
            eventDescription: true,
            eventResultText: true,
            sortOrder: true,
          },
        },
        registrations: {
          where: {
            status: {
              in: [
                'confirmed',
                'waitlisted',
                ...CAPACITY_HOLD_STATUSES,
              ],
            },
          },
          select: {
            id: true,
            status: true,
            confirmedAt: true,
            team: {
              select: {
                id: true,
                name: true,
                profile: { select: { logoUrl: true } },
                region: { select: { name: true } },
              },
            },
          },
        },
        _count: {
          select: { registrations: { where: { status: 'confirmed' } } },
        },
      },
    },
  },
});

const CAMPAIGN_LIST_PROJECTION = Prisma.validator<Prisma.V1TournamentCampaignDefaultArgs>()({
  select: {
    id: true,
    slug: true,
    content: true,
    publishedAt: true,
    updatedAt: true,
    tournament: {
      select: {
        id: true,
        title: true,
        status: true,
        sport: { select: { code: true, name: true } },
        scheduledAt: true,
        scheduledEndAt: true,
        registrationDeadlineAt: true,
        venue: true,
        coverImageUrl: true,
        teamCount: true,
        entryFee: true,
        prizePool: true,
        prizeSummary: true,
        _count: {
          select: { registrations: { where: { status: 'confirmed' } } },
        },
        registrations: {
          where: { status: { in: ['awaiting_payment', 'payment_checking', 'paid'] } },
          select: { id: true },
        },
      },
    },
  },
});

export type CampaignListItem = {
  id: string;
  slug: string;
  heroTitle: string;
  heroSummary: string | null;
  heroImageUrl: string | null;
  publishedAt: string;
  updatedAt: string;
  tournament: {
    id: string;
    title: string;
    status: string;
    sport: { code: string; name: string };
    scheduledAt: string | null;
    scheduledEndAt: string | null;
    registrationDeadlineAt: string | null;
    venue: string | null;
    coverImageUrl: string | null;
    teamCount: number;
    entryFee: number;
    prizePool: number | null;
    prizeSummary: string | null;
    confirmedCount: number;
    pendingPaymentCount: number;
    registrationAvailability: RegistrationAvailability;
  };
};

@Injectable()
export class TournamentCampaignReadService {
  constructor(private readonly prisma: PrismaService) {}

  async listPublished(params: {
    cursor?: string;
    limit?: number;
    sportCode?: string;
  }): Promise<{ items: CampaignListItem[]; nextCursor: string | null }> {
    const limit = Math.min(params.limit ?? 20, 50);
    const rows = await this.prisma.v1TournamentCampaign.findMany({
      where: {
        status: 'published',
        tournament: {
          deletedAt: null,
          status: { in: [...PUBLIC_TOURNAMENT_STATUSES] },
          ...(params.sportCode
            ? { sport: { code: params.sportCode } }
            : {}),
        },
      },
      ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
      take: limit + 1,
      orderBy: { publishedAt: 'desc' },
      ...CAMPAIGN_LIST_PROJECTION,
    });

    const hasMore = rows.length > limit;
    const items = (hasMore ? rows.slice(0, limit) : rows).map((row) => {
      const content = parsedToContent(parseCampaignContentJson(row.content));
      const pendingPaymentCount = row.tournament.registrations.length;
      const confirmedCount = row.tournament._count.registrations;
      const registrationAvailability = getRegistrationAvailability({
        status: row.tournament.status,
        scheduledAt: row.tournament.scheduledAt,
        registrationDeadlineAt: row.tournament.registrationDeadlineAt,
        teamCount: row.tournament.teamCount,
        confirmedCount,
        pendingPaymentCount,
      });
      return {
        id: row.id,
        slug: row.slug,
        heroTitle: content.hero.title,
        heroSummary: content.hero.summary ?? null,
        heroImageUrl: content.hero.imageUrl ?? row.tournament.coverImageUrl ?? null,
        publishedAt: row.publishedAt!.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        tournament: {
          id: row.tournament.id,
          title: row.tournament.title,
          status: row.tournament.status,
          sport: row.tournament.sport,
          scheduledAt: row.tournament.scheduledAt?.toISOString() ?? null,
          scheduledEndAt: row.tournament.scheduledEndAt?.toISOString() ?? null,
          registrationDeadlineAt: row.tournament.registrationDeadlineAt?.toISOString() ?? null,
          venue: row.tournament.venue,
          coverImageUrl: row.tournament.coverImageUrl,
          teamCount: row.tournament.teamCount,
          entryFee: row.tournament.entryFee,
          prizePool: row.tournament.prizePool,
          prizeSummary: row.tournament.prizeSummary,
          confirmedCount,
          pendingPaymentCount,
          registrationAvailability,
        },
      };
    });

    return {
      items,
      nextCursor: hasMore ? items[items.length - 1].id : null,
    };
  }

  async getPublished(slug: string) {
    return this.getCampaign({
      slug,
      status: 'published',
      tournament: {
        deletedAt: null,
        status: { in: [...PUBLIC_TOURNAMENT_STATUSES] },
      },
    });
  }

  async assertPublishedAvailable(slug: string): Promise<void> {
    const availableCampaign = await this.prisma.v1TournamentCampaign.findFirst({
      where: {
        slug,
        status: 'published',
        tournament: {
          deletedAt: null,
          status: { in: [...PUBLIC_TOURNAMENT_STATUSES] },
        },
      },
      select: { id: true },
    });
    if (!availableCampaign) {
      throw new NotFoundException(CAMPAIGN_NOT_FOUND_RESPONSE);
    }
  }

  async getPreview(tournamentId: string) {
    return this.getCampaign({ tournamentId });
  }

  private async getCampaign(where: Prisma.V1TournamentCampaignWhereInput) {
    const campaign = await this.prisma.v1TournamentCampaign.findFirst({
      where,
      ...CAMPAIGN_PUBLIC_PROJECTION,
    });
    if (!campaign) {
      throw new NotFoundException(CAMPAIGN_NOT_FOUND_RESPONSE);
    }

    const { _count, registrations, ...tournament } = campaign.tournament;
    const pendingPaymentCount = registrations.filter((registration) =>
      CAPACITY_HOLD_STATUSES.includes(
        registration.status as (typeof CAPACITY_HOLD_STATUSES)[number],
      ),
    ).length;
    const registrationAvailability = getRegistrationAvailability({
      status: tournament.status,
      scheduledAt: tournament.scheduledAt,
      registrationDeadlineAt: tournament.registrationDeadlineAt,
      teamCount: tournament.teamCount,
      confirmedCount: _count.registrations,
      pendingPaymentCount,
    });

    return {
      id: campaign.id,
      slug: campaign.slug,
      status: campaign.status,
      content: parseCampaignContentJson(campaign.content),
      publishedAt: campaign.publishedAt?.toISOString() ?? null,
      updatedAt: campaign.updatedAt.toISOString(),
      tournament: {
        ...tournament,
        confirmedCount: _count.registrations,
        pendingPaymentCount,
        registrationAvailability,
        participantTeams: registrations
          .filter((registration) =>
            registration.status === 'confirmed' || registration.status === 'waitlisted',
          )
          .map((registration) => ({
            registrationId: registration.id,
            teamId: registration.team.id,
            teamName: registration.team.name,
            teamLogoUrl: registration.team.profile?.logoUrl ?? null,
            teamRegionName: registration.team.region?.name ?? null,
            status: registration.status,
            confirmedAt: registration.confirmedAt?.toISOString() ?? null,
          })),
        registrationDeadlineAt: tournament.registrationDeadlineAt?.toISOString() ?? null,
        scheduledAt: tournament.scheduledAt?.toISOString() ?? null,
        scheduledEndAt: tournament.scheduledEndAt?.toISOString() ?? null,
      },
    };
  }
}

function getRegistrationAvailability({
  status,
  scheduledAt,
  registrationDeadlineAt,
  teamCount,
  confirmedCount,
  pendingPaymentCount,
}: {
  status: string;
  scheduledAt: Date | null;
  registrationDeadlineAt: Date | null;
  teamCount: number;
  confirmedCount: number;
  pendingPaymentCount: number;
}): RegistrationAvailability {
  if (status !== 'open') return 'closed';

  const now = Date.now();
  if (scheduledAt && scheduledAt.getTime() <= now) return 'started';
  if (registrationDeadlineAt && registrationDeadlineAt.getTime() <= now) {
    return 'deadline_passed';
  }
  if (confirmedCount + pendingPaymentCount >= teamCount) return 'full';
  return 'available';
}
