import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class LessonsService {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id },
      include: {
        host: {
          select: {
            id: true,
            nickname: true,
            profileImageUrl: true,
            mannerScore: true,
          },
        },
      },
    });
    if (!lesson) {
      throw new NotFoundException('강좌를 찾을 수 없습니다.');
    }
    return lesson;
  }

  async findAll(filter: { sportType?: string; type?: string; cursor?: string }) {
    const limit = 20;
    const where: Record<string, unknown> = { status: 'open' };
    if (filter.sportType) where.sportType = filter.sportType;
    if (filter.type) where.type = filter.type;

    const items = await this.prisma.lesson.findMany({
      where,
      include: {
        host: { select: { id: true, nickname: true, profileImageUrl: true } },
      },
      orderBy: { lessonDate: 'asc' },
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

  async create(hostId: string, data: Record<string, unknown>) {
    return this.prisma.lesson.create({
      data: {
        hostId,
        sportType: data.sportType as never,
        type: data.type as never,
        title: data.title as string,
        description: data.description as string | undefined,
        venueName: data.venueName as string | undefined,
        venueId: data.venueId as string | undefined,
        lessonDate: new Date(data.lessonDate as string),
        startTime: data.startTime as string,
        endTime: data.endTime as string,
        maxParticipants: data.maxParticipants as number,
        fee: (data.fee as number) || 0,
        levelMin: (data.levelMin as number) || 1,
        levelMax: (data.levelMax as number) || 5,
        coachName: data.coachName as string | undefined,
        coachBio: data.coachBio as string | undefined,
        imageUrls: (data.imageUrls as string[]) || [],
      },
    });
  }
}
