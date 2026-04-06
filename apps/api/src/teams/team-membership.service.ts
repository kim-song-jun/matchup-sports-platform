import { Injectable, ForbiddenException, ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TeamRole, TeamMembership, SportTeam, User } from '@prisma/client';

// Role hierarchy weights: owner(3) > manager(2) > member(1)
const ROLE_WEIGHT: Record<TeamRole, number> = {
  owner: 3,
  manager: 2,
  member: 1,
};

@Injectable()
export class TeamMembershipService {
  constructor(private readonly prisma: PrismaService) {}

  /** Returns the membership record if user is an active member, otherwise null. */
  async getMembership(teamId: string, userId: string): Promise<TeamMembership | null> {
    return this.prisma.teamMembership.findFirst({
      where: { teamId, userId, status: 'active' },
    });
  }

  /**
   * Asserts that the user has at least minRole in the team.
   * Throws ForbiddenException if not a member or role is insufficient.
   */
  async assertRole(teamId: string, userId: string, minRole: TeamRole): Promise<TeamMembership> {
    const membership = await this.getMembership(teamId, userId);
    if (!membership || !this.roleMeetsMin(membership.role, minRole)) {
      throw new ForbiddenException('팀 권한이 부족합니다');
    }
    return membership;
  }

  /** Returns all teams the user is an active member of, including team data. */
  async listUserTeams(userId: string): Promise<Array<TeamMembership & { team: SportTeam }>> {
    return this.prisma.teamMembership.findMany({
      where: { userId, status: 'active' },
      include: { team: true },
      orderBy: { joinedAt: 'desc' },
    }) as Promise<Array<TeamMembership & { team: SportTeam }>>;
  }

  /** Returns all active members of a team, including partial user data. */
  async listTeamMembers(teamId: string): Promise<Array<TeamMembership & { user: Partial<User> }>> {
    return this.prisma.teamMembership.findMany({
      where: { teamId, status: 'active' },
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
      orderBy: [{ role: 'asc' }, { joinedAt: 'asc' }],
    }) as unknown as Promise<Array<TeamMembership & { user: Partial<User> }>>;
  }

  /**
   * Adds a new member to the team. Caller must verify manager+ permission beforehand.
   * Throws ConflictException if user is already an active member.
   */
  async addMember(
    teamId: string,
    userId: string,
    role: TeamRole,
    invitedBy: string,
  ): Promise<TeamMembership> {
    const existing = await this.getMembership(teamId, userId);
    if (existing) {
      throw new ConflictException('이미 팀의 멤버입니다');
    }

    return this.prisma.teamMembership.create({
      data: {
        teamId,
        userId,
        role,
        status: 'active',
        invitedBy,
      },
    });
  }

  /**
   * Updates the role of an existing member. Caller must verify owner permission beforehand.
   * Cannot change the owner role.
   */
  async updateRole(teamId: string, userId: string, newRole: TeamRole): Promise<TeamMembership> {
    const membership = await this.getMembership(teamId, userId);
    if (!membership) {
      throw new NotFoundException('해당 팀 멤버를 찾을 수 없습니다');
    }
    if (membership.role === 'owner') {
      throw new ForbiddenException('팀 소유자의 역할은 변경할 수 없습니다');
    }

    return this.prisma.teamMembership.update({
      where: { teamId_userId: { teamId, userId } },
      data: { role: newRole, roleChangedAt: new Date() },
    });
  }

  /**
   * Removes a member from the team (marks status as 'removed').
   * Caller must verify owner permission (or self-leave via leave()).
   */
  async removeMember(teamId: string, userId: string): Promise<void> {
    const membership = await this.getMembership(teamId, userId);
    if (!membership) {
      throw new NotFoundException('해당 팀 멤버를 찾을 수 없습니다');
    }

    await this.prisma.teamMembership.update({
      where: { teamId_userId: { teamId, userId } },
      data: { status: 'removed', leftAt: new Date() },
    });
  }

  /**
   * Self-leave: marks status as 'left'. Owner cannot self-leave.
   */
  async leaveTeam(teamId: string, userId: string): Promise<void> {
    const membership = await this.getMembership(teamId, userId);
    if (!membership) {
      throw new NotFoundException('팀 멤버가 아닙니다');
    }
    if (membership.role === 'owner') {
      throw new ForbiddenException('팀 소유자는 팀을 탈퇴할 수 없습니다');
    }

    await this.prisma.teamMembership.update({
      where: { teamId_userId: { teamId, userId } },
      data: { status: 'left', leftAt: new Date() },
    });
  }

  /**
   * Transfers team ownership from fromUserId to toUserId using optimistic concurrency.
   * toUserId must be an active member. fromUserId's role is downgraded to demoteTo.
   * Updates both TeamMembership records and SportTeam.ownerId atomically.
   * Throws ConflictException (TEAM_OWNER_CONFLICT) if fromUserId is no longer owner (concurrent update).
   * Throws BadRequestException (TEAM_OWNER_TRANSFER_INVALID_TARGET) if toUserId is not an active member.
   */
  async transferOwnership(
    teamId: string,
    fromUserId: string,
    toUserId: string,
    demoteTo: 'manager' | 'member',
  ): Promise<void> {
    const targetMembership = await this.getMembership(teamId, toUserId);
    if (!targetMembership) {
      throw new BadRequestException({
        code: 'TEAM_OWNER_TRANSFER_INVALID_TARGET',
        message: '소유권 이전 대상이 팀의 활성 멤버가 아닙니다.',
      });
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      // Optimistic lock: update succeeds only if fromUserId is still owner
      const count = await tx.teamMembership.updateMany({
        where: { teamId, userId: fromUserId, role: 'owner', status: 'active' },
        data: { role: demoteTo, roleChangedAt: new Date() },
      });

      if (count.count === 0) {
        throw new ConflictException({
          code: 'TEAM_OWNER_CONFLICT',
          message: '소유자 정보가 변경되었습니다. 다시 시도해주세요.',
        });
      }

      await tx.teamMembership.update({
        where: { teamId_userId: { teamId, userId: toUserId } },
        data: { role: 'owner', roleChangedAt: new Date() },
      });

      await tx.sportTeam.update({
        where: { id: teamId },
        data: { ownerId: toUserId },
      });

      return true;
    });

    return updated ? undefined : undefined;
  }

  /** Returns true if the actual role meets or exceeds the required minimum role. */
  private roleMeetsMin(actual: TeamRole, required: TeamRole): boolean {
    return ROLE_WEIGHT[actual] >= ROLE_WEIGHT[required];
  }
}
