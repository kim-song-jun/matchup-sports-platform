import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, TeamRole, TournamentStatus } from '@prisma/client';
import { TeamMembershipService } from '../teams/team-membership.service';
import { CreateTournamentDto } from './dto/create-tournament.dto';
import { TournamentQueryDto } from './dto/tournament-query.dto';

@Injectable()
export class TournamentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly teamMembershipService: TeamMembershipService,
  ) {}

  async findAll(query: TournamentQueryDto) {
    const limit = Math.min(Math.max(1, query.limit ?? 20), 100);
    const where: Prisma.TournamentWhereInput = {};
    if (query.sportType) where.sportType = query.sportType;
    if (query.status) {
      where.status = query.status;
    } else {
      where.status = { in: ['recruiting', 'full', 'ongoing'] };
    }
    if (query.teamId) where.teamId = query.teamId;
    if (query.venueId) where.venueId = query.venueId;

    const items = await this.prisma.tournament.findMany({
      where,
      include: {
        organizer: {
          select: { id: true, nickname: true, profileImageUrl: true },
        },
        team: {
          select: { id: true, name: true, sportType: true, logoUrl: true },
        },
        venue: {
          select: { id: true, name: true, city: true, district: true, address: true },
        },
      },
      orderBy: [{ startDate: 'asc' }, { createdAt: 'desc' }],
      take: limit + 1,
      ...(query.cursor && { cursor: { id: query.cursor }, skip: 1 }),
    });

    const hasNext = items.length > limit;
    const result = hasNext ? items.slice(0, limit) : items;

    return {
      items: result.map((item) => this.toReadModel(item)),
      nextCursor: hasNext ? result[result.length - 1].id : null,
    };
  }

  async findById(id: string) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id },
      include: {
        organizer: {
          select: { id: true, nickname: true, profileImageUrl: true },
        },
        team: {
          select: { id: true, name: true, sportType: true, logoUrl: true },
        },
        venue: {
          select: { id: true, name: true, city: true, district: true, address: true },
        },
      },
    });

    if (!tournament) {
      throw new NotFoundException('대회를 찾을 수 없습니다.');
    }

    return this.toReadModel(tournament);
  }

  async create(userId: string, userRole: string, data: CreateTournamentDto) {
    this.assertSingleAffiliation(data.teamId, data.venueId);
    this.assertDateRange(data.startDate, data.endDate);
    await this.assertAffiliationWriteAccess(userId, userRole, data.teamId, data.venueId);

    const tournament = await this.prisma.tournament.create({
      data: {
        organizerId: userId,
        teamId: data.teamId,
        venueId: data.venueId,
        sportType: data.sportType,
        title: data.title,
        description: data.description,
        startDate: new Date(data.startDate),
        endDate: new Date(data.endDate),
        entryFee: data.entryFee ?? 0,
        maxParticipants: data.maxParticipants,
        status: TournamentStatus.recruiting,
      },
      include: {
        organizer: {
          select: { id: true, nickname: true, profileImageUrl: true },
        },
        team: {
          select: { id: true, name: true, sportType: true, logoUrl: true },
        },
        venue: {
          select: { id: true, name: true, city: true, district: true, address: true },
        },
      },
    });

    return this.toReadModel(tournament);
  }

  private assertDateRange(startDate: string, endDate: string) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new BadRequestException('유효하지 않은 날짜 형식입니다.');
    }
    if (end < start) {
      throw new BadRequestException('종료일은 시작일보다 빠를 수 없습니다.');
    }
  }

  private assertSingleAffiliation(teamId?: string, venueId?: string) {
    if (teamId && venueId) {
      throw new BadRequestException('팀과 장소 소속을 동시에 지정할 수 없습니다.');
    }
  }

  private async assertAffiliationWriteAccess(
    userId: string,
    userRole: string,
    teamId?: string,
    venueId?: string,
  ) {
    if (teamId) {
      await this.teamMembershipService.assertRole(teamId, userId, TeamRole.manager);
      return;
    }

    if (!venueId) return;
    if (userRole === 'admin') return;

    const venue = await this.prisma.venue.findUnique({
      where: { id: venueId },
      select: { id: true, ownerId: true },
    });
    if (!venue) {
      throw new NotFoundException('시설을 찾을 수 없습니다.');
    }
    if (!venue.ownerId || venue.ownerId !== userId) {
      throw new ForbiddenException('해당 시설 소속 대회를 생성할 권한이 없습니다.');
    }
  }

  private toReadModel<
    T extends {
      startDate: Date;
      venue?: { id: string; name: string } | null;
    },
  >(tournament: T) {
    return {
      ...tournament,
      eventDate: tournament.startDate,
      venueName: tournament.venue?.name ?? null,
    };
  }
}
