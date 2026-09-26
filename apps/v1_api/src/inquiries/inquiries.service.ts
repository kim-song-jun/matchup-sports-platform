import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { Prisma, V1Inquiry as V1InquiryRecord } from '@prisma/client';
import { V1AuthUser } from '../auth/v1-auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { readGuestInquiryRetention } from '../site-info/site-info-settings.service';
import { CreateInquiryDto, InquiriesQueryDto } from './dto/inquiries.dto';
import {
  CreatePublicInquiryDto,
  publicInquiryCategories,
  type PublicInquiryCategory,
  type PublicInquirySportType,
} from './dto/public-inquiry.dto';
import {
  INQUIRY_SLACK_NOTIFICATION_TYPE,
  type InquirySlackNotificationPayload,
} from './inquiry-slack-notifier';

/** 폼을 연 뒤 이보다 빨리 제출되면 사람이 아니라고 본다. */
export const PUBLIC_INQUIRY_MIN_FILL_MS = 3_000;
export const PUBLIC_INQUIRY_DUPLICATE_WINDOW_MS = 24 * 60 * 60 * 1000;

const PUBLIC_CATEGORY_TITLES: Record<PublicInquiryCategory, string> = {
  tournament_hosting: '대회 개설 문의',
  partnership: '제휴 문의',
};

const PUBLIC_SPORT_LABELS: Record<PublicInquirySportType, string> = {
  soccer: '축구',
  futsal: '풋살',
  other: '기타',
};

// 본문 = 서버가 만든 정형 머리말 + 이 구분선 + 사용자 메시지. 중복 판정이 구분선 뒤를 메시지로 읽는다.
const PUBLIC_MESSAGE_SEPARATOR = '\n--- 문의 내용 ---\n';

@Injectable()
export class InquiriesService {
  private readonly logger = new Logger(InquiriesService.name);

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

    const inquiry = await this.createWithSlackOutbox({
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
    });

    return serializeInquiry(inquiry);
  }

  /**
   * 비회원 공개 문의. 봇 판정으로 폐기해도 저장과 같은 응답을 준다. 같은 이메일·같은 본문의
   * 24시간 내 재제출만 409 로 알린다. 제출값은 되돌려주지 않는다.
   */
  async createPublic(dto: CreatePublicInquiryDto, clientIp: string | undefined) {
    const received = { received: true } as const;
    const clientIpHash = hashClientIp(clientIp);
    // 봇 판정은 오류가 아니라 조용한 폐기다 — 거절 신호를 주면 봇이 폼을 학습한다(의도된 설계).
    // 두 판정 모두 클라이언트 값만 보므로 순진한 봇만 거른다. 실제 상한은 컨트롤러의 IP 스로틀이다.
    if (dto.website?.trim()) {
      this.logger.warn({ reason: 'honeypot', category: dto.category, clientIpHash }, 'Public inquiry discarded');
      return received;
    }
    const elapsedMs = Date.now() - dto.formStartedAt;
    // 음수(클라이언트 시계가 빠름)는 판정 불가라 통과시킨다 — 사람의 문의를 조용히 잃는 쪽이 더 나쁘다.
    if (elapsedMs >= 0 && elapsedMs < PUBLIC_INQUIRY_MIN_FILL_MS) {
      this.logger.warn(
        { reason: 'too_fast', category: dto.category, elapsedMs, clientIpHash },
        'Public inquiry discarded',
      );
      return received;
    }

    const name = singleLine(dto.name);
    const email = dto.email.trim().toLowerCase();
    const message = dto.message.trim();
    if (!name || !message) {
      throw new BadRequestException({ code: 'INVALID_INQUIRY', message: '이름과 문의 내용을 입력해 주세요.' });
    }
    const organization = dto.organization ? singleLine(dto.organization) : '';

    const recent = await this.prisma.v1Inquiry.findMany({
      where: {
        userId: null,
        guestEmail: email,
        category: { in: [...publicInquiryCategories] },
        createdAt: { gte: new Date(Date.now() - PUBLIC_INQUIRY_DUPLICATE_WINDOW_MS) },
      },
      select: { body: true },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    if (recent.some((row) => publicMessageOf(row.body) === message)) {
      throw new ConflictException({
        code: 'INQUIRY_DUPLICATE',
        message: '같은 내용의 문의가 이미 접수됐어요. 답변을 기다려 주세요.',
      });
    }

    // 보관 기간은 어드민이 바꿀 수 있어, 제출 시점 값을 함께 남겨야 무엇에 동의했는지 남는다.
    const retention = await readGuestInquiryRetention(this.prisma);
    const header = [
      organization && `단체명: ${organization}`,
      `담당자: ${name}`,
      dto.sportType && `종목: ${PUBLIC_SPORT_LABELS[dto.sportType]}`,
      dto.expectedSchedule && `희망 시기: ${singleLine(dto.expectedSchedule)}`,
      `개인정보 수집·이용 동의: 동의함 (보관 기간: ${singleLine(retention)})`,
    ].filter(Boolean);

    await this.createWithSlackOutbox(
      {
        userId: null,
        guestEmail: email,
        guestPhone: null,
        category: dto.category,
        title: `${PUBLIC_CATEGORY_TITLES[dto.category]} · ${organization || name}`.slice(0, 80),
        body: `${header.join('\n')}${PUBLIC_MESSAGE_SEPARATOR}${message}`,
        contact: null,
        relatedType: null,
        relatedId: null,
        reportReason: null,
        reportedTeamId: null,
      },
      // Slack 은 동의받은 이용 목적 밖의 제3자다 — 비회원 입력은 싣지 않고 분류만 보낸다.
      `${PUBLIC_CATEGORY_TITLES[dto.category]} (비회원)`,
    );
    return received;
  }

  private async createWithSlackOutbox(data: Prisma.V1InquiryUncheckedCreateInput, slackTitle?: string) {
    return this.prisma.$transaction(async (tx) => {
      const created = await tx.v1Inquiry.create({ data });
      const slackPayload: InquirySlackNotificationPayload = {
        inquiryId: created.id,
        category: created.category,
        title: slackTitle ?? created.title,
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

/** 줄바꿈을 없애 머리말 한 줄에 가둔다 — 구분선을 흉내 내 메시지 경계를 흐리지 못하게. */
function singleLine(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function publicMessageOf(body: string): string | null {
  const at = body.indexOf(PUBLIC_MESSAGE_SEPARATOR);
  return at === -1 ? null : body.slice(at + PUBLIC_MESSAGE_SEPARATOR.length);
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

function hashClientIp(clientIp: string | undefined): string | null {
  return clientIp ? createHash('sha256').update(clientIp).digest('hex').slice(0, 12) : null;
}
