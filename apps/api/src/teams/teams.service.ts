import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, TeamRole, InvitationStatus, SportType } from '@prisma/client';
import { TeamMembershipService } from './team-membership.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateTeamDto } from './dto/create-team.dto';
import { UpdateTeamDto } from './dto/update-team.dto';

// Expiration duration for team invitations in days
const INVITATION_EXPIRY_DAYS = 7;

@Injectable()
export class TeamsService {
  private readonly logger = new Logger(TeamsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly membershipService: TeamMembershipService,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * Adds a backward-compatible `sportType` field (primary sport) alongside the
   * canonical `sportTypes` array so frontend clients can transition gradually.
   */
  private withBackwardCompat<T extends { sportTypes: SportType[] }>(team: T): T & { sportType: SportType } {
    return { ...team, sportType: team.sportTypes[0] };
  }

  async findByOwner(ownerId: string) {
    const teams = await this.prisma.sportTeam.findMany({
      where: { ownerId },
      include: {
        owner: {
          select: { id: true, nickname: true, profileImageUrl: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return teams.map((t) => this.withBackwardCompat(t));
  }

  async findAll(filter: { sportType?: string; city?: string; recruiting?: string; cursor?: string; ownerId?: string; limit?: number; search?: string }) {
    const limit = Math.min(Math.max(1, filter.limit ?? 20), 100);
    const where: Prisma.SportTeamWhereInput = {};
    if (filter.sportType) where.sportTypes = { has: filter.sportType as SportType };
    if (filter.city) where.city = filter.city;
    if (filter.recruiting === 'true') where.isRecruiting = true;
    if (filter.ownerId) where.ownerId = filter.ownerId;
    const trimmedSearch = filter.search?.slice(0, 100);
    if (trimmedSearch) where.name = { contains: trimmedSearch, mode: 'insensitive' as const };

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
      items: result.map((t) => this.withBackwardCompat(t)),
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
    return this.withBackwardCompat(team);
  }

  async create(ownerId: string, data: CreateTeamDto) {
    return this.prisma.$transaction(async (tx) => {
      const team = await tx.sportTeam.create({
        data: {
          ownerId,
          name: data.name,
          sportTypes: data.sportTypes,
          description: data.description,
          logoUrl: data.logoUrl,
          coverImageUrl: data.coverImageUrl,
          photos: data.photos ?? [],
          city: data.city,
          district: data.district,
          level: data.level ?? 3,
          isRecruiting: data.isRecruiting ?? true,
          contactInfo: data.contactInfo,
          instagramUrl: data.instagramUrl,
          youtubeUrl: data.youtubeUrl,
          shortsUrl: data.shortsUrl,
          kakaoOpenChat: data.kakaoOpenChat,
          websiteUrl: data.websiteUrl,
        },
      });

      await tx.teamMembership.create({
        data: {
          teamId: team.id,
          userId: ownerId,
          role: 'owner',
          status: 'active',
        },
      });

      return this.withBackwardCompat(team);
    });
  }

  async update(teamId: string, userId: string, data: UpdateTeamDto) {
    await this.membershipService.assertRole(teamId, userId, TeamRole.manager);
    await this.findById(teamId);

    const updated = await this.prisma.sportTeam.update({
      where: { id: teamId },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.sportTypes !== undefined ? { sportTypes: data.sportTypes } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.logoUrl !== undefined ? { logoUrl: data.logoUrl } : {}),
        ...(data.coverImageUrl !== undefined ? { coverImageUrl: data.coverImageUrl } : {}),
        ...(data.photos !== undefined ? { photos: data.photos } : {}),
        ...(data.city !== undefined ? { city: data.city } : {}),
        ...(data.district !== undefined ? { district: data.district } : {}),
        ...(data.level !== undefined ? { level: data.level } : {}),
        ...(data.isRecruiting !== undefined ? { isRecruiting: data.isRecruiting } : {}),
        ...(data.contactInfo !== undefined ? { contactInfo: data.contactInfo } : {}),
        ...(data.instagramUrl !== undefined ? { instagramUrl: data.instagramUrl } : {}),
        ...(data.youtubeUrl !== undefined ? { youtubeUrl: data.youtubeUrl } : {}),
        ...(data.shortsUrl !== undefined ? { shortsUrl: data.shortsUrl } : {}),
        ...(data.kakaoOpenChat !== undefined ? { kakaoOpenChat: data.kakaoOpenChat } : {}),
        ...(data.websiteUrl !== undefined ? { websiteUrl: data.websiteUrl } : {}),
      },
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
    return this.withBackwardCompat(updated);
  }

  async remove(teamId: string, userId: string) {
    await this.membershipService.assertRole(teamId, userId, TeamRole.owner);
    await this.findById(teamId);
    await this.prisma.sportTeam.delete({ where: { id: teamId } });
  }

  async findHub(teamId: string, viewerId?: string) {
    const [team, goods, passes, events] = await Promise.all([
      this.findById(teamId),
      this.prisma.marketplaceListing.findMany({
        where: {
          teamId,
          status: 'active',
        },
        include: {
          seller: {
            select: { id: true, nickname: true, profileImageUrl: true, mannerScore: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 4,
      }),
      this.prisma.lesson.findMany({
        where: {
          teamId,
          status: 'open',
        },
        include: {
          host: {
            select: { id: true, nickname: true, profileImageUrl: true },
          },
          ticketPlans: {
            where: { isActive: true },
            orderBy: { sortOrder: 'asc' },
            select: {
              id: true,
              lessonId: true,
              name: true,
              type: true,
              price: true,
              originalPrice: true,
              totalSessions: true,
              validDays: true,
              description: true,
              isActive: true,
              sortOrder: true,
            },
          },
        },
        orderBy: { lessonDate: 'asc' },
        take: 4,
      }),
      this.prisma.tournament.findMany({
        where: {
          teamId,
          status: { in: ['recruiting', 'full', 'ongoing'] },
        },
        include: {
          organizer: {
            select: { id: true, nickname: true, profileImageUrl: true },
          },
          venue: {
            select: { id: true, name: true, city: true, district: true },
          },
        },
        orderBy: { startDate: 'asc' },
        take: 4,
      }),
    ]);

    const counts = await Promise.all([
      this.prisma.marketplaceListing.count({
        where: { teamId, status: 'active' },
      }),
      this.prisma.lesson.count({
        where: { teamId, status: 'open' },
      }),
      this.prisma.tournament.count({
        where: { teamId, status: { in: ['recruiting', 'full', 'ongoing'] } },
      }),
    ]);

    let membership: Awaited<ReturnType<TeamMembershipService['getMembership']>> | null = null;
    if (viewerId) {
      membership = await this.membershipService.getMembership(teamId, viewerId);
    }

    const myRole = membership?.role ?? null;
    const canManage = myRole === TeamRole.owner || myRole === TeamRole.manager;

    return {
      team,
      sections: {
        goodsCount: counts[0],
        passesCount: counts[1],
        eventsCount: counts[2],
      },
      goods,
      passes,
      events: events.map((event) => ({
        ...event,
        eventDate: event.startDate,
        venueName: event.venue?.name ?? null,
      })),
      capabilities: {
        canEditProfile: canManage,
        canManageGoods: canManage,
        canManagePasses: canManage,
        canManageEvents: canManage,
      },
    };
  }

  async applyToTeam(teamId: string, userId: string) {
    const team = await this.prisma.sportTeam.findUnique({ where: { id: teamId } });
    if (!team) {
      throw new NotFoundException({ code: 'TEAM_NOT_FOUND', message: 'Team not found' });
    }
    if (!team.isRecruiting) {
      throw new BadRequestException({ code: 'TEAM_NOT_RECRUITING', message: 'This team is not recruiting' });
    }

    const existing = await this.prisma.teamMembership.findFirst({
      where: { teamId, userId },
    });
    if (existing) {
      if (existing.status === 'active') {
        throw new ConflictException({ code: 'TEAM_ALREADY_MEMBER', message: 'Already a member of this team' });
      }
      if (existing.status === 'pending') {
        throw new ConflictException({ code: 'TEAM_APPLY_PENDING_EXISTS', message: 'Application already pending' });
      }
      // left or removed — allow re-application; role intentionally resets to member
      // (prior owners/managers re-apply as regular members; promotion is granted separately)
      const membership = await this.prisma.teamMembership.update({
        where: { id: existing.id },
        data: { role: 'member', status: 'pending' },
      });
      await this.fanOutApplicationReceivedNotification(teamId, team.name, userId, membership);
      return membership;
    }

    // No existing record — create fresh application
    let membership;
    try {
      membership = await this.prisma.teamMembership.create({
        data: { teamId, userId, role: 'member', status: 'pending' },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException({ code: 'TEAM_APPLY_DUPLICATE', message: 'Duplicate application request' });
      }
      throw e;
    }
    await this.fanOutApplicationReceivedNotification(teamId, team.name, userId, membership);
    return membership;
  }

  /**
   * Lists pending team membership applications. Requires manager+ role.
   */
  async listApplications(teamId: string, actorUserId: string) {
    await this.membershipService.assertRole(teamId, actorUserId, TeamRole.manager);

    return this.prisma.teamMembership.findMany({
      where: { teamId, status: 'pending' },
      include: {
        user: {
          select: {
            id: true,
            nickname: true,
            profileImageUrl: true,
            mannerScore: true,
          },
        },
      },
      orderBy: { joinedAt: 'desc' },
    });
  }

  /**
   * Accepts a pending team membership application. Requires manager+ role.
   * Transitions status pending → active, increments memberCount.
   * Notifies the applicant fire-and-forget.
   */
  async acceptApplication(teamId: string, applicantUserId: string, actorUserId: string) {
    await this.membershipService.assertRole(teamId, actorUserId, TeamRole.manager);

    const team = await this.findById(teamId);

    const application = await this.prisma.teamMembership.findFirst({
      where: { teamId, userId: applicantUserId, status: 'pending' },
    });
    if (!application) {
      throw new NotFoundException({
        code: 'TEAM_APPLICATION_NOT_FOUND',
        message: '대기 중인 신청을 찾을 수 없습니다.',
      });
    }

    try {
      await this.prisma.$transaction(
        async (tx) => {
          const updated = await tx.teamMembership.updateMany({
            where: { id: application.id, status: 'pending' },
            data: { status: 'active' },
          });
          if (updated.count === 0) {
            throw new ConflictException({
              code: 'TEAM_APPLICATION_ALREADY_PROCESSED',
              message: '신청이 이미 처리되었습니다.',
            });
          }

          await tx.sportTeam.update({
            where: { id: teamId },
            data: { memberCount: { increment: 1 } },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (
        error instanceof ConflictException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }
      // P2034: transaction conflict (serializable isolation) — concurrent accept race
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code: string }).code === 'P2034'
      ) {
        throw new ConflictException({
          code: 'TEAM_APPLICATION_ALREADY_PROCESSED',
          message: '다른 요청과 충돌했습니다. 다시 시도해주세요.',
        });
      }
      throw error;
    }

    // Fire-and-forget notification to applicant
    void this.notificationsService.create({
      userId: applicantUserId,
      type: 'team_application_accepted',
      title: '팀 가입 신청이 수락되었어요',
      body: `${team.name} 팀에 가입되었습니다.`,
      data: { teamId, teamName: team.name },
    });

    return { accepted: true };
  }

  /**
   * Rejects a pending team membership application. Requires manager+ role.
   * Transitions status pending → left (preserves re-apply path).
   * Notifies the applicant fire-and-forget.
   */
  async rejectApplication(teamId: string, applicantUserId: string, actorUserId: string) {
    await this.membershipService.assertRole(teamId, actorUserId, TeamRole.manager);

    const team = await this.findById(teamId);

    const application = await this.prisma.teamMembership.findFirst({
      where: { teamId, userId: applicantUserId, status: 'pending' },
    });
    if (!application) {
      throw new NotFoundException({
        code: 'TEAM_APPLICATION_NOT_FOUND',
        message: '대기 중인 신청을 찾을 수 없습니다.',
      });
    }

    const rejected = await this.prisma.teamMembership.updateMany({
      where: { id: application.id, status: 'pending' },
      // Use 'left' so the applicant can re-apply; 'removed' would be permanent block
      data: { status: 'left' },
    });
    if (rejected.count === 0) {
      throw new ConflictException({
        code: 'TEAM_APPLICATION_ALREADY_PROCESSED',
        message: '신청이 이미 처리되었습니다.',
      });
    }

    // Fire-and-forget notification to applicant
    void this.notificationsService.create({
      userId: applicantUserId,
      type: 'team_application_rejected',
      title: '팀 가입 신청이 거절되었어요',
      body: `${team.name} 팀 가입 신청이 거절되었습니다.`,
      data: { teamId, teamName: team.name },
    });

    return { rejected: true };
  }

  /**
   * Fans out team_application_received notifications to all active owner+manager members.
   * Fire-and-forget: errors are caught and logged; they do not fail the mutation.
   */
  private async fanOutApplicationReceivedNotification(
    teamId: string,
    teamName: string,
    applicantUserId: string,
    _membership: { id: string },
  ) {
    try {
      const applicant = await this.prisma.user.findFirst({
        where: { id: applicantUserId, deletedAt: null },
        select: { id: true, nickname: true },
      });

      const managers = await this.prisma.teamMembership.findMany({
        where: {
          teamId,
          role: { in: [TeamRole.owner, TeamRole.manager] },
          status: 'active',
        },
        select: { userId: true },
      });

      await Promise.all(
        managers.map((m) =>
          this.notificationsService.create({
            userId: m.userId,
            type: 'team_application_received',
            title: '새 팀 가입 신청이 있어요',
            body: `${applicant?.nickname ?? '누군가'}님이 ${teamName} 팀에 가입 신청했습니다.`,
            data: {
              teamId,
              teamName,
              applicantUserId,
              applicantNickname: applicant?.nickname ?? null,
            },
          }).catch((err) =>
            this.logger.warn('team_application_received notify failed', { userId: m.userId, err: err?.message }),
          ),
        ),
      );
    } catch (err) {
      // Notification fan-out failure must not fail the apply mutation
      this.logger.warn(`fanOutApplicationReceivedNotification failed for team ${teamId}`, { err });
    }
  }

  // ─── Invitation Methods ────────────────────────────────────────────────────

  /**
   * Invites a user to the team. Caller must have manager+ role.
   * Throws ConflictException if invitee is already a member or has a pending invitation.
   */
  async inviteMember(
    teamId: string,
    inviterId: string,
    inviteeId: string,
    role: TeamRole = TeamRole.member,
  ) {
    await this.membershipService.assertRole(teamId, inviterId, TeamRole.manager);

    const team = await this.findById(teamId);

    // Prevent inviting self
    if (inviterId === inviteeId) {
      throw new BadRequestException({
        code: 'TEAM_INVITATION_SELF',
        message: '자기 자신을 초대할 수 없습니다.',
      });
    }

    // Check invitee exists and is not deleted
    const invitee = await this.prisma.user.findFirst({
      where: { id: inviteeId, deletedAt: null },
      select: { id: true, nickname: true },
    });
    if (!invitee) {
      throw new NotFoundException('초대할 사용자를 찾을 수 없습니다.');
    }

    // Check if already an active member
    const existingMembership = await this.membershipService.getMembership(teamId, inviteeId);
    if (existingMembership) {
      throw new ConflictException({
        code: 'TEAM_INVITATION_ALREADY_MEMBER',
        message: '이미 팀의 멤버입니다.',
      });
    }

    // Check if pending invitation already exists
    const existingInvitation = await this.prisma.teamInvitation.findUnique({
      where: { teamId_inviteeId: { teamId, inviteeId } },
    });
    if (existingInvitation && existingInvitation.status === InvitationStatus.pending) {
      throw new ConflictException({
        code: 'TEAM_INVITATION_PENDING_EXISTS',
        message: '이미 대기 중인 초대가 있습니다.',
      });
    }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + INVITATION_EXPIRY_DAYS);

    // Upsert: replace expired/declined invitation or create new
    const invitation = await this.prisma.teamInvitation.upsert({
      where: { teamId_inviteeId: { teamId, inviteeId } },
      create: {
        teamId,
        inviterId,
        inviteeId,
        role,
        status: InvitationStatus.pending,
        expiresAt,
      },
      update: {
        inviterId,
        role,
        status: InvitationStatus.pending,
        expiresAt,
      },
      include: {
        inviter: { select: { id: true, nickname: true } },
        invitee: { select: { id: true, nickname: true } },
        team: { select: { id: true, name: true } },
      },
    });

    // Fire-and-forget notification
    void this.notificationsService.create({
      userId: inviteeId,
      type: 'team_invitation',
      title: '팀 초대',
      body: `${team.name} 팀에서 초대장이 도착했습니다.`,
      data: { teamId, invitationId: invitation.id },
    });

    return invitation;
  }

  /**
   * Returns all invitations for a team. Caller must have manager+ role.
   */
  async getTeamInvitations(teamId: string, userId: string) {
    await this.membershipService.assertRole(teamId, userId, TeamRole.manager);

    return this.prisma.teamInvitation.findMany({
      where: { teamId },
      include: {
        inviter: { select: { id: true, nickname: true, profileImageUrl: true } },
        invitee: { select: { id: true, nickname: true, profileImageUrl: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Returns all pending invitations sent to the current user.
   */
  async getMyInvitations(userId: string) {
    const invitations = await this.prisma.teamInvitation.findMany({
      where: {
        inviteeId: userId,
        status: InvitationStatus.pending,
        expiresAt: { gt: new Date() },
      },
      include: {
        team: { select: { id: true, name: true, logoUrl: true, sportTypes: true } },
        inviter: { select: { id: true, nickname: true, profileImageUrl: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return invitations.map((inv) => ({
      ...inv,
      team: this.withBackwardCompat(inv.team),
    }));
  }

  /**
   * Accepts a pending, non-expired invitation and creates a TeamMembership.
   * Only the invitee can accept.
   */
  async acceptInvitation(teamId: string, invitationId: string, userId: string) {
    const invitation = await this.prisma.teamInvitation.findFirst({
      where: { id: invitationId, teamId },
    });

    if (!invitation) {
      throw new NotFoundException({
        code: 'TEAM_INVITATION_NOT_FOUND',
        message: '초대를 찾을 수 없습니다.',
      });
    }
    if (invitation.inviteeId !== userId) {
      throw new ForbiddenException({
        code: 'TEAM_INVITATION_FORBIDDEN',
        message: '본인에게 온 초대만 수락할 수 있습니다.',
      });
    }
    if (invitation.status !== InvitationStatus.pending) {
      throw new BadRequestException({
        code: 'TEAM_INVITATION_NOT_PENDING',
        message: '대기 중인 초대가 아닙니다.',
      });
    }
    if (invitation.expiresAt < new Date()) {
      // Mark as expired
      await this.prisma.teamInvitation.update({
        where: { id: invitationId },
        data: { status: InvitationStatus.expired },
      });
      throw new BadRequestException({
        code: 'TEAM_INVITATION_EXPIRED',
        message: '초대가 만료되었습니다.',
      });
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.teamInvitation.update({
        where: { id: invitationId },
        data: { status: InvitationStatus.accepted },
      });

      await tx.teamMembership.create({
        data: {
          teamId,
          userId,
          role: invitation.role,
          status: 'active',
          invitedBy: invitation.inviterId,
        },
      });

      await tx.sportTeam.update({
        where: { id: teamId },
        data: { memberCount: { increment: 1 } },
      });

      return { accepted: true };
    });
  }

  /**
   * Declines a pending invitation. Only the invitee can decline.
   */
  async declineInvitation(teamId: string, invitationId: string, userId: string) {
    const invitation = await this.prisma.teamInvitation.findFirst({
      where: { id: invitationId, teamId },
    });

    if (!invitation) {
      throw new NotFoundException({
        code: 'TEAM_INVITATION_NOT_FOUND',
        message: '초대를 찾을 수 없습니다.',
      });
    }
    if (invitation.inviteeId !== userId) {
      throw new ForbiddenException({
        code: 'TEAM_INVITATION_FORBIDDEN',
        message: '본인에게 온 초대만 거절할 수 있습니다.',
      });
    }
    if (invitation.status !== InvitationStatus.pending) {
      throw new BadRequestException({
        code: 'TEAM_INVITATION_NOT_PENDING',
        message: '대기 중인 초대가 아닙니다.',
      });
    }

    await this.prisma.teamInvitation.update({
      where: { id: invitationId },
      data: { status: InvitationStatus.declined },
    });

    return { declined: true };
  }
}
