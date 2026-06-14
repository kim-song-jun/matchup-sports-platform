import { Injectable, NotFoundException } from '@nestjs/common';
import { AdminContextService } from '../common/admin-context.service';
import { PrismaService } from '../prisma/prisma.service';
import { V1AuthUser } from '../auth/v1-auth-user';
import { CreateAnnouncementDto } from './dto/tournament-read.dto';

@Injectable()
export class TournamentAnnouncementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly adminContext: AdminContextService,
  ) {}

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
        message: 'Tournament was not found',
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
   * audience는 현재 타겟 발송 메타로만 저장(실제 발송은 후속 task).
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
        message: 'Tournament was not found',
      });
    }

    const publishedAt = dto.publish ? new Date() : null;
    const audience = dto.audience ?? 'all_registered';

    const announcement = await this.prisma.$transaction(async (tx) => {
      const created = await tx.v1TournamentAnnouncement.create({
        data: {
          tournamentId,
          title: dto.title,
          body: dto.body,
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
            audience: created.audience,
            publishedAt: created.publishedAt?.toISOString() ?? null,
          },
        },
        tx,
      );
      return created;
    });

    return this.serialize(announcement);
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
        message: 'Announcement was not found',
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

    return { ...this.serialize(updated), alreadyPublished: false };
  }

  private serialize(row: {
    id: string;
    tournamentId: string;
    title: string;
    body: string;
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
      audience: row.audience,
      publishedAt: row.publishedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
