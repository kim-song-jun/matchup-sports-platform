import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { V1AuthUser } from '../auth/v1-auth-user';
import { PrismaService } from '../prisma/prisma.service';
import {
  AdminListQueryDto,
  AdminLogsQueryDto,
  AdminInquiryListQueryDto,
  AdminMatchListQueryDto,
  AdminOverviewQueryDto,
  AdminTeamListQueryDto,
  AdminTeamMatchListQueryDto,
  AdminNoticeListQueryDto,
  AdminUserListQueryDto,
  ChangeMatchStatusDto,
  ChangeInquiryStatusDto,
  ChangeTeamMatchStatusDto,
  ChangeTeamStatusDto,
  ChangeUserStatusDto,
  CreateAdminNoticeDto,
  DeleteAdminUserDto,
  GrantAdminDto,
  ReplyInquiryDto,
  UpdateAdminNoticeDto,
  UpdateAdminDto,
} from './dto/admin.dto';

type ActiveAdmin = {
  id: string;
  userId: string;
  adminRole: 'owner' | 'ops' | 'support';
  status: 'active';
};

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async me(user: V1AuthUser) {
    const admin = await this.getActiveAdmin(user.id);
    return {
      userId: admin.userId,
      adminUserId: admin.id,
      adminRole: admin.adminRole,
      status: admin.status,
      capabilities: getCapabilities(admin.adminRole),
      lastActiveAt: null,
    };
  }

  async overview(user: V1AuthUser, _query: AdminOverviewQueryDto) {
    await this.getActiveAdmin(user.id);
    const [
      activeUsers,
      suspendedUsers,
      blockedUsers,
      withdrawalPendingUsers,
      recruitingMatches,
      cancelledMatches,
      completedMatches,
      activeTeams,
      suspendedTeams,
      archivedTeams,
      recruitingTeamMatches,
      matchedTeamMatches,
      cancelledTeamMatches,
      recentActions,
    ] = await Promise.all([
      this.prisma.v1User.count({ where: { accountStatus: 'active' } }),
      this.prisma.v1User.count({ where: { accountStatus: 'suspended' } }),
      this.prisma.v1User.count({ where: { accountStatus: 'blocked' } }),
      this.prisma.v1User.count({ where: { accountStatus: 'withdrawal_pending' } }),
      this.prisma.v1Match.count({ where: { status: 'recruiting' } }),
      this.prisma.v1Match.count({ where: { status: 'cancelled' } }),
      this.prisma.v1Match.count({ where: { status: 'completed' } }),
      this.prisma.v1Team.count({ where: { status: 'active' } }),
      this.prisma.v1Team.count({ where: { status: 'suspended' } }),
      this.prisma.v1Team.count({ where: { status: 'archived' } }),
      this.prisma.v1TeamMatch.count({ where: { status: 'recruiting' } }),
      this.prisma.v1TeamMatch.count({ where: { status: 'matched' } }),
      this.prisma.v1TeamMatch.count({ where: { status: 'cancelled' } }),
      this.prisma.v1AdminActionLog.findMany({ orderBy: { createdAt: 'desc' }, take: 10 }),
    ]);

    return {
      users: { active: activeUsers, suspended: suspendedUsers, blocked: blockedUsers, withdrawalPending: withdrawalPendingUsers },
      matches: { recruiting: recruitingMatches, cancelled: cancelledMatches, completed: completedMatches },
      teams: { active: activeTeams, suspended: suspendedTeams, archived: archivedTeams },
      teamMatches: { recruiting: recruitingTeamMatches, matched: matchedTeamMatches, cancelled: cancelledTeamMatches },
      recentActions: recentActions.map((log) => ({
        actionLogId: log.id,
        actionType: log.action,
        targetType: log.targetType,
        createdAt: log.createdAt,
      })),
    };
  }

  async changeUserStatus(user: V1AuthUser, userId: string, dto: ChangeUserStatusDto) {
    const admin = await this.getMutationAdmin(user.id);
    const target = await this.prisma.v1User.findUnique({ where: { id: userId } });
    if (!target) throw new NotFoundException({ code: 'NOT_FOUND', message: 'User was not found' });

    const targetAdminRecord = await this.prisma.v1AdminUser.findUnique({ where: { userId } });
    if (targetAdminRecord && targetAdminRecord.status === 'active' && admin.adminRole !== 'owner') {
      throw new ForbiddenException({
        code: 'PERMISSION_DENIED',
        message: '운영자 계정의 상태는 owner만 변경할 수 있어요.',
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.v1User.update({ where: { id: userId }, data: { accountStatus: dto.status } });
      return this.writeAdminStatusLogs(
        admin,
        {
          action: 'user.status.update',
          targetType: 'user',
          targetId: userId,
          previousStatus: target.accountStatus,
          status: updated.accountStatus,
          reason: dto.reason,
          beforeState: { accountStatus: target.accountStatus },
          afterState: { accountStatus: updated.accountStatus },
          responseIdKey: 'userId',
        },
        tx,
      );
    });
  }

  async deleteUser(user: V1AuthUser, userId: string, dto: DeleteAdminUserDto) {
    const admin = await this.getMutationAdmin(user.id);
    const target = await this.prisma.v1User.findUnique({ where: { id: userId } });
    if (!target) throw new NotFoundException({ code: 'NOT_FOUND', message: 'User was not found' });

    const targetAdminRecord = await this.prisma.v1AdminUser.findUnique({ where: { userId } });
    if (targetAdminRecord && targetAdminRecord.status === 'active' && admin.adminRole !== 'owner') {
      throw new ForbiddenException({
        code: 'PERMISSION_DENIED',
        message: '운영자 계정은 owner만 삭제할 수 있어요.',
      });
    }

    const deletedAt = new Date();
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.v1User.update({
        where: { id: userId },
        data: {
          accountStatus: 'deleted',
          deletedAt,
          email: target.email ? buildDeletedEmail(userId) : null,
          phone: target.phone ? buildDeletedPhone(userId) : null,
          emailVerifiedAt: null,
          phoneVerifiedAt: null,
        },
      });
      const identities = await tx.v1AuthIdentity.findMany({
        where: { userId },
        select: { id: true, provider: true },
      });
      await Promise.all(
        identities.map((identity) =>
          tx.v1AuthIdentity.update({
            where: { id: identity.id },
            data: {
              status: 'unlinked',
              providerUserKey: buildDeletedProviderUserKey(userId, identity.id),
              email: null,
              passwordHash: null,
              unlinkedAt: deletedAt,
            },
          }),
        ),
      );
      await tx.v1UserProfile.updateMany({
        where: { userId },
        data: {
          nickname: buildDeletedNickname(userId),
          displayName: '탈퇴 회원',
          bio: null,
          profileImageUrl: null,
          deletedAt,
        },
      });
      const result = await this.writeAdminStatusLogs(
        admin,
        {
          action: 'user.delete',
          targetType: 'user',
          targetId: userId,
          previousStatus: target.accountStatus,
          status: updated.accountStatus,
          reason: dto.reason,
          beforeState: {
            accountStatus: target.accountStatus,
            deletedAt: target.deletedAt?.toISOString() ?? '',
            hasEmail: target.email ? 'true' : 'false',
            hasPhone: target.phone ? 'true' : 'false',
          },
          afterState: {
            accountStatus: updated.accountStatus,
            deletedAt: deletedAt.toISOString(),
            personalDataMasked: 'true',
          },
          responseIdKey: 'userId',
        },
        tx,
      );

      return { ...result, deletedAt };
    });
  }

  async changeMatchStatus(user: V1AuthUser, matchId: string, dto: ChangeMatchStatusDto) {
    const admin = await this.getMutationAdmin(user.id);
    const target = await this.prisma.v1Match.findUnique({ where: { id: matchId } });
    if (!target) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Match was not found' });
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.v1Match.update({ where: { id: matchId }, data: { status: dto.status } });
      return this.writeAdminStatusLogs(
        admin,
        {
          action: 'match.status.update',
          targetType: 'match',
          targetId: matchId,
          previousStatus: target.status,
          status: updated.status,
          reason: dto.reason,
          beforeState: { status: target.status },
          afterState: { status: updated.status },
          responseIdKey: 'matchId',
        },
        tx,
      );
    });
  }

  async changeTeamStatus(user: V1AuthUser, teamId: string, dto: ChangeTeamStatusDto) {
    const admin = await this.getMutationAdmin(user.id);
    const target = await this.prisma.v1Team.findUnique({ where: { id: teamId } });
    if (!target) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Team was not found' });
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.v1Team.update({ where: { id: teamId }, data: { status: dto.status } });
      return this.writeAdminStatusLogs(
        admin,
        {
          action: 'team.status.update',
          targetType: 'team',
          targetId: teamId,
          previousStatus: target.status,
          status: updated.status,
          reason: dto.reason,
          beforeState: { status: target.status },
          afterState: { status: updated.status },
          responseIdKey: 'teamId',
        },
        tx,
      );
    });
  }

  async changeTeamMatchStatus(user: V1AuthUser, teamMatchId: string, dto: ChangeTeamMatchStatusDto) {
    const admin = await this.getMutationAdmin(user.id);
    const target = await this.prisma.v1TeamMatch.findUnique({ where: { id: teamMatchId } });
    if (!target) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Team match was not found' });
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.v1TeamMatch.update({ where: { id: teamMatchId }, data: { status: dto.status } });
      return this.writeAdminStatusLogs(
        admin,
        {
          action: 'team_match.status.update',
          targetType: 'team_match',
          targetId: teamMatchId,
          previousStatus: target.status,
          status: updated.status,
          reason: dto.reason,
          beforeState: { status: target.status },
          afterState: { status: updated.status },
          responseIdKey: 'teamMatchId',
        },
        tx,
      );
    });
  }

  async actionLogs(user: V1AuthUser, query: AdminLogsQueryDto) {
    await this.getActiveAdmin(user.id);
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 50);
    const logs = await this.prisma.v1AdminActionLog.findMany({
      where: {
        ...(query.adminUserId ? { adminUserId: query.adminUserId } : {}),
        ...(query.targetType ? { targetType: query.targetType } : {}),
        ...(query.targetId ? { targetId: query.targetId } : {}),
        ...(query.actionType ? { action: query.actionType } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const pageItems = logs.slice(0, limit);
    const hasNext = logs.length > limit;
    return {
      items: pageItems.map((log) => ({
        actionLogId: log.id,
        adminUserId: log.adminUserId,
        actionType: log.action,
        targetType: log.targetType,
        targetId: log.targetId,
        reason: log.reason,
        beforeState: log.beforeJson,
        afterState: log.afterJson,
        createdAt: log.createdAt,
      })),
      pageInfo: { nextCursor: hasNext ? pageItems.at(-1)?.id ?? null : null, hasNext },
    };
  }

  async statusChangeLogs(user: V1AuthUser, query: AdminLogsQueryDto) {
    await this.getActiveAdmin(user.id);
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 50);
    const logs = await this.prisma.v1StatusChangeLog.findMany({
      where: {
        ...(query.targetType ? { targetType: query.targetType } : {}),
        ...(query.targetId ? { targetId: query.targetId } : {}),
        ...(query.actorUserId ? { actorUserId: query.actorUserId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const pageItems = logs.slice(0, limit);
    const hasNext = logs.length > limit;
    return {
      items: pageItems.map((log) => ({
        statusChangeLogId: log.id,
        targetType: log.targetType,
        targetId: log.targetId,
        fromStatus: log.fromStatus,
        toStatus: log.toStatus,
        actorUserId: log.actorUserId,
        adminUserId: log.adminUserId,
        reason: log.reason,
        createdAt: log.createdAt,
      })),
      pageInfo: { nextCursor: hasNext ? pageItems.at(-1)?.id ?? null : null, hasNext },
    };
  }

  // ─── User list / detail ────────────────────────────────────────────────────

  async listUsers(user: V1AuthUser, query: AdminUserListQueryDto) {
    await this.getActiveAdmin(user.id);
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 50);

    const searchWhere = query.q
      ? {
          OR: [
            { profile: { nickname: { contains: query.q, mode: 'insensitive' as const } } },
            { profile: { displayName: { contains: query.q, mode: 'insensitive' as const } } },
            { email: { contains: query.q, mode: 'insensitive' as const } },
          ],
        }
      : {};

    const rows = await this.prisma.v1User.findMany({
      where: {
        ...(query.status ? { accountStatus: query.status } : {}),
        ...searchWhere,
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      select: {
        id: true,
        email: true,
        accountStatus: true,
        onboardingStatus: true,
        lastLoginAt: true,
        createdAt: true,
        deletedAt: true,
        profile: { select: { nickname: true, displayName: true } },
        adminUser: { select: { adminRole: true } },
        teamMemberships: {
          where: { status: 'active' },
          select: { role: true },
        },
        _count: {
          select: {
            hostedMatches: true,
            ownedTeams: true,
            teamMemberships: true,
          },
        },
      },
    });

    const pageItems = rows.slice(0, limit);
    const hasNext = rows.length > limit;

    return {
      items: pageItems.map((row) => ({
        userId: row.id,
        nickname: row.profile?.nickname ?? null,
        displayName: row.profile?.displayName ?? null,
        email: row.email ?? null,
        accountStatus: row.accountStatus,
        onboardingStatus: row.onboardingStatus,
        lastLoginAt: row.lastLoginAt,
        createdAt: row.createdAt,
        hostedMatchCount: row._count.hostedMatches,
        ownedTeamCount: row._count.ownedTeams,
        membershipCount: row._count.teamMemberships,
        teamRoleCounts: {
          owner: row.teamMemberships.filter((membership) => membership.role === 'owner').length,
          manager: row.teamMemberships.filter((membership) => membership.role === 'manager').length,
          member: row.teamMemberships.filter((membership) => membership.role === 'member').length,
        },
        adminRole: row.adminUser?.adminRole ?? null,
      })),
      pageInfo: { nextCursor: hasNext ? pageItems.at(-1)?.id ?? null : null, hasNext },
    };
  }

  async getUser(user: V1AuthUser, targetUserId: string) {
    await this.getActiveAdmin(user.id);

    const row = await this.prisma.v1User.findUnique({
      where: { id: targetUserId },
      select: {
        id: true,
        email: true,
        accountStatus: true,
        onboardingStatus: true,
        lastLoginAt: true,
        createdAt: true,
        deletedAt: true,
        profile: { select: { nickname: true, displayName: true } },
        adminUser: { select: { adminRole: true } },
        reputationSummary: {
          select: { trustState: true, mannerScore: true, reviewCount: true, calculatedAt: true },
        },
        _count: {
          select: {
            hostedMatches: true,
            ownedTeams: true,
            teamMemberships: true,
          },
        },
        hostedMatches: {
          take: 5,
          orderBy: { createdAt: 'desc' },
          select: { id: true, title: true, status: true, startAt: true },
        },
        ownedTeams: {
          take: 5,
          orderBy: { createdAt: 'desc' },
          select: { id: true, name: true, status: true, memberCount: true },
        },
        teamMemberships: {
          where: { status: 'active' },
          orderBy: { joinedAt: 'desc' },
          select: {
            id: true,
            role: true,
            status: true,
            joinedAt: true,
            team: {
              select: {
                id: true,
                name: true,
                status: true,
                memberCount: true,
              },
            },
          },
        },
        statusLogs: {
          where: {
            targetType: 'user',
            toStatus: 'withdrawal_pending',
            actorType: 'user',
          },
          take: 1,
          orderBy: { createdAt: 'desc' },
          select: { reason: true, createdAt: true },
        },
      },
    });

    if (!row) throw new NotFoundException({ code: 'NOT_FOUND', message: 'User was not found' });

    return {
      userId: row.id,
      nickname: row.profile?.nickname ?? null,
      displayName: row.profile?.displayName ?? null,
      email: row.email ?? null,
      accountStatus: row.accountStatus,
      onboardingStatus: row.onboardingStatus,
      lastLoginAt: row.lastLoginAt,
      createdAt: row.createdAt,
      deletedAt: row.deletedAt,
      hostedMatchCount: row._count.hostedMatches,
      ownedTeamCount: row._count.ownedTeams,
      membershipCount: row._count.teamMemberships,
      teamRoleCounts: {
        owner: row.teamMemberships.filter((membership) => membership.role === 'owner').length,
        manager: row.teamMemberships.filter((membership) => membership.role === 'manager').length,
        member: row.teamMemberships.filter((membership) => membership.role === 'member').length,
      },
      adminRole: row.adminUser?.adminRole ?? null,
      reputationSummary: row.reputationSummary
        ? {
            trustState: row.reputationSummary.trustState,
            mannerScore: row.reputationSummary.mannerScore,
            reviewCount: row.reputationSummary.reviewCount,
            calculatedAt: row.reputationSummary.calculatedAt,
          }
        : null,
      hostedMatches: row.hostedMatches.map((m) => ({
        matchId: m.id,
        title: m.title,
        status: m.status,
        startAt: m.startAt,
      })),
      ownedTeams: row.ownedTeams.map((t) => ({
        teamId: t.id,
        name: t.name,
        status: t.status,
        memberCount: t.memberCount,
      })),
      teamMemberships: row.teamMemberships.map((membership) => ({
        membershipId: membership.id,
        teamId: membership.team.id,
        name: membership.team.name,
        status: membership.team.status,
        memberCount: membership.team.memberCount,
        role: membership.role,
        joinedAt: membership.joinedAt,
      })),
      withdrawalRequest: row.statusLogs[0]
        ? {
            reason: row.statusLogs[0].reason,
            requestedAt: row.statusLogs[0].createdAt,
          }
        : null,
    };
  }

  // ─── Match list / detail ───────────────────────────────────────────────────

  async listMatches(user: V1AuthUser, query: AdminMatchListQueryDto) {
    await this.getActiveAdmin(user.id);
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 50);

    const searchWhere = query.q
      ? {
          OR: [
            { title: { contains: query.q, mode: 'insensitive' as const } },
            { placeName: { contains: query.q, mode: 'insensitive' as const } },
          ],
        }
      : {};

    const rows = await this.prisma.v1Match.findMany({
      where: {
        ...(query.status ? { status: query.status } : {}),
        ...(query.sportId ? { sportId: query.sportId } : {}),
        ...searchWhere,
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      select: {
        id: true,
        title: true,
        placeName: true,
        startAt: true,
        status: true,
        maxParticipants: true,
        createdAt: true,
        hostUserId: true,
        sport: { select: { name: true, code: true } },
        hostUser: { select: { profile: { select: { nickname: true } } } },
        _count: { select: { participants: true } },
      },
    });

    const pageItems = rows.slice(0, limit);
    const hasNext = rows.length > limit;

    return {
      items: pageItems.map((row) => ({
        matchId: row.id,
        title: row.title,
        sportName: row.sport.name,
        sportCode: row.sport.code,
        hostUserId: row.hostUserId,
        hostName: row.hostUser.profile?.nickname ?? null,
        placeName: row.placeName,
        startAt: row.startAt,
        status: row.status,
        participantCount: row._count.participants,
        maxParticipants: row.maxParticipants,
        createdAt: row.createdAt,
      })),
      pageInfo: { nextCursor: hasNext ? pageItems.at(-1)?.id ?? null : null, hasNext },
    };
  }

  async getMatch(user: V1AuthUser, matchId: string) {
    await this.getActiveAdmin(user.id);

    const row = await this.prisma.v1Match.findUnique({
      where: { id: matchId },
      select: {
        id: true,
        title: true,
        description: true,
        placeName: true,
        startAt: true,
        deadlineAt: true,
        status: true,
        maxParticipants: true,
        createdAt: true,
        hostUserId: true,
        sport: { select: { name: true, code: true } },
        region: { select: { name: true } },
        hostUser: { select: { profile: { select: { nickname: true } } } },
        _count: { select: { participants: true, applications: true } },
      },
    });

    if (!row) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Match was not found' });

    return {
      matchId: row.id,
      title: row.title,
      description: row.description ?? null,
      sportName: row.sport.name,
      sportCode: row.sport.code,
      hostUserId: row.hostUserId,
      hostName: row.hostUser.profile?.nickname ?? null,
      regionName: row.region?.name ?? null,
      placeName: row.placeName,
      startAt: row.startAt,
      deadlineAt: row.deadlineAt ?? null,
      status: row.status,
      participantCount: row._count.participants,
      applicationCount: row._count.applications,
      maxParticipants: row.maxParticipants,
      createdAt: row.createdAt,
    };
  }

  // ─── Team list / detail ────────────────────────────────────────────────────

  async listTeams(user: V1AuthUser, query: AdminTeamListQueryDto) {
    await this.getActiveAdmin(user.id);
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 50);

    const rows = await this.prisma.v1Team.findMany({
      where: {
        ...(query.status ? { status: query.status } : {}),
        ...(query.q ? { name: { contains: query.q, mode: 'insensitive' as const } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      select: {
        id: true,
        name: true,
        status: true,
        memberCount: true,
        managerCount: true,
        createdAt: true,
        ownerUserId: true,
        sport: { select: { name: true } },
        ownerUser: { select: { profile: { select: { nickname: true } } } },
      },
    });

    const pageItems = rows.slice(0, limit);
    const hasNext = rows.length > limit;

    return {
      items: pageItems.map((row) => ({
        teamId: row.id,
        name: row.name,
        sportName: row.sport.name,
        ownerUserId: row.ownerUserId,
        ownerName: row.ownerUser.profile?.nickname ?? null,
        memberCount: row.memberCount,
        managerCount: row.managerCount,
        status: row.status,
        createdAt: row.createdAt,
      })),
      pageInfo: { nextCursor: hasNext ? pageItems.at(-1)?.id ?? null : null, hasNext },
    };
  }

  async getTeam(user: V1AuthUser, teamId: string) {
    await this.getActiveAdmin(user.id);

    const row = await this.prisma.v1Team.findUnique({
      where: { id: teamId },
      select: {
        id: true,
        name: true,
        status: true,
        memberCount: true,
        managerCount: true,
        createdAt: true,
        ownerUserId: true,
        sport: { select: { name: true } },
        region: { select: { name: true } },
        ownerUser: { select: { profile: { select: { nickname: true } } } },
        trustScore: {
          select: { trustState: true, mannerScore: true, matchCount: true, calculatedAt: true },
        },
        hostedTeamMatches: {
          take: 5,
          orderBy: { createdAt: 'desc' },
          select: { id: true, title: true, status: true, startAt: true },
        },
      },
    });

    if (!row) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Team was not found' });

    return {
      teamId: row.id,
      name: row.name,
      sportName: row.sport.name,
      regionName: row.region.name,
      ownerUserId: row.ownerUserId,
      ownerName: row.ownerUser.profile?.nickname ?? null,
      memberCount: row.memberCount,
      managerCount: row.managerCount,
      status: row.status,
      createdAt: row.createdAt,
      trustScore: row.trustScore
        ? {
            trustState: row.trustScore.trustState,
            mannerScore: row.trustScore.mannerScore,
            matchCount: row.trustScore.matchCount,
            calculatedAt: row.trustScore.calculatedAt,
          }
        : null,
      recentHostedTeamMatches: row.hostedTeamMatches.map((tm) => ({
        teamMatchId: tm.id,
        title: tm.title,
        status: tm.status,
        startAt: tm.startAt,
      })),
    };
  }

  // ─── Notice list / create ─────────────────────────────────────────────────

  async listNotices(user: V1AuthUser, query: AdminNoticeListQueryDto) {
    await this.getActiveAdmin(user.id);
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 50);

    const searchWhere = query.q
      ? {
          OR: [
            { title: { contains: query.q, mode: 'insensitive' as const } },
            { body: { contains: query.q, mode: 'insensitive' as const } },
          ],
        }
      : {};

    const rows = await this.prisma.v1Notice.findMany({
      where: {
        ...(query.status ? { status: query.status } : {}),
        ...(query.audience ? { audience: query.audience } : {}),
        ...(query.category ? { category: query.category } : {}),
        ...searchWhere,
      },
      orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      select: {
        id: true,
        audience: true,
        category: true,
        title: true,
        body: true,
        status: true,
        publishedAt: true,
        archivedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const pageItems = rows.slice(0, limit);
    const hasNext = rows.length > limit;

    return {
      items: pageItems.map((row) => this.toAdminNoticeRow(row)),
      pageInfo: { nextCursor: hasNext ? pageItems.at(-1)?.id ?? null : null, hasNext },
    };
  }

  async getNotice(user: V1AuthUser, noticeId: string) {
    await this.getActiveAdmin(user.id);
    const row = await this.prisma.v1Notice.findUnique({
      where: { id: noticeId },
      select: {
        id: true,
        audience: true,
        category: true,
        title: true,
        body: true,
        status: true,
        publishedAt: true,
        archivedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!row) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Notice was not found' });
    }
    return { notice: this.toAdminNoticeRow(row) };
  }

  async createNotice(user: V1AuthUser, dto: CreateAdminNoticeDto) {
    const admin = await this.getMutationAdmin(user.id);
    const now = new Date();
    const category = dto.pinned ? '고정' : dto.category === '고정' ? '안내' : dto.category;
    const publishedAt = dto.status === 'published' ? now : null;

    const row = await this.prisma.$transaction(async (tx) => {
      const notice = await tx.v1Notice.create({
        data: {
          audience: dto.audience,
          category,
          title: dto.title.trim(),
          body: dto.body.trim(),
          status: dto.status,
          publishedAt,
        },
      });

      await tx.v1AdminActionLog.create({
        data: {
          adminUserId: admin.id,
          action: 'notice.create',
          targetType: 'notice',
          targetId: notice.id,
          reason: dto.status === 'published' ? '공지 작성 및 발행' : '공지 초안 작성',
          beforeJson: Prisma.JsonNull,
          afterJson: {
            noticeId: notice.id,
            audience: notice.audience,
            category: notice.category,
            status: notice.status,
            pinned: notice.category === '고정',
          } as Prisma.InputJsonValue,
        },
      });

      return notice;
    });

    return { notice: this.toAdminNoticeRow(row) };
  }

  async updateNotice(user: V1AuthUser, noticeId: string, dto: UpdateAdminNoticeDto) {
    const admin = await this.getMutationAdmin(user.id);
    const existing = await this.prisma.v1Notice.findUnique({ where: { id: noticeId } });
    if (!existing) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Notice was not found' });
    }

    const now = new Date();
    const category = dto.pinned ? '고정' : dto.category === '고정' ? '안내' : dto.category;
    const statusChanged = existing.status !== dto.status;
    const publishedAt = dto.status === 'published'
      ? existing.publishedAt ?? now
      : null;

    const row = await this.prisma.$transaction(async (tx) => {
      const notice = await tx.v1Notice.update({
        where: { id: noticeId },
        data: {
          audience: dto.audience,
          category,
          title: dto.title.trim(),
          body: dto.body.trim(),
          status: dto.status,
          publishedAt,
          archivedAt: null,
        },
      });

      await tx.v1AdminActionLog.create({
        data: {
          adminUserId: admin.id,
          action: 'notice.update',
          targetType: 'notice',
          targetId: notice.id,
          reason: statusChanged ? `공지 수정 및 상태 변경: ${existing.status} -> ${dto.status}` : '공지 수정',
          beforeJson: {
            noticeId: existing.id,
            audience: existing.audience,
            category: existing.category,
            status: existing.status,
            pinned: existing.category === '고정',
          } as Prisma.InputJsonValue,
          afterJson: {
            noticeId: notice.id,
            audience: notice.audience,
            category: notice.category,
            status: notice.status,
            pinned: notice.category === '고정',
          } as Prisma.InputJsonValue,
        },
      });

      return notice;
    });

    return { notice: this.toAdminNoticeRow(row) };
  }

  async deleteNotice(user: V1AuthUser, noticeId: string) {
    const admin = await this.getMutationAdmin(user.id);
    const existing = await this.prisma.v1Notice.findUnique({ where: { id: noticeId } });
    if (!existing) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Notice was not found' });
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.v1AdminActionLog.create({
        data: {
          adminUserId: admin.id,
          action: 'notice.delete',
          targetType: 'notice',
          targetId: existing.id,
          reason: '공지 삭제',
          beforeJson: {
            noticeId: existing.id,
            audience: existing.audience,
            category: existing.category,
            status: existing.status,
            pinned: existing.category === '고정',
            title: existing.title,
          } as Prisma.InputJsonValue,
          afterJson: Prisma.JsonNull,
        },
      });
      await tx.v1Notice.delete({ where: { id: noticeId } });
    });

    return { noticeId, deleted: true };
  }

  // ─── Inquiry list / detail / replies ───────────────────────────────────────

  async listInquiries(user: V1AuthUser, query: AdminInquiryListQueryDto) {
    await this.getActiveAdmin(user.id);
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 50);
    const searchWhere = query.q
      ? {
          OR: [
            { title: { contains: query.q, mode: 'insensitive' as const } },
            { body: { contains: query.q, mode: 'insensitive' as const } },
            { user: { email: { contains: query.q, mode: 'insensitive' as const } } },
            { user: { profile: { nickname: { contains: query.q, mode: 'insensitive' as const } } } },
            { guestEmail: { contains: query.q, mode: 'insensitive' as const } },
            { guestPhone: { contains: query.q, mode: 'insensitive' as const } },
          ],
        }
      : {};

    const rows = await this.prisma.v1Inquiry.findMany({
      where: {
        ...(query.status ? { status: query.status } : {}),
        ...(query.category ? { category: query.category } : {}),
        ...searchWhere,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      select: {
        id: true,
        category: true,
        title: true,
        status: true,
        relatedType: true,
        relatedId: true,
        createdAt: true,
        updatedAt: true,
        closedAt: true,
        userId: true,
        guestEmail: true,
        guestPhone: true,
        user: { select: { email: true, profile: { select: { nickname: true, displayName: true } } } },
        _count: { select: { replies: true } },
      },
    });

    const pageItems = rows.slice(0, limit);
    const hasNext = rows.length > limit;

    return {
      items: pageItems.map((row) => this.toAdminInquiryRow(row)),
      pageInfo: { nextCursor: hasNext ? pageItems.at(-1)?.id ?? null : null, hasNext },
    };
  }

  /** 사이드바 배지용 — 전체 목록을 가져오지 않고 미답변(received/reviewing) 건수만 count */
  async getPendingInquiryCount(user: V1AuthUser) {
    await this.getActiveAdmin(user.id);
    const count = await this.prisma.v1Inquiry.count({
      where: { status: { in: ['received', 'reviewing'] } },
    });
    return { count };
  }

  async getInquiry(user: V1AuthUser, inquiryId: string) {
    await this.getActiveAdmin(user.id);
    const row = await this.prisma.v1Inquiry.findUnique({
      where: { id: inquiryId },
      select: {
        id: true,
        userId: true,
        guestEmail: true,
        guestPhone: true,
        category: true,
        title: true,
        body: true,
        contact: true,
        relatedType: true,
        relatedId: true,
        status: true,
        closedAt: true,
        createdAt: true,
        updatedAt: true,
        user: { select: { email: true, profile: { select: { nickname: true, displayName: true } } } },
        replies: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            body: true,
            adminUserId: true,
            createdAt: true,
            updatedAt: true,
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
    if (!row) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Inquiry was not found' });
    return this.toAdminInquiryDetail(row);
  }

  async replyInquiry(user: V1AuthUser, inquiryId: string, dto: ReplyInquiryDto) {
    const admin = await this.getMutationAdmin(user.id);
    const body = dto.body.trim();
    if (!body) {
      throw new BadRequestException({ code: 'INVALID_INQUIRY_REPLY', message: 'Reply body is required' });
    }

    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.v1Inquiry.findUnique({ where: { id: inquiryId } });
      if (!existing) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Inquiry was not found' });

      await tx.v1InquiryReply.create({
        data: { inquiryId, adminUserId: admin.id, body },
      });

      const updated = await tx.v1Inquiry.update({
        where: { id: inquiryId },
        data: { status: 'answered', closedAt: null },
      });

      await this.writeAdminStatusLogs(
        admin,
        {
          action: 'inquiry.reply',
          targetType: 'inquiry',
          targetId: inquiryId,
          previousStatus: existing.status,
          status: updated.status,
          reason: '문의 답변 작성',
          beforeState: { status: existing.status },
          afterState: { status: updated.status, replied: 'true' },
          responseIdKey: 'inquiryId',
        },
        tx,
      );
    });

    return this.getInquiry(user, inquiryId);
  }

  async updateInquiryReply(user: V1AuthUser, inquiryId: string, replyId: string, dto: ReplyInquiryDto) {
    const admin = await this.getMutationAdmin(user.id);
    const body = dto.body.trim();
    if (!body) {
      throw new BadRequestException({ code: 'INVALID_INQUIRY_REPLY', message: 'Reply body is required' });
    }

    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.v1InquiryReply.findUnique({ where: { id: replyId } });
      if (!existing || existing.inquiryId !== inquiryId) {
        throw new NotFoundException({ code: 'NOT_FOUND', message: 'Reply was not found' });
      }

      await tx.v1InquiryReply.update({ where: { id: replyId }, data: { body } });

      await tx.v1AdminActionLog.create({
        data: {
          adminUserId: admin.id,
          action: 'inquiry.reply.update',
          targetType: 'inquiry_reply',
          targetId: replyId,
          reason: '문의 답변 수정',
          beforeJson: { inquiryId, replyId, bodyPreview: existing.body.slice(0, 60) } as Prisma.InputJsonValue,
          afterJson: { inquiryId, replyId, bodyPreview: body.slice(0, 60) } as Prisma.InputJsonValue,
        },
      });
    });

    return this.getInquiry(user, inquiryId);
  }

  async changeInquiryStatus(user: V1AuthUser, inquiryId: string, dto: ChangeInquiryStatusDto) {
    const admin = await this.getMutationAdmin(user.id);
    const existing = await this.prisma.v1Inquiry.findUnique({ where: { id: inquiryId } });
    if (!existing) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Inquiry was not found' });

    const result = await this.prisma.$transaction(async (tx) => {
      const row = await tx.v1Inquiry.update({
        where: { id: inquiryId },
        data: { status: dto.status, closedAt: dto.status === 'closed' ? new Date() : null },
      });

      const logs = await this.writeAdminStatusLogs(
        admin,
        {
          action: 'inquiry.status.update',
          targetType: 'inquiry',
          targetId: inquiryId,
          previousStatus: existing.status,
          status: row.status,
          reason: dto.reason?.trim() || '문의 상태 변경',
          beforeState: { status: existing.status },
          afterState: { status: row.status },
          responseIdKey: 'inquiryId',
        },
        tx,
      );

      return { row, logs };
    });

    return {
      inquiryId,
      previousStatus: existing.status,
      status: result.row.status,
      actionLogId: result.logs.actionLogId,
      statusChangeLogId: result.logs.statusChangeLogId,
    };
  }

  // ─── Team-match list ───────────────────────────────────────────────────────

  async listTeamMatches(user: V1AuthUser, query: AdminTeamMatchListQueryDto) {
    await this.getActiveAdmin(user.id);
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 50);

    const rows = await this.prisma.v1TeamMatch.findMany({
      where: {
        ...(query.status ? { status: query.status } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      select: {
        id: true,
        title: true,
        startAt: true,
        status: true,
        createdAt: true,
        hostTeamId: true,
        hostTeam: { select: { name: true } },
        sport: { select: { name: true } },
      },
    });

    const pageItems = rows.slice(0, limit);
    const hasNext = rows.length > limit;

    return {
      items: pageItems.map((row) => ({
        teamMatchId: row.id,
        title: row.title,
        hostTeamId: row.hostTeamId,
        hostTeamName: row.hostTeam.name,
        sportName: row.sport.name,
        startAt: row.startAt,
        status: row.status,
        createdAt: row.createdAt,
      })),
      pageInfo: { nextCursor: hasNext ? pageItems.at(-1)?.id ?? null : null, hasNext },
    };
  }

  // ─── Admin management (owner-only) ────────────────────────────────────────

  async listAdmins(user: V1AuthUser, query: AdminListQueryDto) {
    await this.getOwnerAdmin(user.id);
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 50);

    const rows = await this.prisma.v1AdminUser.findMany({
      where: {
        ...(query.status ? { status: query.status } : {}),
      },
      orderBy: { grantedAt: 'desc' },
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      include: {
        user: {
          select: {
            email: true,
            profile: { select: { nickname: true, displayName: true } },
          },
        },
      },
    });

    const pageItems = rows.slice(0, limit);
    const hasNext = rows.length > limit;

    return {
      items: pageItems.map((row) => ({
        adminUserId: row.id,
        userId: row.userId,
        nickname: row.user.profile?.nickname ?? null,
        displayName: row.user.profile?.displayName ?? null,
        email: row.user.email ?? null,
        adminRole: row.adminRole,
        status: row.status,
        grantedByAdminUserId: row.grantedByAdminUserId ?? null,
        grantedAt: row.grantedAt,
        revokedAt: row.revokedAt ?? null,
      })),
      pageInfo: { nextCursor: hasNext ? pageItems.at(-1)?.id ?? null : null, hasNext },
    };
  }

  async grantAdmin(user: V1AuthUser, dto: GrantAdminDto) {
    const actor = await this.getOwnerAdmin(user.id);

    const targetUser = await this.prisma.v1User.findUnique({ where: { id: dto.userId } });
    if (!targetUser) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'User was not found' });
    }

    const now = new Date();

    const adminRow = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.v1AdminUser.findUnique({ where: { userId: dto.userId } });
      if (existing && existing.status === 'active') {
        throw new ConflictException({ code: 'ALREADY_ADMIN', message: 'User is already an active admin' });
      }

      let row: { id: string; userId: string; adminRole: string; status: string; grantedByAdminUserId: string | null; grantedAt: Date; revokedAt: Date | null };

      if (existing) {
        // revoked/suspended → reactivate
        row = await tx.v1AdminUser.update({
          where: { userId: dto.userId },
          data: {
            adminRole: dto.adminRole,
            status: 'active',
            revokedAt: null,
            grantedByAdminUserId: actor.userId,
            grantedAt: now,
          },
        });
      } else {
        row = await tx.v1AdminUser.create({
          data: {
            userId: dto.userId,
            adminRole: dto.adminRole,
            status: 'active',
            grantedByAdminUserId: actor.userId,
            grantedAt: now,
          },
        });
      }

      await tx.v1AdminActionLog.create({
        data: {
          adminUserId: actor.id,
          action: 'admin.grant',
          targetType: 'admin',
          targetId: dto.userId,
          reason: dto.reason,
          beforeJson: (existing
            ? { adminRole: existing.adminRole, status: existing.status }
            : null) as Prisma.InputJsonValue,
          afterJson: { adminRole: row.adminRole, status: row.status } as Prisma.InputJsonValue,
        },
      });

      return row;
    });

    const withUser = await this.prisma.v1AdminUser.findUniqueOrThrow({
      where: { userId: dto.userId },
      include: {
        user: { select: { email: true, profile: { select: { nickname: true, displayName: true } } } },
      },
    });

    return {
      adminUserId: withUser.id,
      userId: withUser.userId,
      nickname: withUser.user.profile?.nickname ?? null,
      displayName: withUser.user.profile?.displayName ?? null,
      email: withUser.user.email ?? null,
      adminRole: withUser.adminRole,
      status: withUser.status,
      grantedByAdminUserId: withUser.grantedByAdminUserId ?? null,
      grantedAt: withUser.grantedAt,
      revokedAt: withUser.revokedAt ?? null,
    };
  }

  async updateAdmin(user: V1AuthUser, targetUserId: string, dto: UpdateAdminDto) {
    const actor = await this.getOwnerAdmin(user.id);

    // Guard: cannot modify self (check before entering transaction — self-id is immutable)
    if (actor.userId === targetUserId) {
      throw new ConflictException({ code: 'SELF_MODIFICATION', message: 'Cannot modify your own admin record' });
    }

    const now = new Date();

    const updated = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.v1AdminUser.findUnique({ where: { userId: targetUserId } });
      if (!existing) {
        throw new NotFoundException({ code: 'NOT_FOUND', message: 'Admin was not found' });
      }

      // Guard: cannot demote or revoke the last active owner (atomic count inside tx)
      const wouldLoseOwnerStatus =
        existing.adminRole === 'owner' &&
        (dto.status === 'revoked' || (dto.adminRole !== undefined && dto.adminRole !== 'owner'));
      if (wouldLoseOwnerStatus) {
        const activeOwnerCount = await tx.v1AdminUser.count({
          where: { adminRole: 'owner', status: 'active' },
        });
        if (activeOwnerCount <= 1) {
          throw new ConflictException({
            code: 'LAST_OWNER',
            message: 'Cannot demote or revoke the last active owner',
          });
        }
      }

      const updateData: Prisma.V1AdminUserUpdateInput = {};
      if (dto.adminRole !== undefined) updateData.adminRole = dto.adminRole;
      if (dto.status !== undefined) {
        updateData.status = dto.status;
        updateData.revokedAt = dto.status === 'revoked' ? now : null;
      }

      const row = await tx.v1AdminUser.update({
        where: { userId: targetUserId },
        data: updateData,
        include: {
          user: { select: { email: true, profile: { select: { nickname: true, displayName: true } } } },
        },
      });

      const action = dto.status === 'revoked' ? 'admin.revoke' : 'admin.update';
      await tx.v1AdminActionLog.create({
        data: {
          adminUserId: actor.id,
          action,
          targetType: 'admin',
          targetId: targetUserId,
          reason: dto.reason,
          beforeJson: { adminRole: existing.adminRole, status: existing.status } as Prisma.InputJsonValue,
          afterJson: { adminRole: row.adminRole, status: row.status } as Prisma.InputJsonValue,
        },
      });

      return row;
    });

    return {
      adminUserId: updated.id,
      userId: updated.userId,
      nickname: updated.user.profile?.nickname ?? null,
      displayName: updated.user.profile?.displayName ?? null,
      email: updated.user.email ?? null,
      adminRole: updated.adminRole,
      status: updated.status,
      grantedByAdminUserId: updated.grantedByAdminUserId ?? null,
      grantedAt: updated.grantedAt,
      revokedAt: updated.revokedAt ?? null,
    };
  }

  private async getOwnerAdmin(userId: string): Promise<ActiveAdmin> {
    const admin = await this.getActiveAdmin(userId);
    if (admin.adminRole !== 'owner') {
      throw new ForbiddenException({ code: 'PERMISSION_DENIED', message: 'Owner access is required' });
    }
    return admin;
  }

  private async getActiveAdmin(userId: string): Promise<ActiveAdmin> {
    const admin = await this.prisma.v1AdminUser.findUnique({ where: { userId } });
    if (!admin || admin.status !== 'active') {
      throw new ForbiddenException({ code: 'PERMISSION_DENIED', message: 'Active admin access is required' });
    }
    return admin as ActiveAdmin;
  }

  private async getMutationAdmin(userId: string) {
    const admin = await this.getActiveAdmin(userId);
    if (admin.adminRole === 'support') {
      throw new ForbiddenException({ code: 'PERMISSION_DENIED', message: 'Support admins cannot mutate status' });
    }
    return admin;
  }

  private async writeAdminStatusLogs(
    admin: ActiveAdmin,
    input: {
      action: string;
      targetType: string;
      targetId: string;
      previousStatus: string;
      status: string;
      reason: string;
      beforeState: Record<string, string>;
      afterState: Record<string, string>;
      responseIdKey: string;
    },
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    const actionLog = await client.v1AdminActionLog.create({
      data: {
        adminUserId: admin.id,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
        reason: input.reason,
        beforeJson: input.beforeState as Prisma.InputJsonValue,
        afterJson: input.afterState as Prisma.InputJsonValue,
      },
    });
    const statusChangeLog = await client.v1StatusChangeLog.create({
      data: {
        targetType: input.targetType,
        targetId: input.targetId,
        fromStatus: input.previousStatus,
        toStatus: input.status,
        actorType: 'admin',
        adminUserId: admin.id,
        reason: input.reason,
      },
    });

    return {
      [input.responseIdKey]: input.targetId,
      previousStatus: input.previousStatus,
      status: input.status,
      actionLogId: actionLog.id,
      statusChangeLogId: statusChangeLog.id,
    };
  }

  private toAdminNoticeRow(row: {
    id: string;
    audience: string;
    category: string;
    title: string;
    body: string;
    status: string;
    publishedAt: Date | null;
    archivedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      noticeId: row.id,
      audience: row.audience,
      category: row.category,
      pinned: row.category === '고정',
      title: row.title,
      body: row.body,
      status: row.status,
      publishedAt: row.publishedAt,
      archivedAt: row.archivedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private toAdminInquiryRow(row: {
    id: string;
    userId: string | null;
    guestEmail: string | null;
    guestPhone: string | null;
    category: string;
    title: string;
    status: string;
    relatedType: string | null;
    relatedId: string | null;
    createdAt: Date;
    updatedAt: Date;
    closedAt: Date | null;
    user: { email: string | null; profile: { nickname: string | null; displayName: string | null } | null } | null;
    _count: { replies: number };
  }) {
    return {
      inquiryId: row.id,
      userId: row.userId,
      isGuest: !row.userId,
      requesterName: row.user?.profile?.nickname ?? row.user?.profile?.displayName ?? null,
      requesterEmail: row.user?.email ?? row.guestEmail ?? null,
      guestEmail: row.guestEmail,
      guestPhone: row.guestPhone,
      category: row.category,
      title: row.title,
      status: row.status,
      relatedType: row.relatedType,
      relatedId: row.relatedId,
      replyCount: row._count.replies,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      closedAt: row.closedAt,
    };
  }

  private toAdminInquiryDetail(row: {
    id: string;
    userId: string | null;
    guestEmail: string | null;
    guestPhone: string | null;
    category: string;
    title: string;
    body: string;
    contact: string | null;
    relatedType: string | null;
    relatedId: string | null;
    status: string;
    closedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    user: { email: string | null; profile: { nickname: string | null; displayName: string | null } | null } | null;
    replies: Array<{
      id: string;
      body: string;
      adminUserId: string | null;
      createdAt: Date;
      updatedAt: Date;
      adminUser: {
        adminRole: string;
        user: { email: string | null; profile: { nickname: string | null; displayName: string | null } | null };
      } | null;
    }>;
  }) {
    return {
      ...this.toAdminInquiryRow({
        id: row.id,
        userId: row.userId,
        guestEmail: row.guestEmail,
        guestPhone: row.guestPhone,
        category: row.category,
        title: row.title,
        status: row.status,
        relatedType: row.relatedType,
        relatedId: row.relatedId,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        closedAt: row.closedAt,
        user: row.user,
        _count: { replies: row.replies.length },
      }),
      body: row.body,
      contact: row.contact,
      replies: row.replies.map((reply) => ({
        replyId: reply.id,
        adminUserId: reply.adminUserId,
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
}

function getCapabilities(role: ActiveAdmin['adminRole']) {
  if (role === 'owner') return ['overview:read', 'status:write', 'logs:read', 'admin:owner'];
  if (role === 'ops') return ['overview:read', 'status:write', 'logs:read'];
  return ['overview:read', 'logs:read'];
}

function buildDeletedEmail(userId: string) {
  return `deleted+${userId}@deleted.teameet.local`;
}

function buildDeletedPhone(userId: string) {
  return `deleted-${userId}`;
}

function buildDeletedProviderUserKey(userId: string, identityId: string) {
  return `deleted:${userId}:${identityId}`;
}

function buildDeletedNickname(userId: string) {
  return `deleted_${userId.slice(0, 8)}`;
}
