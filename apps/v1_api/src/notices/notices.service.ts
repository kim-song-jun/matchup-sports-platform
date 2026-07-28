import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { NoticesQueryDto } from './dto/notices-query.dto';

@Injectable()
export class NoticesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: NoticesQueryDto = {}) {
    const notices = await this.prisma.v1Notice.findMany({
      where: {
        status: 'published',
        audience: 'public',
        category: query.category ?? { not: '고정' },
      },
      orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
      take: 20,
      select: {
        id: true,
        audience: true,
        category: true,
        title: true,
        body: true,
        contentJson: true,
        contentVersion: true,
        publishedAt: true,
      },
    });

    return {
      notices: notices.map((notice) => ({
        noticeId: notice.id,
        audience: notice.audience,
        category: notice.category,
        title: notice.title,
        body: notice.body,
        content: notice.contentJson,
        contentVersion: notice.contentVersion,
        publishedAt: notice.publishedAt,
      })),
      pageInfo: {
        hasNextPage: false,
        nextCursor: null,
      },
    };
  }

  async detail(noticeId: string) {
    const notice = await this.prisma.v1Notice.findFirst({
      where: {
        id: noticeId,
        status: 'published',
        audience: 'public',
        category: { not: '고정' },
      },
      select: {
        id: true,
        audience: true,
        category: true,
        title: true,
        body: true,
        contentJson: true,
        contentVersion: true,
        publishedAt: true,
      },
    });

    if (!notice) {
      throw new NotFoundException('Notice not found');
    }

    return {
      notice: {
        noticeId: notice.id,
        audience: notice.audience,
        category: notice.category,
        title: notice.title,
        body: notice.body,
        content: notice.contentJson,
        contentVersion: notice.contentVersion,
        publishedAt: notice.publishedAt,
      },
    };
  }
}
