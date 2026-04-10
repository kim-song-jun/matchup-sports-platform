import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, TeamRole, InvitationStatus } from '@prisma/client';
import { TeamMembershipService } from './team-membership.service';
import { NotificationsService } from '../notifications/notifications.service';

// Expiration duration for team invitations in days
const INVITATION_EXPIRY_DAYS = 7;

@Injectable()
export class TeamsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly membershipService: TeamMembershipService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async findByOwner(ownerId: string) {
    return this.prisma.sportTeam.findMany({
      where: { ownerId },
      include: {
        owner: {
          select: { id: true, nickname: true, profileImageUrl: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findAll(filter: { sportType?: string; city?: string; recruiting?: string; cursor?: string; ownerId?: string; limit?: number }) {
    const limit = Math.min(filter.limit ?? 20, 100);
    const where: Record<string, unknown> = {};
    if (filter.sportType) where.sportType = filter.sportType;
    if (filter.city) where.city = filter.city;
    if (filter.recruiting === 'true') where.isRecruiting = true;
    if (filter.ownerId) where.ownerId = filter.ownerId;

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
    return this.prisma.$transaction(async (tx) => {
      const team = await tx.sportTeam.create({
        data: {
          ownerId,
          name: data.name as string,
          sportType: data.sportType as never,
          description: data.description as string | undefined,
          logoUrl: data.logoUrl as string | undefined,
          coverImageUrl: data.coverImageUrl as string | undefined,
          photos: (data.photos as string[]) || [],
          city: data.city as string | undefined,
          district: data.district as string | undefined,
          memberCount: (data.memberCount as number) || 1,
          level: (data.level as number) || 3,
          isRecruiting: data.isRecruiting !== false,
          contactInfo: data.contactInfo as string | undefined,
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

      return team;
    });
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
      return this.prisma.teamMembership.update({
        where: { id: existing.id },
        data: { role: 'member', status: 'pending' },
      });
    }

    // No existing record — create fresh application
    try {
      return await this.prisma.teamMembership.create({
        data: { teamId, userId, role: 'member', status: 'pending' },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException({ code: 'TEAM_APPLY_DUPLICATE', message: 'Duplicate application request' });
      }
      throw e;
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
    return this.prisma.teamInvitation.findMany({
      where: {
        inviteeId: userId,
        status: InvitationStatus.pending,
        expiresAt: { gt: new Date() },
      },
      include: {
        team: { select: { id: true, name: true, logoUrl: true, sportType: true } },
        inviter: { select: { id: true, nickname: true, profileImageUrl: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
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
