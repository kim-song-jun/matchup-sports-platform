import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { V1AuthUser } from '../auth/v1-auth-user';
import { PrismaService } from '../prisma/prisma.service';
import {
  AdminLogsQueryDto,
  AdminMatchListQueryDto,
  AdminOverviewQueryDto,
  AdminTeamListQueryDto,
  AdminTeamMatchListQueryDto,
  AdminUserListQueryDto,
  ChangeMatchStatusDto,
  ChangeTeamMatchStatusDto,
  ChangeTeamStatusDto,
  ChangeUserStatusDto,
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
    const updated = await this.prisma.v1User.update({ where: { id: userId }, data: { accountStatus: dto.status } });
    return this.writeAdminStatusLogs(admin, {
      action: 'user.status.update',
      targetType: 'user',
      targetId: userId,
      previousStatus: target.accountStatus,
      status: updated.accountStatus,
      reason: dto.reason,
      beforeState: { accountStatus: target.accountStatus },
      afterState: { accountStatus: updated.accountStatus },
      responseIdKey: 'userId',
    });
  }

  async changeMatchStatus(user: V1AuthUser, matchId: string, dto: ChangeMatchStatusDto) {
    const admin = await this.getMutationAdmin(user.id);
    const target = await this.prisma.v1Match.findUnique({ where: { id: matchId } });
    if (!target) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Match was not found' });
    const updated = await this.prisma.v1Match.update({ where: { id: matchId }, data: { status: dto.status } });
    return this.writeAdminStatusLogs(admin, {
      action: 'match.status.update',
      targetType: 'match',
      targetId: matchId,
      previousStatus: target.status,
      status: updated.status,
      reason: dto.reason,
      beforeState: { status: target.status },
      afterState: { status: updated.status },
      responseIdKey: 'matchId',
    });
  }

  async changeTeamStatus(user: V1AuthUser, teamId: string, dto: ChangeTeamStatusDto) {
    const admin = await this.getMutationAdmin(user.id);
    const target = await this.prisma.v1Team.findUnique({ where: { id: teamId } });
    if (!target) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Team was not found' });
    const updated = await this.prisma.v1Team.update({ where: { id: teamId }, data: { status: dto.status } });
    return this.writeAdminStatusLogs(admin, {
      action: 'team.status.update',
      targetType: 'team',
      targetId: teamId,
      previousStatus: target.status,
      status: updated.status,
      reason: dto.reason,
      beforeState: { status: target.status },
      afterState: { status: updated.status },
      responseIdKey: 'teamId',
    });
  }

  async changeTeamMatchStatus(user: V1AuthUser, teamMatchId: string, dto: ChangeTeamMatchStatusDto) {
    const admin = await this.getMutationAdmin(user.id);
    const target = await this.prisma.v1TeamMatch.findUnique({ where: { id: teamMatchId } });
    if (!target) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Team match was not found' });
    const updated = await this.prisma.v1TeamMatch.update({ where: { id: teamMatchId }, data: { status: dto.status } });
    return this.writeAdminStatusLogs(admin, {
      action: 'team_match.status.update',
      targetType: 'team_match',
      targetId: teamMatchId,
      previousStatus: target.status,
      status: updated.status,
      reason: dto.reason,
      beforeState: { status: target.status },
      afterState: { status: updated.status },
      responseIdKey: 'teamMatchId',
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
        profile: { select: { nickname: true, displayName: true } },
        adminUser: { select: { adminRole: true } },
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
      hostedMatchCount: row._count.hostedMatches,
      ownedTeamCount: row._count.ownedTeams,
      membershipCount: row._count.teamMemberships,
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
  ) {
    const logs = await this.prisma.$transaction(async (tx) => {
      const actionLog = await tx.v1AdminActionLog.create({
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
      const statusChangeLog = await tx.v1StatusChangeLog.create({
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
      return { actionLog, statusChangeLog };
    });

    return {
      [input.responseIdKey]: input.targetId,
      previousStatus: input.previousStatus,
      status: input.status,
      actionLogId: logs.actionLog.id,
      statusChangeLogId: logs.statusChangeLog.id,
    };
  }
}

function getCapabilities(role: ActiveAdmin['adminRole']) {
  if (role === 'owner') return ['overview:read', 'status:write', 'logs:read', 'admin:owner'];
  if (role === 'ops') return ['overview:read', 'status:write', 'logs:read'];
  return ['overview:read', 'logs:read'];
}
