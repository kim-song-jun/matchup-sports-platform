import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { V1AuthUser } from '../auth/v1-auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateProfileDto, UpdateSettingsDto, WithdrawalRequestDto } from './dto/profile.dto';

@Injectable()
export class ProfileService {
  constructor(private readonly prisma: PrismaService) {}

  async me(user: V1AuthUser) {
    const snapshot = await this.getUserSnapshot(user.id);
    return toProfileResponse(snapshot);
  }

  async activitySummary(user: V1AuthUser) {
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const nextMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    const activeMemberships = await this.prisma.v1TeamMembership.findMany({
      where: {
        userId: user.id,
        status: 'active',
        team: { status: 'active', deletedAt: null },
      },
      select: { teamId: true },
    });
    const teamIds = activeMemberships.map((membership) => membership.teamId);
    const teamMatchWhere = teamIds.length
      ? {
          deletedAt: null,
          OR: [
            { hostTeamId: { in: teamIds } },
            {
              applications: {
                some: {
                  applicantTeamId: { in: teamIds },
                  status: { in: ['requested' as const, 'approved' as const] },
                },
              },
            },
          ],
        }
      : null;

    const [
      reputation,
      personalActivityCount,
      monthlyPersonalMatchCount,
      teamActivityCount,
      monthlyTeamMatchCount,
    ] = await Promise.all([
      this.prisma.v1UserReputationSummary.findUnique({
        where: { userId: user.id },
        select: { mannerScore: true },
      }),
      this.prisma.v1MatchParticipant.count({
        where: {
          userId: user.id,
          status: { in: ['active', 'completed'] },
          match: { deletedAt: null },
        },
      }),
      this.prisma.v1MatchParticipant.count({
        where: {
          userId: user.id,
          status: { in: ['active', 'completed'] },
          match: { deletedAt: null, startAt: { gte: monthStart, lt: nextMonthStart } },
        },
      }),
      teamMatchWhere ? this.prisma.v1TeamMatch.count({ where: teamMatchWhere }) : 0,
      teamMatchWhere
        ? this.prisma.v1TeamMatch.count({
            where: {
              ...teamMatchWhere,
              startAt: { gte: monthStart, lt: nextMonthStart },
            },
          })
        : 0,
    ]);
    const mannerScore = reputation?.mannerScore ? Number(reputation.mannerScore) : null;

    return {
      totals: {
        activityCount: personalActivityCount + teamActivityCount,
        teamCount: teamIds.length,
        mannerScore,
      },
      monthly: {
        matchCount: monthlyPersonalMatchCount + monthlyTeamMatchCount,
        mannerScore,
        winRate: null,
      },
    };
  }

  async updateMe(user: V1AuthUser, dto: UpdateProfileDto) {
    this.assertMutableAccount(user);
    const profile = await this.prisma.v1UserProfile.upsert({
      where: { userId: user.id },
      update: {
        displayName: dto.displayName,
        nickname: dto.displayName,
        profileImageUrl: dto.profileImageUrl ?? null,
        bio: dto.bio ?? null,
        visibility: dto.visibilityStatus,
      },
      create: {
        userId: user.id,
        displayName: dto.displayName,
        nickname: dto.displayName,
        profileImageUrl: dto.profileImageUrl ?? null,
        bio: dto.bio ?? null,
        visibility: dto.visibilityStatus,
      },
    });

    return {
      profile: toProfilePayload(profile),
      updatedAt: profile.updatedAt,
    };
  }

  async publicProfile(_viewer: V1AuthUser | null, userId: string) {
    const user = await this.prisma.v1User.findFirst({
      where: { id: userId, deletedAt: null },
      include: { profile: true, reputationSummary: true },
    });
    if (!user) throw new NotFoundException({ code: 'NOT_FOUND', message: 'User was not found' });
    if (user.accountStatus === 'deleted') {
      return {
        userId: user.id,
        displayName: '탈퇴한 사용자',
        profileImageUrl: null,
        bio: null,
        visibilityStatus: 'private',
        reputation: emptyReputation(),
      };
    }
    if (user.profile?.visibility === 'private') {
      return {
        userId: user.id,
        displayName: user.profile.displayName ?? user.profile.nickname,
        profileImageUrl: null,
        bio: null,
        visibilityStatus: 'private',
        reputation: emptyReputation(),
      };
    }

    return {
      userId: user.id,
      displayName: user.profile?.displayName ?? user.profile?.nickname ?? '사용자',
      profileImageUrl: user.profile?.profileImageUrl ?? null,
      bio: user.profile?.bio ?? null,
      visibilityStatus: normalizeVisibility(user.profile?.visibility),
      reputation: toReputationPayload(user.reputationSummary),
    };
  }

  async settings(user: V1AuthUser) {
    const snapshot = await this.getUserSnapshot(user.id);
    const preferences = await this.getNotificationPreferences(user.id);
    return {
      account: {
        email: snapshot.email,
        phone: snapshot.phone,
        accountStatus: snapshot.accountStatus,
        providers: snapshot.authIdentities.map((identity) => identity.provider),
      },
      profile: {
        displayName: snapshot.profile?.displayName ?? snapshot.profile?.nickname ?? '사용자',
        visibilityStatus: normalizeVisibility(snapshot.profile?.visibility),
      },
      notifications: toSettingsNotifications(preferences),
    };
  }

  async updateSettings(user: V1AuthUser, dto: UpdateSettingsDto) {
    this.assertMutableAccount(user);
    const [profile, preferences] = await this.prisma.$transaction(async (tx) => {
      const nextProfile = dto.visibilityStatus
        ? await tx.v1UserProfile.upsert({
            where: { userId: user.id },
            update: { visibility: dto.visibilityStatus },
            create: {
              userId: user.id,
              nickname: user.email ?? '사용자',
              displayName: user.email ?? '사용자',
              visibility: dto.visibilityStatus,
            },
          })
        : await tx.v1UserProfile.findUnique({ where: { userId: user.id } });

      const notificationInput = dto.notifications ?? {};
      const activityEnabled =
        notificationInput.matchEnabled ??
        notificationInput.teamEnabled ??
        notificationInput.teamMatchEnabled ??
        notificationInput.chatEnabled ??
        notificationInput.noticeEnabled;
      const nextPreferences = await tx.v1NotificationPreference.upsert({
        where: { userId: user.id },
        update: {
          ...(activityEnabled === undefined ? {} : { activityEnabled }),
          ...(notificationInput.marketingEnabled === undefined
            ? {}
            : { marketingEnabled: notificationInput.marketingEnabled }),
        },
        create: {
          userId: user.id,
          activityEnabled: activityEnabled ?? true,
          marketingEnabled: notificationInput.marketingEnabled ?? false,
        },
      });

      return [nextProfile, nextPreferences] as const;
    });

    return {
      profile: { visibilityStatus: normalizeVisibility(profile?.visibility) },
      notifications: toSettingsNotifications(preferences),
      updatedAt: preferences.updatedAt,
    };
  }

  logout(_user: V1AuthUser) {
    return { ok: true };
  }

  async withdrawalRequest(user: V1AuthUser, dto: WithdrawalRequestDto) {
    this.assertMutableAccount(user);
    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.v1User.update({
        where: { id: user.id },
        data: { accountStatus: 'withdrawal_pending' },
      });
      await tx.v1StatusChangeLog.create({
        data: {
          targetType: 'user',
          targetId: user.id,
          fromStatus: user.accountStatus,
          toStatus: 'withdrawal_pending',
          actorType: 'user',
          actorUserId: user.id,
          reason: dto.reason ?? 'withdrawal_requested',
        },
      });
      return next;
    });
    return { userId: updated.id, accountStatus: updated.accountStatus, requestedAt: updated.updatedAt };
  }

  private async getUserSnapshot(userId: string) {
    const user = await this.prisma.v1User.findUnique({
      where: { id: userId },
      include: {
        profile: true,
        reputationSummary: true,
        authIdentities: { where: { status: 'active' }, select: { provider: true } },
      },
    });
    if (!user) throw new NotFoundException({ code: 'NOT_FOUND', message: 'User was not found' });
    if (user.accountStatus === 'deleted') {
      throw new ForbiddenException({ code: 'PERMISSION_DENIED', message: 'Deleted account cannot access profile' });
    }
    return user;
  }

  private getNotificationPreferences(userId: string) {
    return this.prisma.v1NotificationPreference.upsert({
      where: { userId },
      update: {},
      create: { userId },
    });
  }

  private assertMutableAccount(user: V1AuthUser) {
    if (user.accountStatus !== 'active') {
      throw new ForbiddenException({ code: 'PERMISSION_DENIED', message: 'Account cannot be modified' });
    }
  }
}

function toProfileResponse(user: Awaited<ReturnType<ProfileService['getUserSnapshot']>>) {
  return {
    userId: user.id,
    accountStatus: user.accountStatus,
    email: user.email,
    profile: toProfilePayload(user.profile),
    reputation: toReputationPayload(user.reputationSummary),
  };
}

function toProfilePayload(profile: {
  nickname: string;
  displayName: string | null;
  profileImageUrl: string | null;
  bio: string | null;
  visibility: string;
} | null) {
  return {
    displayName: profile?.displayName ?? profile?.nickname ?? '사용자',
    profileImageUrl: profile?.profileImageUrl ?? null,
    bio: profile?.bio ?? null,
    visibilityStatus: normalizeVisibility(profile?.visibility),
  };
}

function toReputationPayload(reputation: {
  trustState: 'verified' | 'estimated' | 'sample' | 'none';
  mannerScore: unknown;
  reviewCount: number;
} | null) {
  return {
    trustState: reputation?.trustState ?? 'none',
    mannerScore: reputation?.mannerScore ? Number(reputation.mannerScore) : null,
    activityCount: reputation?.reviewCount ?? 0,
    reviewCount: reputation?.reviewCount ?? 0,
  };
}

function emptyReputation() {
  return { trustState: 'none', mannerScore: null, activityCount: 0, reviewCount: 0 };
}

function normalizeVisibility(value?: string | null) {
  if (value === 'members_only' || value === 'private') return value;
  return 'public';
}

function toSettingsNotifications(preferences: {
  activityEnabled: boolean;
  marketingEnabled: boolean;
}) {
  return {
    matchEnabled: preferences.activityEnabled,
    teamEnabled: preferences.activityEnabled,
    teamMatchEnabled: preferences.activityEnabled,
    chatEnabled: preferences.activityEnabled,
    noticeEnabled: preferences.activityEnabled,
    marketingEnabled: preferences.marketingEnabled,
  };
}
