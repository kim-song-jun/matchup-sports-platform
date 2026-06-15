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
      },
    });

    const hasNext = rows.length > limit;
    const pageItems = hasNext ? rows.slice(0, limit) : rows;

    return {
      items: pageItems.map((row) =>
        this.serializeCard(row, row._count.registrations),
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
          },
        },
        announcements: {
          where: { publishedAt: { not: null } },
          orderBy: { publishedAt: 'desc' },
        },
        _count: {
          select: {
            registrations: {
              where: { status: 'confirmed' },
            },
          },
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
      scheduledAt: row.scheduledAt?.toISOString() ?? null,
      venue: row.venue,
      teamCount: row.teamCount,
      minPlayers: row.minPlayers,
      maxPlayers: row.maxPlayers,
      entryFee: row.entryFee,
      // 계좌이체 신청자에게 입금 계좌 안내가 필요하므로 공개 상세에 포함(주최자 수령 계좌).
      bankName: row.bankName,
      bankAccount: row.bankAccount,
      bankHolder: row.bankHolder,
      rulesText: row.rulesText,
      refundPolicyText: row.refundPolicyText,
      prizePool: row.prizePool,
      prizeBreakdown: row.prizeBreakdown,
      confirmedCount: row._count.registrations,
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
      })),
      announcements: row.announcements.map((a) => ({
        id: a.id,
        title: a.title,
        body: a.body,
        audience: a.audience,
        publishedAt: a.publishedAt!.toISOString(),
        createdAt: a.createdAt.toISOString(),
      })),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
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
      venue: string | null;
      teamCount: number;
      entryFee: number;
      prizePool: number | null;
      prizeBreakdown: string | null;
      createdAt: Date;
      updatedAt: Date;
    },
    confirmedCount: number,
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
      venue: row.venue,
      teamCount: row.teamCount,
      entryFee: row.entryFee,
      prizePool: row.prizePool,
      prizeBreakdown: row.prizeBreakdown,
      confirmedCount,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
