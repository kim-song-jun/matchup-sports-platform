import { Injectable, NotFoundException } from '@nestjs/common';
import { V1TournamentRegistration } from '@prisma/client';
import { AdminContextService } from '../common/admin-context.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { V1AuthUser } from '../auth/v1-auth-user';
import { CreateAnnouncementDto, UpdateAnnouncementDto } from './dto/tournament-read.dto';

/**
 * 공지 audience → 알림 수신 대상 신청 상태 매핑.
 * - confirmed_only: 확정된 팀만.
 * - waitlist: 대기 중인 팀만.
 * - all_registered / public: draft(미제출)·cancelled(취소)를 제외한 모든 활성 신청 팀.
 *   (public은 비로그인 방문자에게도 노출되는 더 넓은 공개 범위이지만, 알림은 어차피
 *   신청 테이블에 있는 사용자에게만 보내므로 all_registered와 동일 집합을 사용한다.)
 */
const ACTIVE_TOURNAMENT_REGISTRATION_STATUSES: V1TournamentRegistration['status'][] = [
  'awaiting_payment',
  'payment_checking',
  'paid',
  'confirmed',
  'waitlisted',
  'cancel_requested',
];

function registrationStatusesForAudience(
  audience: string,
): V1TournamentRegistration['status'][] {
  if (audience === 'confirmed_only') return ['confirmed'];
  if (audience === 'waitlist') return ['waitlisted'];
  return ACTIVE_TOURNAMENT_REGISTRATION_STATUSES;
}

@Injectable()
export class TournamentAnnouncementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly adminContext: AdminContextService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * 알림: 공지 audience에 부합하는 신청 팀의 appliedByUserId에게 발송.
   * 수신자 조회 실패를 포함해 전 과정이 실패해도 호출자의 트랜잭션에는 영향 없음(fire-and-forget).
   */
  private notifyAnnouncementPublished(tournamentId: string, title: string, audience: string) {
    const statuses = registrationStatusesForAudience(audience);
    this.notifications.emitToManyDeferred(
      async () => {
        const rows = await this.prisma.v1TournamentRegistration.findMany({
          where: { tournamentId, status: { in: statuses } },
          select: { appliedByUserId: true },
          distinct: ['appliedByUserId'],
        });
        return rows.map((row) => row.appliedByUserId);
      },
      'tournament_announcement_published',
      tournamentId,
      `"${title}" 공지를 확인해 보세요.`,
    );
  }

  /**
   * 어드민 공지 목록 조회.
   * 대회 소속 전체 공지(초안+공개)를 createdAt 내림차순으로 반환.
   * active admin이면 support 포함 조회 가능 (읽기 전용이므로 getMutationAdmin 불필요).
   */
  async listByTournament(user: V1AuthUser, tournamentId: string) {
    await this.adminContext.getActiveAdmin(user.id);

    const tournament = await this.prisma.v1Tournament.findFirst({
      where: { id: tournamentId },
    });
    if (!tournament) {
      throw new NotFoundException({
        code: 'TOURNAMENT_NOT_FOUND',
        message: '대회를 찾을 수 없어요.',
      });
    }

    const rows = await this.prisma.v1TournamentAnnouncement.findMany({
      where: { tournamentId },
      orderBy: { createdAt: 'desc' },
    });

    return { items: rows.map((r) => this.serialize(r)) };
  }

  /**
   * 어드민 공지 생성.
   * publish=true이면 publishedAt=now()로 즉시 공개. 기본은 draft(publishedAt=null).
   * 즉시 공개되면 audience에 부합하는 신청 팀에게 tournament_announcement_published 알림 발송.
   * logAdminAction으로 감사 기록.
   */
  async create(
    user: V1AuthUser,
    tournamentId: string,
    dto: CreateAnnouncementDto,
  ) {
    const admin = await this.adminContext.getMutationAdmin(user.id);

    // 대회 존재 확인 — deletedAt만 체크(모든 status 허용: draft 대회에도 공지 가능).
    const tournament = await this.prisma.v1Tournament.findFirst({
      where: { id: tournamentId, deletedAt: null },
    });
    if (!tournament) {
      throw new NotFoundException({
        code: 'TOURNAMENT_NOT_FOUND',
        message: '대회를 찾을 수 없어요.',
      });
    }

    const publishedAt = dto.publish ? new Date() : null;
    const audience = dto.audience ?? 'all_registered';
    const category = dto.category ?? 'general';

    const announcement = await this.prisma.$transaction(async (tx) => {
      const created = await tx.v1TournamentAnnouncement.create({
        data: {
          tournamentId,
          title: dto.title,
          body: dto.body,
          category,
          audience,
          publishedAt,
        },
      });
      await this.adminContext.logAdminAction(
        admin,
        {
          action: 'tournament_announcement.create',
          targetType: 'tournament_announcement',
          targetId: created.id,
          afterJson: {
            tournamentId,
            title: created.title,
            category: created.category,
            audience: created.audience,
            publishedAt: created.publishedAt?.toISOString() ?? null,
          },
        },
        tx,
      );
      return created;
    });

    if (announcement.publishedAt) {
      this.notifyAnnouncementPublished(tournamentId, announcement.title, announcement.audience);
    }

    return this.serialize(announcement);
  }

  /**
   * Admin announcement edit.
   * `publish=true` publishes a draft or keeps a published row published.
   * `publish=false` moves the row back to draft by clearing publishedAt.
   */
  async update(
    user: V1AuthUser,
    announcementId: string,
    dto: UpdateAnnouncementDto,
  ) {
    const admin = await this.adminContext.getMutationAdmin(user.id);

    const announcement = await this.prisma.v1TournamentAnnouncement.findUnique({
      where: { id: announcementId },
    });
    if (!announcement) {
      throw new NotFoundException({
        code: 'ANNOUNCEMENT_NOT_FOUND',
        message: '공지를 찾을 수 없어요.',
      });
    }

    const publishRequested = dto.publish ?? announcement.publishedAt !== null;
    const publishedAt = publishRequested
      ? announcement.publishedAt ?? new Date()
      : null;
    const audience = dto.audience ?? announcement.audience;
    // 이미 공개된 공지가 재저장(publishedAt 유지)되는 경우가 아니라, draft → 공개로
    // 새로 전환되는 경우에만 알림을 보낸다(중복 발송 금지).
    const newlyPublished = announcement.publishedAt === null && publishedAt !== null;

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.v1TournamentAnnouncement.update({
        where: { id: announcementId },
        data: {
          title: dto.title,
          body: dto.body,
          audience,
          publishedAt,
        },
      });
      await this.adminContext.logAdminAction(
        admin,
        {
          action: 'tournament_announcement.update',
          targetType: 'tournament_announcement',
          targetId: announcementId,
          beforeJson: {
            tournamentId: announcement.tournamentId,
            title: announcement.title,
            audience: announcement.audience,
            publishedAt: announcement.publishedAt?.toISOString() ?? null,
          },
          afterJson: {
            tournamentId: result.tournamentId,
            title: result.title,
            audience: result.audience,
            publishedAt: result.publishedAt?.toISOString() ?? null,
          },
        },
        tx,
      );
      return result;
    });

    if (newlyPublished) {
      this.notifyAnnouncementPublished(updated.tournamentId, updated.title, updated.audience);
    }

    return this.serialize(updated);
  }

  /**
   * 어드민 공지 즉시 공개.
   * 이미 publishedAt이 설정된 경우 멱등 응답(alreadyPublished:true).
   * logAdminAction으로 감사 기록.
   */
  async publish(user: V1AuthUser, announcementId: string) {
    const admin = await this.adminContext.getMutationAdmin(user.id);

    const announcement = await this.prisma.v1TournamentAnnouncement.findUnique({
      where: { id: announcementId },
    });
    if (!announcement) {
      throw new NotFoundException({
        code: 'ANNOUNCEMENT_NOT_FOUND',
        message: '공지를 찾을 수 없어요.',
      });
    }

    // 멱등: 이미 공개된 경우 재요청 허용.
    if (announcement.publishedAt !== null) {
      return { ...this.serialize(announcement), alreadyPublished: true };
    }

    const publishedAt = new Date();

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.v1TournamentAnnouncement.update({
        where: { id: announcementId },
        data: { publishedAt },
      });
      await this.adminContext.logAdminAction(
        admin,
        {
          action: 'tournament_announcement.publish',
          targetType: 'tournament_announcement',
          targetId: announcementId,
          beforeJson: { publishedAt: null },
          afterJson: { publishedAt: publishedAt.toISOString() },
        },
        tx,
      );
      return result;
    });

    this.notifyAnnouncementPublished(updated.tournamentId, updated.title, updated.audience);

    return { ...this.serialize(updated), alreadyPublished: false };
  }

  async remove(user: V1AuthUser, announcementId: string) {
    const admin = await this.adminContext.getMutationAdmin(user.id);

    const announcement = await this.prisma.v1TournamentAnnouncement.findUnique({
      where: { id: announcementId },
    });
    if (!announcement) {
      throw new NotFoundException({
        code: 'ANNOUNCEMENT_NOT_FOUND',
        message: '공지를 찾을 수 없어요.',
      });
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.v1TournamentAnnouncement.delete({
        where: { id: announcementId },
      });
      await this.adminContext.logAdminAction(
        admin,
        {
          action: 'tournament_announcement.delete',
          targetType: 'tournament_announcement',
          targetId: announcementId,
          beforeJson: {
            tournamentId: announcement.tournamentId,
            title: announcement.title,
            audience: announcement.audience,
            publishedAt: announcement.publishedAt?.toISOString() ?? null,
          },
        },
        tx,
      );
    });

    return {
      id: announcement.id,
      tournamentId: announcement.tournamentId,
      deleted: true,
    };
  }

  private serialize(row: {
    id: string;
    tournamentId: string;
    title: string;
    body: string;
    category: string;
    audience: string;
    publishedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: row.id,
      tournamentId: row.tournamentId,
      title: row.title,
      body: row.body,
      category: row.category,
      audience: row.audience,
      publishedAt: row.publishedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
