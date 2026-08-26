import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { V1Inquiry as V1InquiryRecord } from '@prisma/client';
import { V1AuthUser } from '../auth/v1-auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInquiryDto, InquiriesQueryDto } from './dto/inquiries.dto';
import {
  INQUIRY_SLACK_NOTIFICATION_TYPE,
  type InquirySlackNotificationPayload,
} from './inquiry-slack-notifier';

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

  async create(user: V1AuthUser, dto: CreateInquiryDto) {
    const title = dto.title.trim();
    const body = dto.body.trim();
    const contact = dto.contact?.trim();
    const relatedId = dto.relatedId?.trim();
    if (!title || !body) {
      throw new BadRequestException({ code: 'INVALID_INQUIRY', message: 'Title and body are required' });
    }
    if (dto.relatedType && !relatedId) {
      throw new BadRequestException({ code: 'INVALID_INQUIRY_RELATED_TARGET', message: 'relatedId is required when relatedType is provided' });
    }
    if (!dto.relatedType && relatedId) {
      throw new BadRequestException({ code: 'INVALID_INQUIRY_RELATED_TARGET', message: 'relatedType is required when relatedId is provided' });
    }
    if (dto.reportReason && dto.category !== 'report') {
      // 이 파일의 다른 메시지는 영어지만 이건 한국어다 — 프론트의 extractErrorMessage 가
      // 서버 message 를 fallback 보다 **먼저** 반환하므로(error-message.ts), 영어로 두면
      // 한국어 사용자에게 그대로 노출된다. 주변 관례보다 사용자 대면 문구 규칙이 우선한다.
      throw new BadRequestException({
        code: 'INVALID_INQUIRY_REPORT_REASON',
        message: '신고 사유는 신고하기에서만 보낼 수 있어요.',
      });
    }
    // 신고 대상 팀을 신고 시점에 확정한다. 조회 때 추론하면 신고자가 팀을 옮겼을 때 답이 달라진다.
    // 대상을 못 정해도 신고 접수는 실패시키지 않는다 — 신고를 막는 것보다 대상 미상으로 받는 편이 낫다.
    // 부수 효과로 권한 검사가 된다: 남의 컨택 id 를 넣어도 신고자가 그 컨택의 어느 팀에도 속하지
    // 않으면 대상이 null 이 되어 그 팀에 신고가 누적되지 않는다.
    const reportedTeamId = await this.resolveReportedTeamId(user.id, dto);

    const inquiry = await this.prisma.$transaction(async (tx) => {
      const created = await tx.v1Inquiry.create({
        data: {
          userId: user.id,
          guestEmail: null,
          guestPhone: null,
          category: dto.category,
          title,
          body,
          contact: contact || null,
          relatedType: dto.relatedType ?? null,
          relatedId: relatedId || null,
          reportReason: dto.reportReason ?? null,
          reportedTeamId,
        },
      });
      const slackPayload: InquirySlackNotificationPayload = {
        inquiryId: created.id,
        category: created.category,
        title: created.title,
        relatedType: created.relatedType,
        relatedId: created.relatedId,
        createdAt: created.createdAt.toISOString(),
      };
      await tx.v1OutboxEvent.create({
        data: {
          businessKey: `inquiry:${created.id}:slack-created`,
          aggregateType: 'INQUIRY',
          aggregateId: created.id,
          type: INQUIRY_SLACK_NOTIFICATION_TYPE,
          payload: slackPayload,
        },
      });
      return created;
    });

    return serializeInquiry(inquiry);
  }

  private async resolveReportedTeamId(userId: string, dto: CreateInquiryDto): Promise<string | null> {
    if (dto.category !== 'report' || dto.relatedType !== 'team_contact' || !dto.relatedId) return null;

    const contact = await this.prisma.v1TeamContact.findUnique({
      where: { id: dto.relatedId.trim() },
      select: { fromTeamId: true, toTeamId: true },
    });
    if (!contact) return null;

    const isMemberOf = async (teamId: string) =>
      Boolean(
        await this.prisma.v1TeamMembership.findFirst({
          where: { teamId, userId, status: 'active' },
          select: { id: true },
        }),
      );

    if (await isMemberOf(contact.fromTeamId)) return contact.toTeamId;
    if (await isMemberOf(contact.toTeamId)) return contact.fromTeamId;
    return null;
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
    reportReason: inquiry.reportReason,
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
