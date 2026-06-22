import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  V1Team,
  V1TeamJoinApplication,
  V1TeamMembership,
  V1TeamMembershipRole,
} from '@prisma/client';
import { V1AuthUser } from '../auth/v1-auth-user';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { SPORT_LEVEL_CODES, formatLevelRange, parseLevelCodes, resolveSportLevelRange } from '../sports/level-range';
import {
  ChangeTeamMembershipRoleDto,
  MutateTeamDto,
  RemoveTeamMembershipDto,
  TeamMembersQueryDto,
  UpdateTeamDto,
} from './dto/mutate-team.dto';
import { CreateTeamInvitationDto } from './dto/create-team-invitation.dto';
import {
  ApproveTeamJoinApplicationDto,
  CreateTeamJoinApplicationDto,
  ListTeamJoinApplicationsQueryDto,
  RejectTeamJoinApplicationDto,
  WithdrawTeamJoinApplicationDto,
} from './dto/team-join-application.dto';
import { MyTeamsQueryDto, TeamsQueryDto } from './dto/teams-query.dto';

type TeamWithRelations = V1Team & {
  sport: { id: string; name: string };
  region: { id: string; name: string } | null;
  profile: {
    logoUrl: string | null;
    coverImageUrl: string | null;
    description: string | null;
    activityNote: string | null;
    skillNote: string | null;
    minSportLevel: { id: string; code: string; name: string; sortOrder: number; sportId: string } | null;
    maxSportLevel: { id: string; code: string; name: string; sortOrder: number; sportId: string } | null;
    genderRule: string | null;
  } | null;
  memberships: Array<
    V1TeamMembership & {
      user: { profile: { nickname: string; displayName: string | null; profileImageUrl: string | null } | null };
    }
  >;
  joinApplications: V1TeamJoinApplication[];
  trustScore: { trustState: 'verified' | 'estimated' | 'sample' | 'none'; mannerScore: Prisma.Decimal | null; matchCount: number } | null;
  ownerUser: {
    id: string;
    profile: { nickname: string; displayName: string | null; profileImageUrl: string | null } | null;
  };
};

@Injectable()
export class TeamsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async list(user: V1AuthUser | null, query: TeamsQueryDto) {
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 50);
    const teams = await this.prisma.v1Team.findMany({
      where: {
        status: 'active',
        deletedAt: null,
        ...(query.sportId ? { sportId: query.sportId } : {}),
        ...(query.regionId ? { regionId: query.regionId } : {}),
        ...(query.genderRule ? { AND: [getTeamGenderRuleWhere(query.genderRule)] } : {}),
        ...teamLevelCodeWhere(parseLevelCodes(query.levelCodes)),
        ...(query.joinPolicy ? { joinPolicy: query.joinPolicy } : {}),
        ...(query.query
          ? {
              OR: [
                { name: { contains: query.query, mode: 'insensitive' } },
                { profile: { description: { contains: query.query, mode: 'insensitive' } } },
                { profile: { activityNote: { contains: query.query, mode: 'insensitive' } } },
              ],
            }
          : {}),
      },
      include: this.teamInclude(user),
      orderBy: getTeamOrderBy(query.sort),
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });

    const pageItems = teams.slice(0, limit);
    const hasNext = teams.length > limit;

    return {
      items: pageItems.map((team) => this.toListItem(team, user)),
      pageInfo: {
        nextCursor: hasNext ? pageItems.at(-1)?.id ?? null : null,
        hasNext,
      },
    };
  }

  async detail(user: V1AuthUser | null, teamId: string) {
    const team = await this.getPublicTeam(teamId, user);
    const viewer = this.getViewer(team, user);
    const canViewMembers = this.canViewMembers(team, viewer);

    return {
      id: team.id,
      teamId: team.id,
      name: team.name,
      status: team.status,
      visibility: 'public',
      sportName: team.sport.name,
      sport: { sportId: team.sport.id, name: team.sport.name },
      regionName: team.region?.name ?? null,
      region: team.region ? { regionId: team.region.id, name: team.region.name } : null,
      joinPolicy: team.joinPolicy,
      trustState: team.trustScore?.trustState ?? 'none',
      version: team.updatedAt.toISOString(),
      profile: {
        logoUrl: team.profile?.logoUrl ?? null,
        coverImageUrl: team.profile?.coverImageUrl ?? null,
        introduction: team.profile?.description ?? null,
        activityAreaText: team.profile?.activityNote ?? null,
        skillLevelText: team.profile?.skillNote ?? null,
        levelLabel: formatLevelRange(team.profile?.minSportLevel, team.profile?.maxSportLevel, team.profile?.skillNote),
        minLevel: team.profile?.minSportLevel ? { code: team.profile.minSportLevel.code, name: team.profile.minSportLevel.name } : null,
        maxLevel: team.profile?.maxSportLevel ? { code: team.profile.maxSportLevel.code, name: team.profile.maxSportLevel.name } : null,
        genderRule: team.profile?.genderRule ?? '성별 무관',
        joinPolicy: team.joinPolicy,
        memberGoalCount: null,
      },
      owner: {
        userId: team.ownerUser.id,
        displayName: team.ownerUser.profile?.displayName ?? team.ownerUser.profile?.nickname ?? '팀장',
        profileImageUrl: team.ownerUser.profile?.profileImageUrl ?? null,
      },
      membersVisibilityEnabled: team.membersVisible,
      canViewMembers,
      membersPreview: canViewMembers ? team.memberships.slice(0, 8).map((membership) => ({
        membershipId: membership.id,
        userId: membership.userId,
        displayName: membership.user.profile?.displayName ?? membership.user.profile?.nickname ?? '멤버',
        role: membership.role,
      })) : [],
      memberCount: team.memberCount,
      managerCount: team.managerCount,
      trust: {
        trustState: team.trustScore?.trustState ?? 'none',
        score: team.trustScore?.mannerScore ? Number(team.trustScore.mannerScore) : null,
      },
      viewer,
    };
  }

  async joinEligibility(user: V1AuthUser, teamId: string) {
    const team = await this.getPublicTeam(teamId, user);
    const viewer = this.getViewer(team, user);
    const reasonCode = getJoinReason(team, viewer, user);

    return {
      teamId: team.id,
      eligible: reasonCode === 'OK',
      reasonCode,
      message: getJoinReasonMessage(reasonCode),
      joinPolicy: team.joinPolicy,
      viewerRole: viewer.role,
      joinState: viewer.joinState,
      applicationId: team.joinApplications[0]?.id ?? null,
      requiresApproval: true,
      immediateJoinSupported: false,
    };
  }

  async create(user: V1AuthUser, dto: MutateTeamDto) {
    this.assertActiveAccount(user);
    await this.validateMasterRefs(dto.sportId, dto.regionId);

    const result = await this.prisma.$transaction(async (tx) => {
      const levelRange = await resolveSportLevelRange(tx, dto.sportId, dto.minLevelCode, dto.maxLevelCode);
      const team = await tx.v1Team.create({
        data: {
          ownerUserId: user.id,
          sportId: dto.sportId,
          regionId: dto.regionId,
          name: dto.name,
          status: 'active',
          joinPolicy: dto.joinPolicy,
          memberCount: 1,
          managerCount: 0,
          profile: {
            create: {
              logoUrl: dto.logoUrl ?? null,
              coverImageUrl: dto.coverImageUrl ?? null,
              description: dto.introduction ?? null,
              activityNote: dto.activityAreaText ?? null,
              skillNote: dto.skillLevelText ?? null,
              minSportLevelId: levelRange.minSportLevelId,
              maxSportLevelId: levelRange.maxSportLevelId,
              genderRule: dto.genderRule ?? null,
            },
          },
        },
      });

      const membership = await tx.v1TeamMembership.create({
        data: {
          teamId: team.id,
          userId: user.id,
          role: 'owner',
          status: 'active',
          joinedAt: new Date(),
        },
      });

      await tx.v1StatusChangeLog.createMany({
        data: [
          {
            targetType: 'team',
            targetId: team.id,
            fromStatus: null,
            toStatus: 'active',
            actorType: 'user',
            actorUserId: user.id,
            reason: 'team_created',
          },
          {
            targetType: 'team_membership',
            targetId: membership.id,
            fromStatus: null,
            toStatus: 'owner',
            actorType: 'user',
            actorUserId: user.id,
            reason: 'owner_membership_created',
          },
        ],
      });
      await this.ensureTeamChatParticipant(tx, team.id, user.id, user.id, 'team_created_owner_joined');

      return { team, membership };
    });

    return {
      teamId: result.team.id,
      membershipId: result.membership.id,
      role: result.membership.role,
      status: result.team.status,
      detailRoute: `/teams/${result.team.id}`,
      manageRoute: `/teams/${result.team.id}/manage`,
    };
  }

  async update(user: V1AuthUser, teamId: string, dto: UpdateTeamDto) {
    this.assertActiveAccount(user);
    const { team, membership } = await this.getManageableTeam(user, teamId);

    if (team.updatedAt.toISOString() !== dto.version) {
      throw stateConflict('Team version is stale', 'VERSION_CONFLICT');
    }

    await this.validateMasterRefs(dto.sportId, dto.regionId);
    const updated = await this.prisma.$transaction(async (tx) => {
      const levelRange = await resolveSportLevelRange(tx, dto.sportId, dto.minLevelCode, dto.maxLevelCode);
      const nextTeam = await tx.v1Team.update({
        where: { id: team.id },
        data: {
          sportId: dto.sportId,
          regionId: dto.regionId,
          name: dto.name,
          joinPolicy: dto.joinPolicy,
          membersVisible: dto.membersVisibilityEnabled ?? team.membersVisible,
        },
      });

      await tx.v1TeamProfile.upsert({
        where: { teamId: team.id },
        update: {
          logoUrl: dto.logoUrl ?? null,
          coverImageUrl: dto.coverImageUrl ?? null,
          description: dto.introduction ?? null,
          activityNote: dto.activityAreaText ?? null,
          skillNote: dto.skillLevelText ?? null,
          minSportLevelId: levelRange.minSportLevelId,
          maxSportLevelId: levelRange.maxSportLevelId,
          genderRule: dto.genderRule ?? null,
        },
        create: {
          teamId: team.id,
          logoUrl: dto.logoUrl ?? null,
          coverImageUrl: dto.coverImageUrl ?? null,
          description: dto.introduction ?? null,
          activityNote: dto.activityAreaText ?? null,
          skillNote: dto.skillLevelText ?? null,
          minSportLevelId: levelRange.minSportLevelId,
          maxSportLevelId: levelRange.maxSportLevelId,
          genderRule: dto.genderRule ?? null,
        },
      });

      if (team.joinPolicy !== dto.joinPolicy) {
        await tx.v1StatusChangeLog.create({
          data: {
            targetType: 'team',
            targetId: team.id,
            fromStatus: team.joinPolicy,
            toStatus: dto.joinPolicy,
            actorType: 'user',
            actorUserId: user.id,
            reason: `join_policy_changed_by_${membership.role}`,
          },
        });
      }
      if (team.membersVisible !== (dto.membersVisibilityEnabled ?? team.membersVisible)) {
        await tx.v1StatusChangeLog.create({
          data: {
            targetType: 'team',
            targetId: team.id,
            fromStatus: team.membersVisible ? 'members_visible' : 'members_hidden',
            toStatus: dto.membersVisibilityEnabled ? 'members_visible' : 'members_hidden',
            actorType: 'user',
            actorUserId: user.id,
            reason: `members_visibility_changed_by_${membership.role}`,
          },
        });
      }

      return nextTeam;
    });

    return {
      teamId: updated.id,
      updatedAt: updated.updatedAt,
      version: updated.updatedAt.toISOString(),
      membersVisibilityEnabled: updated.membersVisible,
      detailRoute: `/teams/${updated.id}`,
    };
  }

  async members(user: V1AuthUser, teamId: string, query: TeamMembersQueryDto) {
    const { team, membership: viewerMembership } = await this.getActiveTeamMembership(user, teamId);
    if (!team.membersVisible && viewerMembership.role !== 'owner' && viewerMembership.role !== 'manager') {
      throw new ForbiddenException({
        code: 'MEMBERS_VISIBILITY_DISABLED',
        message: 'Team member status is disabled by team managers',
      });
    }

    const limit = Math.min(Math.max(query.limit ?? 50, 1), 100);
    const status = query.status ?? 'active';
    const memberships = await this.prisma.v1TeamMembership.findMany({
      where: {
        teamId: team.id,
        status,
        ...(query.role ? { role: query.role } : {}),
      },
      orderBy: [{ role: 'asc' }, { joinedAt: 'asc' }],
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      include: {
        user: {
          select: {
            profile: { select: { nickname: true, displayName: true, profileImageUrl: true } },
          },
        },
      },
    });

    const pageItems = memberships.slice(0, limit);
    const hasNext = memberships.length > limit;
    const viewerIsOwner = viewerMembership.role === 'owner';
    const viewerIsManager = viewerMembership.role === 'manager';

    return {
      items: pageItems.map((membership) => {
        // owner: 모든 비-owner 멤버 관리 / manager: member 만 관리 (CLAUDE.md 역할 계층)
        const isManageableTarget =
          membership.status === 'active' &&
          membership.role !== 'owner' &&
          (viewerIsOwner || (viewerIsManager && membership.role === 'member'));
        return {
          membershipId: membership.id,
          userId: membership.userId,
          displayName: membership.user.profile?.displayName ?? membership.user.profile?.nickname ?? '멤버',
          profileImageUrl: membership.user.profile?.profileImageUrl ?? null,
          role: membership.role,
          status: membership.status,
          joinedAt: membership.joinedAt,
          canChangeRole: isManageableTarget,
          canRemove: isManageableTarget,
        };
      }),
      summary: {
        ownerCount: 1,
        managerCount: team.managerCount,
        memberCount: team.memberCount,
      },
      viewerRole: viewerMembership.role,
      membersVisibilityEnabled: team.membersVisible,
      pageInfo: {
        nextCursor: hasNext ? pageItems.at(-1)?.id ?? null : null,
        hasNext,
      },
    };
  }

  async myTeams(user: V1AuthUser, query: MyTeamsQueryDto) {
    const memberships = await this.prisma.v1TeamMembership.findMany({
      where: {
        userId: user.id,
        status: 'active',
        ...(query.permission === 'manage_team' || query.permission === 'create_team_match'
          ? { role: { in: ['owner', 'manager'] } }
          : {}),
      },
      orderBy: [{ role: 'asc' }, { joinedAt: 'desc' }],
      include: {
        team: {
          include: {
            sport: { select: { id: true, name: true } },
            region: { select: { id: true, name: true } },
            profile: {
              select: {
                logoUrl: true,
                coverImageUrl: true,
                description: true,
                activityNote: true,
                skillNote: true,
                genderRule: true,
              },
            },
            trustScore: { select: { trustState: true, mannerScore: true } },
          },
        },
      },
    });

    return {
      items: memberships
        .filter((membership) => membership.team.status === 'active' && !membership.team.deletedAt)
        .map((membership) => ({
          teamId: membership.teamId,
          membershipId: membership.id,
          name: membership.team.name,
          role: membership.role,
          status: membership.status,
          logoUrl: membership.team.profile?.logoUrl ?? null,
          sport: { sportId: membership.team.sport.id, name: membership.team.sport.name },
          region: membership.team.region
            ? { regionId: membership.team.region.id, name: membership.team.region.name }
            : null,
          trust: {
            trustState: membership.team.trustScore?.trustState ?? 'none',
            score: membership.team.trustScore?.mannerScore != null ? Number(membership.team.trustScore.mannerScore) : null,
          },
          memberCount: membership.team.memberCount,
          canManage: membership.role === 'owner' || membership.role === 'manager',
          canCreateTeamMatch: membership.role === 'owner' || membership.role === 'manager',
          detailRoute: `/teams/${membership.teamId}`,
          manageRoute:
            membership.role === 'owner' || membership.role === 'manager'
              ? `/teams/${membership.teamId}/manage`
              : null,
        })),
    };
  }

  async changeMembershipRole(
    user: V1AuthUser,
    membershipId: string,
    dto: ChangeTeamMembershipRoleDto,
  ) {
    this.assertActiveAccount(user);
    const target = await this.getMembershipWithTeam(membershipId);
    const actorRole = await this.getManagementActor(user, target.teamId);

    if (target.status !== 'active') {
      throw stateConflict('Only active memberships can change role');
    }
    if (target.role === dto.role) {
      return {
        membershipId: target.id,
        teamId: target.teamId,
        role: target.role,
        managerCount: target.team.managerCount,
      };
    }
    if (dto.role === 'owner') {
      if (target.role !== 'manager') {
        throw stateConflict('Owner can only be delegated to a manager', 'OWNER_DELEGATION_TARGET_MUST_BE_MANAGER');
      }
      const currentOwner = await this.prisma.v1TeamMembership.findFirst({
        where: { teamId: target.teamId, userId: user.id, role: 'owner', status: 'active' },
      });
      if (!currentOwner) {
        throw new ForbiddenException({
          code: 'PERMISSION_DENIED',
          message: 'Only the current team owner can delegate ownership',
        });
      }

      const result = await this.prisma.$transaction(async (tx) => {
        const delegatedOwner = await tx.v1TeamMembership.update({
          where: { id: target.id },
          data: { role: 'owner' },
        });
        await tx.v1TeamMembership.update({
          where: { id: currentOwner.id },
          data: { role: 'manager' },
        });
        const team = await tx.v1Team.update({
          where: { id: target.teamId },
          data: { ownerUserId: target.userId },
        });

        await tx.v1StatusChangeLog.createMany({
          data: [
            {
              targetType: 'team_membership',
              targetId: target.id,
              fromStatus: target.role,
              toStatus: 'owner',
              actorType: 'user',
              actorUserId: user.id,
              reason: 'team_owner_delegated',
            },
            {
              targetType: 'team_membership',
              targetId: currentOwner.id,
              fromStatus: 'owner',
              toStatus: 'manager',
              actorType: 'user',
              actorUserId: user.id,
              reason: 'team_owner_delegated_previous_owner_demoted',
            },
            {
              targetType: 'team',
              targetId: target.teamId,
              fromStatus: currentOwner.userId,
              toStatus: target.userId,
              actorType: 'user',
              actorUserId: user.id,
              reason: 'team_owner_user_changed',
            },
          ],
        });

        return { delegatedOwner, team };
      });

      return {
        membershipId: result.delegatedOwner.id,
        teamId: result.delegatedOwner.teamId,
        role: result.delegatedOwner.role,
        managerCount: result.team.managerCount,
      };
    }
    if (target.role === 'owner') {
      throw stateConflict('Owner role cannot be changed by this API');
    }
    // manager 는 member 대상만 역할 변경 가능 (다른 manager·owner 변경은 owner 전용)
    if (actorRole === 'manager' && target.role !== 'member') {
      throw new ForbiddenException({
        code: 'PERMISSION_DENIED',
        message: 'Managers can only change member roles',
      });
    }
    if (dto.role === 'manager' && target.team.managerCount >= 5) {
      throw stateConflict('Manager count cannot exceed 5', 'MANAGER_LIMIT_EXCEEDED');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.v1TeamMembership.update({
        where: { id: target.id },
        data: { role: dto.role },
      });
      const managerDelta = dto.role === 'manager' ? 1 : -1;
      const team = await tx.v1Team.update({
        where: { id: target.teamId },
        data: { managerCount: { increment: managerDelta } },
      });

      await tx.v1StatusChangeLog.create({
        data: {
          targetType: 'team_membership',
          targetId: target.id,
          fromStatus: target.role,
          toStatus: dto.role,
          actorType: 'user',
          actorUserId: user.id,
          reason: 'team_membership_role_changed',
        },
      });

      return { updated, team };
    });

    return {
      membershipId: result.updated.id,
      teamId: result.updated.teamId,
      role: result.updated.role,
      managerCount: result.team.managerCount,
    };
  }

  async removeMembership(
    user: V1AuthUser,
    membershipId: string,
    dto: RemoveTeamMembershipDto,
  ) {
    this.assertActiveAccount(user);
    const target = await this.getMembershipWithTeam(membershipId);
    const actorRole = await this.getManagementActor(user, target.teamId);

    if (target.role === 'owner') {
      throw stateConflict('Owner cannot be removed by this API');
    }
    // manager 는 member 대상만 추방 가능 (다른 manager·owner 추방은 owner 전용)
    if (actorRole === 'manager' && target.role !== 'member') {
      throw new ForbiddenException({
        code: 'PERMISSION_DENIED',
        message: 'Managers can only remove members',
      });
    }
    if (target.status !== 'active') {
      throw new ConflictException({
        code: 'ALREADY_PROCESSED',
        message: 'Membership is already inactive',
      });
    }

    const removedAt = new Date();
    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.v1TeamMembership.update({
        where: { id: target.id },
        data: {
          status: 'removed',
          removedByUserId: user.id,
          leftAt: removedAt,
        },
      });
      const team = await tx.v1Team.update({
        where: { id: target.teamId },
        data: {
          memberCount: { decrement: 1 },
          ...(target.role === 'manager' ? { managerCount: { decrement: 1 } } : {}),
        },
      });

      await tx.v1StatusChangeLog.create({
        data: {
          targetType: 'team_membership',
          targetId: target.id,
          fromStatus: target.status,
          toStatus: 'removed',
          actorType: 'user',
          actorUserId: user.id,
          reason: dto.reason ?? 'team_membership_removed',
        },
      });
      await this.leaveTeamChatParticipant(
        tx,
        target.teamId,
        target.userId,
        user.id,
        removedAt,
        dto.reason ?? 'team_membership_removed',
      );

      return { updated, team };
    });

    return {
      membershipId: result.updated.id,
      teamId: result.updated.teamId,
      status: result.updated.status,
      removedAt,
      memberCount: result.team.memberCount,
      managerCount: result.team.managerCount,
    };
  }

  async createJoinApplication(
    user: V1AuthUser,
    teamId: string,
    dto: CreateTeamJoinApplicationDto,
  ) {
    this.assertActiveAccount(user);
    const team = await this.getPublicTeam(teamId, user);
    const viewer = this.getViewer(team, user);
    const reasonCode = getJoinReason(team, viewer, user);

    if (reasonCode !== 'OK') {
      throw stateConflict(getJoinReasonMessage(reasonCode), reasonCode);
    }

    const existing = team.joinApplications[0] ?? null;
    const application = await this.prisma.$transaction(async (tx) => {
      const nextApplication = existing
        ? await tx.v1TeamJoinApplication.update({
            where: { id: existing.id },
            data: {
              status: 'requested',
              message: dto.message ?? null,
              reviewedByUserId: null,
              reviewedAt: null,
              withdrawnAt: null,
            },
          })
        : await tx.v1TeamJoinApplication.create({
            data: {
              teamId: team.id,
              applicantUserId: user.id,
              status: 'requested',
              message: dto.message ?? null,
            },
          });

      await tx.v1StatusChangeLog.create({
        data: {
          targetType: 'team_join_application',
          targetId: nextApplication.id,
          fromStatus: existing?.status ?? null,
          toStatus: 'requested',
          actorType: 'user',
          actorUserId: user.id,
          reason: existing ? 'team_join_application_resubmitted' : 'team_join_application_created',
        },
      });

      return nextApplication;
    });

    // 알림: 팀 manager+에게 신청 접수 안내 (fire-and-forget — 수신자 조회 실패도 본 요청을 깨지 않음)
    this.notifications.emitToManyDeferred(
      async () =>
        (
          await this.prisma.v1TeamMembership.findMany({
            where: { teamId: team.id, status: 'active', role: { in: ['owner', 'manager'] } },
            select: { userId: true },
          })
        ).map((m) => m.userId),
      'team_join_application_received',
      team.id,
    );

    return {
      applicationId: application.id,
      teamId: application.teamId,
      status: application.status,
      joinState: 'requested',
      requiresApproval: true,
      immediateJoinSupported: false,
    };
  }

  async joinApplications(
    user: V1AuthUser,
    teamId: string,
    query: ListTeamJoinApplicationsQueryDto,
  ) {
    const { team, membership } = await this.getManageableTeam(user, teamId);
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 50);
    const applications = await this.prisma.v1TeamJoinApplication.findMany({
      where: {
        teamId: team.id,
        ...(query.status ? { status: query.status } : { status: 'requested' }),
      },
      orderBy: [{ createdAt: 'desc' }],
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      include: {
        applicantUser: {
          select: {
            id: true,
            profile: { select: { nickname: true, displayName: true, profileImageUrl: true } },
            reputationSummary: { select: { trustState: true } },
          },
        },
      },
    });

    const pageItems = applications.slice(0, limit);
    const hasNext = applications.length > limit;

    return {
      teamId: team.id,
      reviewerRole: membership.role,
      items: pageItems.map((application) => ({
        applicationId: application.id,
        status: application.status,
        message: application.message,
        createdAt: application.createdAt,
        applicant: {
          userId: application.applicantUser.id,
          displayName:
            application.applicantUser.profile?.displayName ??
            application.applicantUser.profile?.nickname ??
            '신청자',
          profileImageUrl: application.applicantUser.profile?.profileImageUrl ?? null,
          trustState: application.applicantUser.reputationSummary?.trustState ?? 'none',
        },
      })),
      pageInfo: {
        nextCursor: hasNext ? pageItems.at(-1)?.id ?? null : null,
        hasNext,
      },
    };
  }

  async withdrawJoinApplication(
    user: V1AuthUser,
    applicationId: string,
    dto: WithdrawTeamJoinApplicationDto,
  ) {
    this.assertActiveAccount(user);
    const application = await this.getJoinApplicationWithTeam(applicationId);

    if (application.applicantUserId !== user.id) {
      throw new ForbiddenException({
        code: 'PERMISSION_DENIED',
        message: 'Only the applicant can withdraw this team join application',
      });
    }
    if (application.status !== 'requested') {
      throw new ConflictException({
        code: 'ALREADY_PROCESSED',
        message: 'Only requested join applications can be withdrawn',
      });
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const nextApplication = await tx.v1TeamJoinApplication.update({
        where: { id: application.id },
        data: {
          status: 'withdrawn',
          withdrawnAt: new Date(),
        },
      });

      await tx.v1StatusChangeLog.create({
        data: {
          targetType: 'team_join_application',
          targetId: application.id,
          fromStatus: application.status,
          toStatus: 'withdrawn',
          actorType: 'user',
          actorUserId: user.id,
          reason: dto.reason ?? 'applicant_withdrawn',
        },
      });

      return nextApplication;
    });

    return {
      applicationId: updated.id,
      teamId: updated.teamId,
      status: updated.status,
      joinState: 'withdrawn',
    };
  }

  async approveJoinApplication(
    user: V1AuthUser,
    applicationId: string,
    dto: ApproveTeamJoinApplicationDto,
  ) {
    this.assertActiveAccount(user);
    const application = await this.getJoinApplicationWithTeam(applicationId);
    await this.assertManagerOrOwner(user, application.teamId);

    if (application.status !== 'requested') {
      throw stateConflict('Only requested join applications can be approved');
    }
    if (application.team.status !== 'active' || application.team.joinPolicy === 'closed') {
      throw stateConflict('Team is not accepting join applications');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const updatedApplication = await tx.v1TeamJoinApplication.update({
        where: { id: application.id },
        data: {
          status: 'approved',
          reviewedByUserId: user.id,
          reviewedAt: new Date(),
        },
      });

      const existingMembership = await tx.v1TeamMembership.findUnique({
        where: {
          teamId_userId: {
            teamId: application.teamId,
            userId: application.applicantUserId,
          },
        },
      });
      const wasActive = existingMembership?.status === 'active';
      const membership = await tx.v1TeamMembership.upsert({
        where: {
          teamId_userId: {
            teamId: application.teamId,
            userId: application.applicantUserId,
          },
        },
        update: {
          role: 'member',
          status: 'active',
          joinedAt: existingMembership?.joinedAt ?? new Date(),
          leftAt: null,
          removedByUserId: null,
        },
        create: {
          teamId: application.teamId,
          userId: application.applicantUserId,
          role: 'member',
          status: 'active',
          joinedAt: new Date(),
        },
      });

      const team = wasActive
        ? application.team
        : await tx.v1Team.update({
            where: { id: application.teamId },
            data: { memberCount: { increment: 1 } },
          });

      await tx.v1StatusChangeLog.createMany({
        data: [
          {
            targetType: 'team_join_application',
            targetId: application.id,
            fromStatus: application.status,
            toStatus: 'approved',
            actorType: 'user',
            actorUserId: user.id,
            reason: dto.note ?? 'team_join_approved',
          },
          {
            targetType: 'team_membership',
            targetId: membership.id,
            fromStatus: existingMembership?.status ?? null,
            toStatus: 'active',
            actorType: 'user',
            actorUserId: user.id,
            reason: 'team_join_application_approved',
          },
        ],
      });
      await this.ensureTeamChatParticipant(
        tx,
        application.teamId,
        application.applicantUserId,
        user.id,
        'team_join_application_approved',
      );

      return { updatedApplication, membership, team };
    });

    // 알림: 신청자에게 수락 안내 (fire-and-forget)
    void this.notifications.emitNotification(
      application.applicantUserId,
      'team_join_application_accepted',
      application.teamId,
    );

    return {
      applicationId: result.updatedApplication.id,
      teamId: result.updatedApplication.teamId,
      status: result.updatedApplication.status,
      joinState: 'member',
      membershipId: result.membership.id,
      memberCount: result.team.memberCount,
    };
  }

  async rejectJoinApplication(
    user: V1AuthUser,
    applicationId: string,
    dto: RejectTeamJoinApplicationDto,
  ) {
    this.assertActiveAccount(user);
    const application = await this.getJoinApplicationWithTeam(applicationId);
    await this.assertManagerOrOwner(user, application.teamId);

    if (application.status !== 'requested') {
      throw stateConflict('Only requested join applications can be rejected');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const nextApplication = await tx.v1TeamJoinApplication.update({
        where: { id: application.id },
        data: {
          status: 'rejected',
          reviewedByUserId: user.id,
          reviewedAt: new Date(),
        },
      });

      await tx.v1StatusChangeLog.create({
        data: {
          targetType: 'team_join_application',
          targetId: application.id,
          fromStatus: application.status,
          toStatus: 'rejected',
          actorType: 'user',
          actorUserId: user.id,
          reason: dto.reason ?? 'team_join_rejected',
        },
      });

      return nextApplication;
    });

    // 알림: 신청자에게 거절 안내 (fire-and-forget)
    void this.notifications.emitNotification(
      application.applicantUserId,
      'team_join_application_rejected',
      application.teamId,
    );

    return {
      applicationId: updated.id,
      teamId: updated.teamId,
      status: updated.status,
      joinState: 'rejected',
    };
  }

  // ── 팀 초대 (이메일 기반) ────────────────────────────────────────────

  async createInvitation(user: V1AuthUser, teamId: string, dto: CreateTeamInvitationDto) {
    this.assertActiveAccount(user);
    await this.assertManagerOrOwner(user, teamId);

    const team = await this.prisma.v1Team.findFirst({
      where: { id: teamId, deletedAt: null },
      select: { id: true, name: true, status: true },
    });
    if (!team) {
      throw new NotFoundException({ code: 'NOT_FOUND_OR_ARCHIVED', message: 'Team was not found' });
    }
    if (team.status !== 'active') {
      throw stateConflict('Team is not active', 'STATE_CONFLICT');
    }

    const invitedUser = await this.prisma.v1User.findUnique({
      where: { email: dto.invitedEmail },
      select: { id: true },
    });
    if (!invitedUser) {
      throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'User with this email was not found' });
    }

    const existingMembership = await this.prisma.v1TeamMembership.findUnique({
      where: { teamId_userId: { teamId, userId: invitedUser.id } },
      select: { status: true },
    });
    if (existingMembership?.status === 'active') {
      throw new ConflictException({ code: 'ALREADY_MEMBER', message: 'User is already an active team member' });
    }

    const existing = await this.prisma.v1TeamInvitation.findUnique({
      where: { teamId_invitedUserId: { teamId, invitedUserId: invitedUser.id } },
      select: { id: true, status: true },
    });

    if (existing?.status === 'pending') {
      return {
        invitationId: existing.id,
        teamId,
        invitedUserId: invitedUser.id,
        status: 'pending' as const,
        alreadyInvited: true,
      };
    }

    const invitation = existing
      ? await this.prisma.v1TeamInvitation.update({
          where: { id: existing.id },
          data: {
            status: 'pending',
            invitedByUserId: user.id,
            message: dto.message ?? null,
            respondedAt: null,
          },
          select: { id: true, status: true },
        })
      : await this.prisma.v1TeamInvitation.create({
          data: {
            teamId,
            invitedUserId: invitedUser.id,
            invitedByUserId: user.id,
            status: 'pending',
            message: dto.message ?? null,
          },
          select: { id: true, status: true },
        });

    // 알림: 초대받은 사용자에게 안내 (fire-and-forget)
    void this.notifications.emitNotification(invitedUser.id, 'team_invitation_received', teamId);

    return {
      invitationId: invitation.id,
      teamId,
      invitedUserId: invitedUser.id,
      status: invitation.status,
      alreadyInvited: false,
    };
  }

  async listInvitations(user: V1AuthUser, teamId: string) {
    await this.assertManagerOrOwner(user, teamId);

    const invitations = await this.prisma.v1TeamInvitation.findMany({
      where: { teamId, status: 'pending' },
      orderBy: [{ createdAt: 'desc' }],
      include: {
        invitedUser: {
          select: {
            id: true,
            profile: { select: { nickname: true, displayName: true, profileImageUrl: true } },
          },
        },
      },
    });

    return {
      teamId,
      items: invitations.map((inv) => ({
        invitationId: inv.id,
        teamId: inv.teamId,
        invitedUserId: inv.invitedUserId,
        status: inv.status,
        message: inv.message,
        createdAt: inv.createdAt,
        invitedUser: {
          userId: inv.invitedUser.id,
          displayName:
            inv.invitedUser.profile?.displayName ??
            inv.invitedUser.profile?.nickname ??
            '초대된 사용자',
          profileImageUrl: inv.invitedUser.profile?.profileImageUrl ?? null,
        },
      })),
    };
  }

  async cancelInvitation(user: V1AuthUser, teamId: string, invitationId: string) {
    await this.assertManagerOrOwner(user, teamId);

    const invitation = await this.prisma.v1TeamInvitation.findUnique({
      where: { id: invitationId },
      select: { id: true, teamId: true, status: true },
    });
    if (!invitation) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Invitation was not found' });
    }
    if (invitation.teamId !== teamId) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Invitation does not belong to this team' });
    }

    if (invitation.status === 'cancelled') {
      return { invitationId: invitation.id, status: 'cancelled' as const, alreadyCancelled: true };
    }
    if (invitation.status !== 'pending') {
      throw stateConflict(
        `Invitation in status '${invitation.status}' cannot be cancelled`,
        'STATE_CONFLICT',
      );
    }

    const updated = await this.prisma.v1TeamInvitation.update({
      where: { id: invitationId },
      data: { status: 'cancelled' },
      select: { id: true, status: true },
    });

    return { invitationId: updated.id, status: updated.status, alreadyCancelled: false };
  }

  async myInvitations(user: V1AuthUser) {
    const invitations = await this.prisma.v1TeamInvitation.findMany({
      where: { invitedUserId: user.id, status: 'pending' },
      orderBy: [{ createdAt: 'desc' }],
      include: {
        team: {
          select: {
            id: true,
            name: true,
            sportId: true,
            status: true,
            profile: { select: { logoUrl: true, description: true } },
          },
        },
        invitedByUser: {
          select: {
            id: true,
            profile: { select: { nickname: true, displayName: true, profileImageUrl: true } },
          },
        },
      },
    });

    return {
      items: invitations.map((inv) => ({
        invitationId: inv.id,
        teamId: inv.teamId,
        status: inv.status,
        message: inv.message,
        createdAt: inv.createdAt,
        team: {
          teamId: inv.team.id,
          name: inv.team.name,
          sportId: inv.team.sportId,
          logoUrl: inv.team.profile?.logoUrl ?? null,
          introductionPreview: inv.team.profile?.description
            ? inv.team.profile.description.slice(0, 120)
            : null,
        },
        invitedBy: {
          userId: inv.invitedByUser.id,
          displayName:
            inv.invitedByUser.profile?.displayName ??
            inv.invitedByUser.profile?.nickname ??
            '팀 관계자',
          profileImageUrl: inv.invitedByUser.profile?.profileImageUrl ?? null,
        },
      })),
    };
  }

  async acceptInvitation(user: V1AuthUser, invitationId: string) {
    this.assertActiveAccount(user);
    const invitation = await this.prisma.v1TeamInvitation.findUnique({
      where: { id: invitationId },
      select: {
        id: true,
        teamId: true,
        invitedUserId: true,
        invitedByUserId: true,
        status: true,
        team: { select: { id: true, name: true, status: true, memberCount: true } },
      },
    });
    if (!invitation) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Invitation was not found' });
    }
    if (invitation.invitedUserId !== user.id) {
      throw new ForbiddenException({ code: 'PERMISSION_DENIED', message: 'Only the invited user can accept this invitation' });
    }

    if (invitation.status === 'accepted') {
      const existingMembership = await this.prisma.v1TeamMembership.findUnique({
        where: { teamId_userId: { teamId: invitation.teamId, userId: user.id } },
        select: { id: true },
      });
      return {
        invitationId: invitation.id,
        teamId: invitation.teamId,
        membershipId: existingMembership?.id ?? null,
        status: 'accepted' as const,
        alreadyProcessed: true,
      };
    }
    if (invitation.status !== 'pending') {
      throw stateConflict(
        `Invitation in status '${invitation.status}' cannot be accepted`,
        'STATE_CONFLICT',
      );
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const updatedInvitation = await tx.v1TeamInvitation.update({
        where: { id: invitation.id },
        data: { status: 'accepted', respondedAt: new Date() },
      });

      const existingMembership = await tx.v1TeamMembership.findUnique({
        where: { teamId_userId: { teamId: invitation.teamId, userId: user.id } },
      });
      const wasActive = existingMembership?.status === 'active';

      const membership = await tx.v1TeamMembership.upsert({
        where: { teamId_userId: { teamId: invitation.teamId, userId: user.id } },
        update: {
          role: 'member',
          status: 'active',
          joinedAt: existingMembership?.joinedAt ?? new Date(),
          leftAt: null,
          removedByUserId: null,
        },
        create: {
          teamId: invitation.teamId,
          userId: user.id,
          role: 'member',
          status: 'active',
          joinedAt: new Date(),
        },
      });

      const team = wasActive
        ? invitation.team
        : await tx.v1Team.update({
            where: { id: invitation.teamId },
            data: { memberCount: { increment: 1 } },
          });

      await tx.v1StatusChangeLog.createMany({
        data: [
          {
            targetType: 'team_membership',
            targetId: membership.id,
            fromStatus: existingMembership?.status ?? null,
            toStatus: 'active',
            actorType: 'user',
            actorUserId: user.id,
            reason: 'team_invitation_accepted',
          },
        ],
      });
      await this.ensureTeamChatParticipant(
        tx,
        invitation.teamId,
        user.id,
        user.id,
        'team_invitation_accepted',
      );

      return { updatedInvitation, membership, team };
    });

    // 알림: 초대한 사람에게 수락 안내 (fire-and-forget)
    void this.notifications.emitNotification(
      invitation.invitedByUserId,
      'team_invitation_accepted',
      invitation.teamId,
    );

    return {
      invitationId: result.updatedInvitation.id,
      teamId: invitation.teamId,
      membershipId: result.membership.id,
      status: result.updatedInvitation.status,
      alreadyProcessed: false,
    };
  }

  async declineInvitation(user: V1AuthUser, invitationId: string) {
    this.assertActiveAccount(user);
    const invitation = await this.prisma.v1TeamInvitation.findUnique({
      where: { id: invitationId },
      select: { id: true, teamId: true, invitedUserId: true, status: true },
    });
    if (!invitation) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Invitation was not found' });
    }
    if (invitation.invitedUserId !== user.id) {
      throw new ForbiddenException({ code: 'PERMISSION_DENIED', message: 'Only the invited user can decline this invitation' });
    }

    if (invitation.status === 'declined') {
      return { invitationId: invitation.id, status: 'declined' as const, alreadyProcessed: true };
    }
    if (invitation.status !== 'pending') {
      throw stateConflict(
        `Invitation in status '${invitation.status}' cannot be declined`,
        'STATE_CONFLICT',
      );
    }

    const updated = await this.prisma.v1TeamInvitation.update({
      where: { id: invitationId },
      data: { status: 'declined', respondedAt: new Date() },
      select: { id: true, status: true },
    });

    return { invitationId: updated.id, status: updated.status, alreadyProcessed: false };
  }

  // ── 팀 초대 끝 ──────────────────────────────────────────────────────

  private async getPublicTeam(teamId: string, user: V1AuthUser | null) {
    const team = await this.prisma.v1Team.findFirst({
      where: { id: teamId, status: 'active', deletedAt: null },
      include: this.teamInclude(user),
    });

    if (!team) {
      throw new NotFoundException({
        code: 'NOT_FOUND_OR_ARCHIVED',
        message: 'Team was not found',
      });
    }

    return team;
  }

  private async ensureTeamChatParticipant(
    tx: Prisma.TransactionClient,
    teamId: string,
    userId: string,
    actorUserId: string,
    reason: string,
  ) {
    const existingRoom = await tx.v1ChatRoom.findUnique({ where: { teamId }, select: { id: true } });
    const room = existingRoom
      ? await tx.v1ChatRoom.update({
          where: { id: existingRoom.id },
          data: { status: 'active' },
          select: { id: true },
        })
      : await tx.v1ChatRoom.create({
          data: { teamId, status: 'active' },
          select: { id: true },
        });
    const existingParticipant = await tx.v1ChatRoomParticipant.findUnique({
      where: { chatRoomId_userId: { chatRoomId: room.id, userId } },
      select: { id: true, status: true },
    });
    const participant = existingParticipant
      ? await tx.v1ChatRoomParticipant.update({
          where: { id: existingParticipant.id },
          data: { status: 'active', leftAt: null },
          select: { id: true },
        })
      : await tx.v1ChatRoomParticipant.create({
          data: { chatRoomId: room.id, userId, status: 'active' },
          select: { id: true },
        });

    if (!existingParticipant || existingParticipant.status !== 'active') {
      await tx.v1StatusChangeLog.create({
        data: {
          targetType: 'chat_room_participant',
          targetId: participant.id,
          fromStatus: existingParticipant?.status ?? null,
          toStatus: 'active',
          actorType: 'user',
          actorUserId,
          reason,
        },
      });
    }

    return { room, participant };
  }

  private async leaveTeamChatParticipant(
    tx: Prisma.TransactionClient,
    teamId: string,
    userId: string,
    actorUserId: string,
    leftAt: Date,
    reason: string,
  ) {
    const room = await tx.v1ChatRoom.findUnique({ where: { teamId }, select: { id: true } });
    if (!room) return null;
    const participant = await tx.v1ChatRoomParticipant.findUnique({
      where: { chatRoomId_userId: { chatRoomId: room.id, userId } },
      select: { id: true, status: true },
    });
    if (!participant || participant.status === 'left') return participant;

    const updated = await tx.v1ChatRoomParticipant.update({
      where: { id: participant.id },
      data: { status: 'left', leftAt },
      select: { id: true },
    });
    await tx.v1StatusChangeLog.create({
      data: {
        targetType: 'chat_room_participant',
        targetId: participant.id,
        fromStatus: participant.status,
        toStatus: 'left',
        actorType: 'user',
        actorUserId,
        reason,
      },
    });

    return updated;
  }

  private async getActiveTeamMembership(user: V1AuthUser, teamId: string) {
    const team = await this.prisma.v1Team.findFirst({
      where: { id: teamId, status: 'active', deletedAt: null },
      include: {
        memberships: {
          where: { userId: user.id, status: 'active' },
          take: 1,
        },
      },
    });

    if (!team) {
      throw new NotFoundException({
        code: 'NOT_FOUND_OR_ARCHIVED',
        message: 'Team was not found',
      });
    }

    const membership = team.memberships[0];
    if (!membership) {
      throw new ForbiddenException({
        code: 'PERMISSION_DENIED',
        message: 'Only active team members can access this team surface',
      });
    }

    return { team, membership };
  }

  private async getManageableTeam(user: V1AuthUser, teamId: string) {
    const { team, membership } = await this.getActiveTeamMembership(user, teamId);
    if (membership.role !== 'owner' && membership.role !== 'manager') {
      throw new ForbiddenException({
        code: 'PERMISSION_DENIED',
        message: 'Only team owners or managers can manage this team',
      });
    }

    return { team, membership };
  }

  private async getMembershipWithTeam(membershipId: string) {
    const membership = await this.prisma.v1TeamMembership.findFirst({
      where: {
        id: membershipId,
        team: { deletedAt: null },
      },
      include: { team: true },
    });

    if (!membership) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Team membership was not found',
      });
    }

    return membership;
  }

  private async getJoinApplicationWithTeam(applicationId: string) {
    const application = await this.prisma.v1TeamJoinApplication.findFirst({
      where: {
        id: applicationId,
        team: { deletedAt: null },
      },
      include: { team: true },
    });

    if (!application) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Team join application was not found',
      });
    }

    return application;
  }

  private async assertManagerOrOwner(user: V1AuthUser, teamId: string) {
    await this.getManagementActor(user, teamId);
  }

  // owner/manager 멤버십 단일 조회 소스 — 권한 검증 + 행위자 role 반환
  private async getManagementActor(
    user: V1AuthUser,
    teamId: string,
  ): Promise<'owner' | 'manager'> {
    const membership = await this.prisma.v1TeamMembership.findFirst({
      where: { teamId, userId: user.id, role: { in: ['owner', 'manager'] }, status: 'active' },
      select: { role: true },
    });

    if (!membership) {
      throw new ForbiddenException({
        code: 'PERMISSION_DENIED',
        message: 'Only team owners or managers can perform this action',
      });
    }
    return membership.role as 'owner' | 'manager';
  }

  private assertActiveAccount(user: V1AuthUser) {
    if (user.accountStatus !== 'active') {
      throw new ForbiddenException({
        code: 'PERMISSION_DENIED',
        message: 'Account cannot mutate teams',
      });
    }
  }

  private async validateMasterRefs(sportId: string, regionId: string | null) {
    const sport = await this.prisma.v1Sport.findFirst({
      where: { id: sportId, isActive: true },
      select: { id: true },
    });
    if (!sport) {
      throw validationError('sportId is invalid or inactive', 'sportId');
    }

    if (regionId) {
      const region = await this.prisma.v1Region.findFirst({
        where: { id: regionId, isActive: true, level: 2 },
        select: { id: true },
      });
      if (!region) {
        throw validationError('regionId must be an active district region', 'regionId');
      }
    }
  }

  private teamInclude(user: V1AuthUser | null) {
    return {
      sport: { select: { id: true, name: true } },
      region: { select: { id: true, name: true } },
      profile: {
        select: {
          logoUrl: true,
          coverImageUrl: true,
          description: true,
          activityNote: true,
          skillNote: true,
          minSportLevel: { select: { id: true, code: true, name: true, sortOrder: true, sportId: true } },
          maxSportLevel: { select: { id: true, code: true, name: true, sortOrder: true, sportId: true } },
          genderRule: true,
        },
      },
      memberships: {
        where: user ? { OR: [{ status: 'active' }, { userId: user.id }] } : { status: 'active' },
        include: {
          user: {
            select: {
              profile: { select: { nickname: true, displayName: true, profileImageUrl: true } },
            },
          },
        },
        orderBy: [{ role: 'asc' }, { joinedAt: 'asc' }],
      },
      joinApplications: user
        ? {
            where: { applicantUserId: user.id },
            orderBy: { createdAt: 'desc' },
            take: 1,
          }
        : false,
      trustScore: { select: { trustState: true, mannerScore: true, matchCount: true } },
      ownerUser: {
        select: {
          id: true,
          profile: { select: { nickname: true, displayName: true, profileImageUrl: true } },
        },
      },
    } satisfies Prisma.V1TeamInclude;
  }

  private toListItem(team: TeamWithRelations, user: V1AuthUser | null) {
    const viewer = this.getViewer(team, user);
    return {
      id: team.id,
      teamId: team.id,
      name: team.name,
      logoUrl: team.profile?.logoUrl ?? null,
      coverImageUrl: team.profile?.coverImageUrl ?? null,
      sportName: team.sport.name,
      sport: { sportId: team.sport.id, name: team.sport.name },
      regionName: team.region?.name ?? null,
      region: team.region ? { regionId: team.region.id, name: team.region.name } : null,
      introductionPreview: team.profile?.description ? team.profile.description.slice(0, 120) : null,
      skillLevelText: team.profile?.skillNote ?? null,
      levelLabel: formatLevelRange(team.profile?.minSportLevel, team.profile?.maxSportLevel, team.profile?.skillNote),
      minLevel: team.profile?.minSportLevel ? { code: team.profile.minSportLevel.code, name: team.profile.minSportLevel.name } : null,
      maxLevel: team.profile?.maxSportLevel ? { code: team.profile.maxSportLevel.code, name: team.profile.maxSportLevel.name } : null,
      genderRule: team.profile?.genderRule ?? '성별 무관',
      joinPolicy: team.joinPolicy,
      memberCount: team.memberCount,
      trustState: team.trustScore?.trustState ?? 'none',
      viewerRole: viewer.role,
      viewerJoinState: viewer.joinState,
    };
  }

  private getViewer(team: TeamWithRelations, user: V1AuthUser | null) {
    if (!user) {
      return {
        role: 'none',
        membershipId: null,
        joinState: 'none',
        canRequestJoin: false,
        disabledReason: 'LOGIN_REQUIRED',
        manageRoute: null,
      };
    }

    const membership = team.memberships.find(
      (item) => item.userId === user.id && item.status === 'active',
    );
    if (membership) {
      return {
        role: membership.role,
        membershipId: membership.id,
        joinState: 'member',
        canRequestJoin: false,
        disabledReason: 'ALREADY_MEMBER',
        manageRoute:
          membership.role === 'owner' || membership.role === 'manager'
            ? `/teams/${team.id}/manage`
            : null,
      };
    }

    const application = team.joinApplications[0];
    if (application) {
      return {
        role: 'none',
        membershipId: null,
        joinState: application.status === 'approved' ? 'approved' : application.status,
        canRequestJoin: application.status !== 'requested',
        disabledReason: application.status === 'requested' ? 'ALREADY_REQUESTED' : null,
        manageRoute: null,
      };
    }

    return {
      role: 'none',
      membershipId: null,
      joinState: 'none',
      canRequestJoin: team.joinPolicy === 'approval_required',
      disabledReason: team.joinPolicy === 'approval_required' ? null : 'JOIN_CLOSED',
      manageRoute: null,
    };
  }

  private canViewMembers(
    team: TeamWithRelations,
    viewer: ReturnType<TeamsService['getViewer']>,
  ) {
    if (viewer.role === 'owner' || viewer.role === 'manager') return true;
    return viewer.role === 'member' && team.membersVisible;
  }
}

function getTeamOrderBy(sort: TeamsQueryDto['sort']): Prisma.V1TeamOrderByWithRelationInput[] {
  if (sort === 'latest') return [{ createdAt: 'desc' }];
  if (sort === 'member_count') return [{ memberCount: 'desc' }, { createdAt: 'desc' }];
  return [{ createdAt: 'desc' }];
}

function getTeamGenderRuleWhere(genderRule: NonNullable<TeamsQueryDto['genderRule']>): Prisma.V1TeamWhereInput {
  if (genderRule === '무관' || genderRule === '성별 무관') {
    return {
      OR: [
        { profile: { genderRule: { in: ['성별 무관', '무관'] } } },
        { profile: { genderRule: null } },
      ],
    };
  }

  return { profile: { genderRule } };
}

function teamLevelCodeWhere(levelCodes: ReturnType<typeof parseLevelCodes>): Prisma.V1TeamWhereInput {
  if (levelCodes.length === 0) return {};

  return {
    profile: {
      OR: levelCodes.map((code) => {
        const order = SPORT_LEVEL_CODES.indexOf(code);
        return {
          minSportLevel: { is: { code: { in: SPORT_LEVEL_CODES.slice(0, order + 1) } } },
          maxSportLevel: { is: { code: { in: SPORT_LEVEL_CODES.slice(order) } } },
        };
      }),
    },
  };
}

function getJoinReason(
  team: V1Team,
  viewer: ReturnType<TeamsService['getViewer']>,
  user: V1AuthUser,
) {
  if (user.accountStatus !== 'active') return 'BLOCKED_USER';
  if (team.status !== 'active') return 'TEAM_NOT_ACTIVE';
  if (viewer.joinState === 'member') return 'ALREADY_MEMBER';
  if (viewer.joinState === 'requested') return 'ALREADY_REQUESTED';
  if (team.joinPolicy === 'closed') return 'JOIN_CLOSED';
  return 'OK';
}

function getJoinReasonMessage(reasonCode: string) {
  const messages: Record<string, string> = {
    OK: '가입 신청할 수 있어요.',
    ALREADY_MEMBER: '이미 팀 멤버예요.',
    ALREADY_REQUESTED: '이미 가입 신청해서 승인을 기다리고 있어요.',
    JOIN_CLOSED: '가입 신청이 마감된 팀이에요.',
    TEAM_NOT_ACTIVE: '지금은 가입할 수 없는 팀이에요.',
    BLOCKED_USER: '신청할 수 없는 계정 상태예요.',
  };

  return messages[reasonCode] ?? '가입 신청할 수 없어요.';
}

function validationError(message: string, field: string) {
  return new BadRequestException({
    code: 'VALIDATION_FAILED',
    message,
    details: { field },
  });
}

function stateConflict(message: string, code = 'STATE_CONFLICT') {
  return new ConflictException({
    code,
    message,
  });
}
