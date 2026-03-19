import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TeamsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(filter: { sportType?: string; city?: string; recruiting?: string; cursor?: string }) {
    const limit = 20;
    const where: Record<string, unknown> = {};
    if (filter.sportType) where.sportType = filter.sportType;
    if (filter.city) where.city = filter.city;
    if (filter.recruiting === 'true') where.isRecruiting = true;

    const items = await this.prisma.sportTeam.findMany({
      where,
      include: {
        owner: {
          select: { id: true, nickname: true, profileImageUrl: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(filter.cursor && { cursor: { id: filter.cursor }, skip: 1 }),
    });

    const hasNext = items.length > limit;
    const result = hasNext ? items.slice(0, limit) : items;
    return {
      items: result,
      nextCursor: hasNext ? result[result.length - 1].id : null,
    };
  }

  async findById(id: string) {
    const team = await this.prisma.sportTeam.findUnique({
      where: { id },
      include: {
        owner: {
          select: {
            id: true,
            nickname: true,
            profileImageUrl: true,
            mannerScore: true,
          },
        },
      },
    });
    if (!team) {
      throw new NotFoundException('팀을 찾을 수 없습니다.');
    }
    return team;
  }

  async create(ownerId: string, data: Record<string, unknown>) {
    return this.prisma.sportTeam.create({
      data: {
        ownerId,
        name: data.name as string,
        sportType: data.sportType as never,
        description: data.description as string | undefined,
        logoUrl: data.logoUrl as string | undefined,
        coverImageUrl: data.coverImageUrl as string | undefined,
        city: data.city as string | undefined,
        district: data.district as string | undefined,
        memberCount: (data.memberCount as number) || 1,
        level: (data.level as number) || 3,
        isRecruiting: data.isRecruiting !== false,
        contactInfo: data.contactInfo as string | undefined,
      },
    });
  }
}
