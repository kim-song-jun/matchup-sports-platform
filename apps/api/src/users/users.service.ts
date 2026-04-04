import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateProfileDto } from './dto/update-profile.dto';

// Fields that must never be exposed in API responses
const SAFE_USER_SELECT = {
  id: true,
  email: true,
  nickname: true,
  role: true,
  profileImageUrl: true,
  phone: true,
  gender: true,
  birthYear: true,
  bio: true,
  sportTypes: true,
  locationCity: true,
  locationDistrict: true,
  mannerScore: true,
  totalMatches: true,
  createdAt: true,
  updatedAt: true,
  sportProfiles: true,
} as const;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: {
        ...SAFE_USER_SELECT,
        sportProfiles: true,
      },
    });

    if (!user) {
      throw new NotFoundException('사용자를 찾을 수 없습니다.');
    }

    return user;
  }

  async getPublicProfile(id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        nickname: true,
        profileImageUrl: true,
        gender: true,
        mannerScore: true,
        totalMatches: true,
        sportProfiles: true,
      },
    });

    if (!user) {
      throw new NotFoundException('사용자를 찾을 수 없습니다.');
    }

    return user;
  }

  async update(id: string, dto: UpdateProfileDto) {
    return this.prisma.user.update({
      where: { id },
      data: dto,
      select: {
        ...SAFE_USER_SELECT,
        sportProfiles: true,
      },
    });
  }

  async getMatchHistory(
    userId: string,
    options: { status?: string; cursor?: string; limit?: number },
  ) {
    const limit = options.limit || 20;

    const participants = await this.prisma.matchParticipant.findMany({
      where: {
        userId,
        ...(options.status && {
          match: { status: options.status as never },
        }),
      },
      include: {
        match: {
          include: {
            venue: { select: { id: true, name: true, city: true } },
            host: {
              select: { id: true, nickname: true, profileImageUrl: true },
            },
          },
        },
      },
      orderBy: { joinedAt: 'desc' },
      take: limit + 1,
      ...(options.cursor && {
        cursor: { id: options.cursor },
        skip: 1,
      }),
    });

    const hasNext = participants.length > limit;
    const items = hasNext ? participants.slice(0, limit) : participants;

    return {
      items: items.map((p) => p.match),
      nextCursor: hasNext ? items[items.length - 1].id : null,
    };
  }
}
