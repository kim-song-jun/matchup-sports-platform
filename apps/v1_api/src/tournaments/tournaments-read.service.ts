import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TournamentListQueryDto } from './dto/tournament-read.dto';

/** draft/cancelled는 소비자 노출 제외. */
const PUBLIC_STATUSES: Prisma.V1TournamentWhereInput['status'] = {
  in: ['open', 'closed', 'in_progress', 'completed'],
};

@Injectable()
export class TournamentsReadService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 공개 대회 목록.
   * - deletedAt=null + status in (open/closed/in_progress/completed)
   * - 각 카드에 confirmedCount(status=confirmed registration 수) 포함
   * - cursor 페이지네이션(createdAt desc → id 기준)
   */
  async list(query: TournamentListQueryDto) {
    const limit = query.limit ?? 20;

    const where: Prisma.V1TournamentWhereInput = {
      deletedAt: null,
      status: query.status ? query.status : PUBLIC_STATUSES,
      ...(query.sportId ? { sportId: query.sportId } : {}),
    };

    const rows = await this.prisma.v1Tournament.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      include: {
        sport: { select: { code: true, name: true } },
        _count: {
          select: {
            registrations: {
              where: { status: 'confirmed' },
            },
          },
        },
        registrations: {
          where: { status: { in: ['awaiting_payment', 'payment_checking', 'paid'] } },
          select: { status: true },
        },
      },
    });

    const hasNext = rows.length > limit;
    const pageItems = hasNext ? rows.slice(0, limit) : rows;

    return {
      items: pageItems.map((row) =>
        this.serializeCard(row, row._count.registrations, row.registrations.length),
      ),
      pageInfo: {
        nextCursor: hasNext ? (pageItems.at(-1)?.id ?? null) : null,
        hasNext,
      },
    };
  }

  /**
   * 공개 대회 상세.
   * - draft/cancelled는 404(소비자에게 노출 안 함).
   * - groups(+groupTeams 팀명), fixtures(+home/away 팀명, result), standings(position 정렬), announcements(publishedAt!=null) 포함.
   */
  async get(tournamentId: string) {
    const row = await this.prisma.v1Tournament.findFirst({
      where: { id: tournamentId, deletedAt: null, status: PUBLIC_STATUSES },
      include: {
        sport: { select: { code: true, name: true } },
        groups: {
          orderBy: [{ phase: 'asc' }, { sortOrder: 'asc' }],
          include: {
            groupTeams: {
              orderBy: { sortOrder: 'asc' },
              include: {
                registration: {
                  include: { team: { select: { id: true, name: true } } },
                },
              },
            },
            standings: {
              orderBy: { position: 'asc' },
              include: {
                registration: {
                  include: { team: { select: { id: true, name: true } } },
                },
              },
            },
          },
        },
        fixtures: {
          orderBy: [{ round: 'asc' }, { fixtureNumber: 'asc' }],
          include: {
            homeRegistration: {
              include: { team: { select: { id: true, name: true } } },
            },
            awayRegistration: {
              include: { team: { select: { id: true, name: true } } },
            },
            result: true,
            videos: { orderBy: { sortOrder: 'asc' } },
          },
        },
        announcements: {
          where: { audience: 'public', publishedAt: { not: null } },
          orderBy: { publishedAt: 'desc' },
        },
        sponsors: {
          where: { isActive: true },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        },
        registrations: {
          where: {
            status: { in: ['confirmed', 'waitlisted', 'awaiting_payment', 'payment_checking', 'paid'] },
          },
          include: {
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
          select: {
            registrations: {
              where: { status: 'confirmed' },
            },
          },
        },
        reviews: {
          where: { hiddenAt: null },
          orderBy: { createdAt: 'desc' as const },
          take: 30,
          include: {
            author: { select: { id: true, profile: { select: { nickname: true, profileImageUrl: true } } } },
          },
        },
        awards: {
          orderBy: [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }],
        },
      },
    });

    if (!row) {
      throw new NotFoundException({
        code: 'TOURNAMENT_NOT_FOUND',
        message: '대회를 찾을 수 없어요.',
      });
    }

    return {
      id: row.id,
      sportId: row.sportId,
      sport: { code: row.sport.code, name: row.sport.name },
      title: row.title,
      status: row.status,
      format: row.format,
      registrationDeadlineAt: row.registrationDeadlineAt?.toISOString() ?? null,
      rosterDeadlineAt: row.rosterDeadlineAt?.toISOString() ?? null,
      scheduledAt: row.scheduledAt?.toISOString() ?? null,
      scheduledEndAt: row.scheduledEndAt?.toISOString() ?? null,
      venue: row.venue,
      latitude: row.latitude,
      longitude: row.longitude,
      teamCount: row.teamCount,
      minPlayers: row.minPlayers,
      maxPlayers: row.maxPlayers,
      genderCategory: row.genderCategory,
      genderMinMale: row.genderMinMale,
      genderMaxMale: row.genderMaxMale,
      genderMinFemale: row.genderMinFemale,
      genderMaxFemale: row.genderMaxFemale,
      entryFee: row.entryFee,
      // 계좌이체 신청자에게 입금 계좌 안내가 필요하므로 공개 상세에 포함(주최자 수령 계좌).
      bankName: row.bankName,
      bankAccount: row.bankAccount,
      bankHolder: row.bankHolder,
      rulesText: row.rulesText,
      refundPolicyText: row.refundPolicyText,
      prizePool: row.prizePool,
      prizeSummary: row.prizeSummary,
      prizeBreakdown: row.prizeBreakdown,
      promoHomeEnabled: row.promoHomeEnabled,
      promoHomeTitle: row.promoHomeTitle,
      promoHomeSubtitle: row.promoHomeSubtitle,
      promoHomeImageUrl: row.promoHomeImageUrl,
      promoHomeBadgeText: row.promoHomeBadgeText,
      promoHomeDateText: row.promoHomeDateText,
      promoHomeTeamsText: row.promoHomeTeamsText,
      promoHomeLocationText: row.promoHomeLocationText,
      promoHomePrizeText: row.promoHomePrizeText,
      promoHomePriority: row.promoHomePriority,
      promoListEnabled: row.promoListEnabled,
      promoListTitle: row.promoListTitle,
      promoListSubtitle: row.promoListSubtitle,
      promoListImageUrl: row.promoListImageUrl,
      promoListBadgeText: row.promoListBadgeText,
      promoListDateText: row.promoListDateText,
      promoListTeamsText: row.promoListTeamsText,
      promoListLocationText: row.promoListLocationText,
      promoListPrizeText: row.promoListPrizeText,
      promoListPriority: row.promoListPriority,
      confirmedCount: row._count.registrations,
      participantTeams: row.registrations
        .filter((registration) => ['confirmed', 'waitlisted'].includes(registration.status))
        .sort((a, b) => {
          const aRank = a.status === 'confirmed' ? 0 : 1;
          const bRank = b.status === 'confirmed' ? 0 : 1;
          return aRank - bRank;
        })
        .map((registration) => ({
          registrationId: registration.id,
          teamId: registration.team.id,
          teamName: registration.team.name,
          teamLogoUrl: registration.team.profile?.logoUrl ?? null,
          teamRegionName: registration.team.region?.name ?? null,
          status: registration.status,
          confirmedAt: registration.confirmedAt?.toISOString() ?? null,
        })),
      pendingPaymentCount: row.registrations.filter((registration) =>
        ['awaiting_payment', 'payment_checking', 'paid'].includes(registration.status),
      ).length,
      groups: row.groups.map((g) => ({
        id: g.id,
        name: g.name,
        phase: g.phase,
        sortOrder: g.sortOrder,
        advanceCount: g.advanceCount,
        groupTeams: g.groupTeams.map((gt) => ({
          id: gt.id,
          registrationId: gt.registrationId,
          teamId: gt.registration.team.id,
          teamName: gt.registration.team.name,
          sortOrder: gt.sortOrder,
        })),
        standings: g.standings.map((s) => ({
          registrationId: s.registrationId,
          teamId: s.registration.team.id,
          teamName: s.registration.team.name,
          position: s.position,
          points: s.points,
          wins: s.wins,
          draws: s.draws,
          losses: s.losses,
          goalsFor: s.goalsFor,
          goalsAgainst: s.goalsAgainst,
          recalculatedAt: s.recalculatedAt?.toISOString() ?? null,
        })),
      })),
      fixtures: row.fixtures.map((f) => ({
        id: f.id,
        groupId: f.groupId,
        round: f.round,
        fixtureNumber: f.fixtureNumber,
        legNumber: f.legNumber,
        scheduledAt: f.scheduledAt?.toISOString() ?? null,
        venue: f.venue,
        status: f.status,
        homeRegistrationId: f.homeRegistrationId,
        homeTeamName: f.homeRegistration?.team.name ?? 'TBD',
        awayRegistrationId: f.awayRegistrationId,
        awayTeamName: f.awayRegistration?.team.name ?? 'TBD',
        result: f.result
          ? {
              homeScore: f.result.homeScore,
              awayScore: f.result.awayScore,
              hasPenalty: f.result.hasPenalty,
              homePenaltyScore: f.result.homePenaltyScore,
              awayPenaltyScore: f.result.awayPenaltyScore,
              note: f.result.note,
              recordedAt: f.result.recordedAt.toISOString(),
            }
          : null,
        videos: f.videos.map((v) => ({
          id: v.id,
          title: v.title,
          url: v.url,
        })),
      })),
      announcements: row.announcements.map((a) => ({
        id: a.id,
        title: a.title,
        body: a.body,
        category: a.category,
        audience: a.audience,
        publishedAt: a.publishedAt!.toISOString(),
        createdAt: a.createdAt.toISOString(),
      })),
      sponsors: row.sponsors.map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        logoUrl: s.logoUrl,
        websiteUrl: s.websiteUrl,
        instagramUrl: s.instagramUrl,
        benefitText: s.benefitText,
        boothText: s.boothText,
        eventTitle: s.eventTitle,
        eventDescription: s.eventDescription,
        eventResultText: s.eventResultText,
        sortOrder: s.sortOrder,
      })),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      reviews: (row.reviews ?? []).map((r) => ({
        id: r.id,
        authorId: r.authorUserId,
        authorNickname: (r.author as { profile?: { nickname?: string | null } | null } | null)?.profile?.nickname ?? '익명',
        authorProfileImageUrl: (r.author as { profile?: { profileImageUrl?: string | null } | null } | null)?.profile?.profileImageUrl ?? null,
        teamName: r.teamName ?? null,
        rating: r.rating,
        comment: r.comment ?? null,
        photoUrls: r.photoUrls,
        createdAt: r.createdAt.toISOString(),
      })),
      awards: (row.awards ?? []).map((a) => ({
        id: a.id,
        awardType: a.awardType,
        awardLabel: a.awardLabel,
        recipientName: a.recipientName,
        teamName: a.teamName ?? null,
        note: a.note ?? null,
      })),
    };
  }

  private serializeCard(
    row: {
      id: string;
      sportId: string;
      sport: { code: string; name: string };
      title: string;
      status: string;
      format: string;
      registrationDeadlineAt: Date | null;
      scheduledAt: Date | null;
      scheduledEndAt: Date | null;
      venue: string | null;
      coverImageUrl: string | null;
      teamCount: number;
      entryFee: number;
      prizePool: number | null;
      prizeSummary: string | null;
      prizeBreakdown: string | null;
      promoHomeEnabled: boolean;
      promoHomeTitle: string | null;
      promoHomeSubtitle: string | null;
      promoHomeImageUrl: string | null;
      promoHomeBadgeText: string | null;
      promoHomeDateText: string | null;
      promoHomeTeamsText: string | null;
      promoHomeLocationText: string | null;
      promoHomePrizeText: string | null;
      promoHomePriority: number;
      promoListEnabled: boolean;
      promoListTitle: string | null;
      promoListSubtitle: string | null;
      promoListImageUrl: string | null;
      promoListBadgeText: string | null;
      promoListDateText: string | null;
      promoListTeamsText: string | null;
      promoListLocationText: string | null;
      promoListPrizeText: string | null;
      promoListPriority: number;
      createdAt: Date;
      updatedAt: Date;
      registrations: Array<{ status: string }>;
    },
    confirmedCount: number,
    pendingPaymentCount: number,
  ) {
    return {
      id: row.id,
      sportId: row.sportId,
      sport: { code: row.sport.code, name: row.sport.name },
      title: row.title,
      status: row.status,
      format: row.format,
      registrationDeadlineAt: row.registrationDeadlineAt?.toISOString() ?? null,
      scheduledAt: row.scheduledAt?.toISOString() ?? null,
      scheduledEndAt: row.scheduledEndAt?.toISOString() ?? null,
      venue: row.venue,
      coverImageUrl: row.coverImageUrl,
      teamCount: row.teamCount,
      entryFee: row.entryFee,
      prizePool: row.prizePool,
      prizeSummary: row.prizeSummary,
      prizeBreakdown: row.prizeBreakdown,
      promoHomeEnabled: row.promoHomeEnabled,
      promoHomeTitle: row.promoHomeTitle,
      promoHomeSubtitle: row.promoHomeSubtitle,
      promoHomeImageUrl: row.promoHomeImageUrl,
      promoHomeBadgeText: row.promoHomeBadgeText,
      promoHomeDateText: row.promoHomeDateText,
      promoHomeTeamsText: row.promoHomeTeamsText,
      promoHomeLocationText: row.promoHomeLocationText,
      promoHomePrizeText: row.promoHomePrizeText,
      promoHomePriority: row.promoHomePriority,
      promoListEnabled: row.promoListEnabled,
      promoListTitle: row.promoListTitle,
      promoListSubtitle: row.promoListSubtitle,
      promoListImageUrl: row.promoListImageUrl,
      promoListBadgeText: row.promoListBadgeText,
      promoListDateText: row.promoListDateText,
      promoListTeamsText: row.promoListTeamsText,
      promoListLocationText: row.promoListLocationText,
      promoListPrizeText: row.promoListPrizeText,
      promoListPriority: row.promoListPriority,
      confirmedCount,
      pendingPaymentCount,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
