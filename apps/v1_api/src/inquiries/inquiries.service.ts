import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { V1Inquiry as V1InquiryRecord } from '@prisma/client';
import { V1AuthUser } from '../auth/v1-auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInquiryDto, InquiriesQueryDto } from './dto/inquiries.dto';

@Injectable()
export class InquiriesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(user: V1AuthUser, query: InquiriesQueryDto) {
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 50);
    const items = await this.prisma.v1Inquiry.findMany({
      where: { userId: user.id },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const pageItems = items.slice(0, limit);
    const hasNext = items.length > limit;

    return {
      items: pageItems.map(serializeInquiry),
      pageInfo: {
        nextCursor: hasNext ? pageItems.at(-1)?.id ?? null : null,
        hasNext,
      },
    };
  }

  async create(user: V1AuthUser | undefined, dto: CreateInquiryDto) {
    const title = dto.title.trim();
    const body = dto.body.trim();
    const contact = dto.contact?.trim();
    const relatedId = dto.relatedId?.trim();
    const guestEmail = dto.guestEmail?.trim();
    const guestPhone = dto.guestPhone?.trim();
    if (!title || !body) {
      throw new BadRequestException({ code: 'INVALID_INQUIRY', message: 'Title and body are required' });
    }
    if (dto.relatedType && !relatedId) {
      throw new BadRequestException({ code: 'INVALID_INQUIRY_RELATED_TARGET', message: 'relatedId is required when relatedType is provided' });
    }
    if (!dto.relatedType && relatedId) {
      throw new BadRequestException({ code: 'INVALID_INQUIRY_RELATED_TARGET', message: 'relatedType is required when relatedId is provided' });
    }
    if (!user && !guestEmail && !guestPhone) {
      throw new BadRequestException({
        code: 'GUEST_CONTACT_REQUIRED',
        message: 'guestEmail or guestPhone is required when not logged in',
      });
    }

    const inquiry = await this.prisma.v1Inquiry.create({
      data: {
        userId: user?.id ?? null,
        guestEmail: user ? null : guestEmail || null,
        guestPhone: user ? null : guestPhone || null,
        category: dto.category,
        title,
        body,
        contact: contact || null,
        relatedType: dto.relatedType ?? null,
        relatedId: relatedId || null,
      },
    });

    return serializeInquiry(inquiry);
  }

  async detail(user: V1AuthUser, inquiryId: string) {
    const inquiry = await this.prisma.v1Inquiry.findUnique({
      where: { id: inquiryId },
      include: {
        replies: {
          orderBy: { createdAt: 'asc' },
          include: {
            adminUser: {
              select: {
                adminRole: true,
                user: { select: { email: true, profile: { select: { nickname: true, displayName: true } } } },
              },
            },
          },
        },
      },
    });
    if (!inquiry) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Inquiry was not found' });
    }
    if (inquiry.userId !== user.id) {
      throw new ForbiddenException({ code: 'PERMISSION_DENIED', message: 'Inquiry access is denied' });
    }

    return serializeInquiry(inquiry);
  }
}

function serializeInquiry(
  inquiry: V1InquiryRecord & {
    replies?: Array<{
      id: string;
      body: string;
      createdAt: Date;
      updatedAt: Date;
      adminUser: {
        adminRole: 'owner' | 'ops' | 'support';
        user: { email: string | null; profile: { nickname: string | null; displayName: string | null } | null };
      } | null;
    }>;
  },
) {
  const serialized = {
    inquiryId: inquiry.id,
    category: inquiry.category,
    title: inquiry.title,
    body: inquiry.body,
    contact: inquiry.contact,
    relatedType: inquiry.relatedType,
    relatedId: inquiry.relatedId,
    status: inquiry.status,
    createdAt: inquiry.createdAt,
    updatedAt: inquiry.updatedAt,
    closedAt: inquiry.closedAt,
  };
  if (!inquiry.replies) return serialized;
  return {
    ...serialized,
    replies: inquiry.replies.map((reply) => ({
      replyId: reply.id,
      adminName:
        reply.adminUser?.user.profile?.nickname ??
        reply.adminUser?.user.profile?.displayName ??
        reply.adminUser?.user.email ??
        null,
      adminRole: reply.adminUser?.adminRole ?? null,
      body: reply.body,
      createdAt: reply.createdAt,
      updatedAt: reply.updatedAt,
    })),
  };
}
