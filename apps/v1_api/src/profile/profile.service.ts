import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, V1AuthProvider } from '@prisma/client';
import { V1AuthUser } from '../auth/v1-auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { isReviewRevealed } from '../reviews/review-visibility';
import {
  UpdateMyPreferencesDto,
  UpdateMyRegionsDto,
  UpdateProfileDto,
  UpdateSettingsDto,
  WithdrawalRequestDto,
} from './dto/profile.dto';

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

    const [
      reputation,
      personalActivityCount,
      monthlyPersonalMatchCount,
    ] = await Promise.all([
      // V1UserReputationSummary 캐시는 리뷰 제출 이벤트(submitPersonalReview/submitTeamReview) 안에서만 갱신되고,
      // 72시간 경과로 리뷰가 새로 reveal 가능해지는 시점을 트리거하는 cron은 없다(사용자 결정: cron 추가 안 함).
      // 그래서 캐시를 읽으면 "이후 새 리뷰가 없는 유저"의 평점이 영원히 갱신 안 될 수 있다 — 매 GET마다 live로 재계산한다.
      this.computeRevealedUserReputation(user.id),
      this.prisma.v1MatchParticipant.count({
        where: {
          userId: user.id,
          status: 'completed',
          match: { status: 'completed', deletedAt: null },
        },
      }),
      this.prisma.v1MatchParticipant.count({
        where: {
          userId: user.id,
          status: 'completed',
          match: { status: 'completed', deletedAt: null, startAt: { gte: monthStart, lt: nextMonthStart } },
        },
      }),
    ]);
    const mannerScore = reputation.mannerScore;

    return {
      totals: {
        activityCount: personalActivityCount,
        teamCount: teamIds.length,
        mannerScore,
      },
      monthly: {
        matchCount: monthlyPersonalMatchCount,
        mannerScore,
        winRate: null,
      },
    };
  }

  async updateMe(user: V1AuthUser, dto: UpdateProfileDto) {
    this.assertMutableAccount(user);
    const realName = dto.realName?.trim() || dto.displayName?.trim() || null;
    const nickname = dto.nickname.trim();
    const emailProvided = dto.email !== undefined;
    const requestedEmail = dto.email?.trim() ? normalizeEmail(dto.email) : null;
    const phone = dto.phone?.trim() || null;
    const birthDate = dto.birthDate?.trim() || null;
    const profileImageUrl = dto.profileImageUrl?.trim() || null;
    const gender = dto.gender;

    const before = await this.prisma.v1User.findUnique({
      where: { id: user.id },
      select: {
        email: true,
        phone: true,
        emailVerifiedAt: true,
        authIdentities: {
          where: { status: 'active' },
          select: { provider: true, passwordHash: true },
        },
        profile: {
          select: {
            realName: true,
            nickname: true,
            profileImageUrl: true,
            birthDate: true,
            gender: true,
          },
        },
      },
    });

    const hasPassword = before?.authIdentities.some((identity) => Boolean(identity.passwordHash)) ?? false;
    const email = hasPassword
      ? requestedEmail ?? before?.email ?? null
      : emailProvided
        ? requestedEmail
        : before?.email ?? null;

    if (!nickname || !gender || (hasPassword && !email)) {
      throw validationError('nickname and gender are required; email is required for password accounts', 'profile');
    }

    if (birthDate && !isValidBirthDate(birthDate)) {
      throw validationError('Birth date must be a valid YYYYMMDD value', 'birthDate');
    }

    const [existingEmail, existingEmailIdentity, existingPhone, existingNickname] = await Promise.all([
      email
        ? this.prisma.v1User.findFirst({
            where: { email, id: { not: user.id } },
            select: { id: true },
          })
        : Promise.resolve(null),
      email
        ? this.prisma.v1AuthIdentity.findFirst({
            where: {
              provider: V1AuthProvider.email,
              providerUserKey: email,
              userId: { not: user.id },
            },
            select: { id: true },
          })
        : Promise.resolve(null),
      phone
        ? this.prisma.v1User.findFirst({
            where: { phone, id: { not: user.id } },
            select: { id: true },
          })
        : Promise.resolve(null),
      this.prisma.v1UserProfile.findFirst({
        where: { nickname, deletedAt: null, userId: { not: user.id } },
        select: { id: true },
      }),
    ]);

    if (existingEmail || existingEmailIdentity) {
      throw new ConflictException({
        code: 'EMAIL_CONFLICT',
        message: 'Email is already registered',
      });
    }

    if (existingPhone) {
      throw new ConflictException({
        code: 'PHONE_CONFLICT',
        message: 'Phone is already registered',
      });
    }

    if (existingNickname) {
      throw new ConflictException({
        code: 'NICKNAME_CONFLICT',
        message: 'Nickname is already registered',
      });
    }

    const emailChanged = email !== (before?.email ?? null);
    const phoneChanged = phone !== (before?.phone ?? null);
    const profile = await this.prisma.$transaction(async (tx) => {
      await tx.v1User.update({
        where: { id: user.id },
        data: {
          email,
          phone,
          ...(emailChanged ? { emailVerifiedAt: null } : {}),
          ...(phoneChanged ? { phoneVerifiedAt: null } : {}),
        },
      });

      if (email && hasPassword) {
        await tx.v1AuthIdentity.updateMany({
          where: { userId: user.id, provider: V1AuthProvider.email, status: 'active' },
          data: { email, providerUserKey: email },
        });
      }

      const nextProfile = await tx.v1UserProfile.upsert({
        where: { userId: user.id },
        update: {
          realName,
          nickname,
          profileImageUrl,
          birthDate,
          gender,
        },
        create: {
          userId: user.id,
          realName,
          nickname,
          profileImageUrl,
          birthDate,
          gender,
          visibility: 'public',
        },
      });

      await writeUserAuditLog(tx, {
        userId: user.id,
        targetType: 'user_profile',
        reason: `profile.update:${changedFields({
          email: before?.email ?? null,
          phone: before?.phone ?? null,
          realName: before?.profile?.realName ?? null,
          nickname: before?.profile?.nickname ?? null,
          profileImageUrl: before?.profile?.profileImageUrl ?? null,
          birthDate: before?.profile?.birthDate ?? null,
          gender: before?.profile?.gender ?? null,
        }, {
          email,
          phone,
          realName,
          nickname,
          profileImageUrl,
          birthDate,
          gender,
        }).join(',') || 'no_change'}`,
      });

      return nextProfile;
    });

    return {
      profile: toProfilePayload(profile),
      updatedAt: profile.updatedAt,
    };
  }

  async publicProfile(_viewer: V1AuthUser | null, userId: string) {
    const user = await this.prisma.v1User.findFirst({
      where: {
        id: userId,
        deletedAt: null,
        accountStatus: 'active',
      },
      include: { profile: true, reputationSummary: true },
    });
    if (!user) throw new NotFoundException({ code: 'NOT_FOUND', message: 'User was not found' });

    const activitySummary = await this.getPublicActivitySummary(user.id);

    return {
      userId: user.id,
      displayName: user.profile?.nickname ?? '사용자',
      nickname: user.profile?.nickname ?? null,
      profileImageUrl: user.profile?.profileImageUrl ?? null,
      reputation: toReputationPayload(user.reputationSummary),
      activitySummary,
    };
  }

  private async getPublicActivitySummary(userId: string) {
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const nextMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

    const [
      matchCount,
      teamCount,
      reputation,
      monthlyMatchCount,
      monthlyTeamJoinCount,
      monthlyReviewCount,
    ] = await Promise.all([
      this.prisma.v1MatchParticipant.count({
        where: {
          userId,
          status: 'completed',
          match: { status: 'completed', deletedAt: null },
        },
      }),
      this.prisma.v1TeamMembership.count({
        where: {
          userId,
          status: 'active',
          team: { status: 'active', deletedAt: null },
        },
      }),
      // 리뷰를 원본 count()로 재집계하지 않아 비공개(reveal 안 된) 리뷰의 존재/시점이 새어나가지 않도록 reveal 필터를 태운다.
      // 캐시(V1UserReputationSummary)는 리뷰 제출 이벤트에서만 갱신되고 72시간 경과만으로 갱신되는 cron이 없어(사용자 결정:
      // cron 추가 안 함) 매 GET마다 live로 재계산한다 — activitySummary()의 computeRevealedUserReputation()과 동일.
      this.computeRevealedUserReputation(userId),
      this.prisma.v1MatchParticipant.count({
        where: {
          userId,
          status: 'completed',
          match: { status: 'completed', deletedAt: null, startAt: { gte: monthStart, lt: nextMonthStart } },
        },
      }),
      this.prisma.v1TeamMembership.count({
        where: {
          userId,
          status: 'active',
          joinedAt: { gte: monthStart, lt: nextMonthStart },
          team: { status: 'active', deletedAt: null },
        },
      }),
      // 캐시에는 월별 값이 없으므로 이번 달 리뷰만 live로 reveal 필터링한다 (ReviewsService.receivedSummary 패턴 이식)
      this.getRevealedMonthlyReviewCount(userId, monthStart, nextMonthStart),
    ]);

    return {
      totals: {
        matchCount,
        teamCount,
        reviewCount: reputation.reviewCount,
      },
      monthly: {
        matchCount: monthlyMatchCount,
        teamJoinCount: monthlyTeamJoinCount,
        reviewCount: monthlyReviewCount,
      },
    };
  }

  /**
   * 유저가 받은 리뷰 중 공개(reveal)된 것만 live로 재계산한다(개수 + 평균 평점).
   * ReviewsService.recalculateUserReputation()의 candidates → reverse → isReviewRevealed 계산 로직을 이식하되,
   * 그쪽은 V1UserReputationSummary에 upsert(쓰기)까지 하는 반면 이 메서드는 읽기 전용 GET 요청마다 호출되므로
   * upsert 없이 계산 결과만 반환한다. 캐시는 리뷰 제출 이벤트에서만 갱신되고 72시간 경과 reveal 시점을 트리거하는
   * cron이 없어(사용자 결정: cron 추가 안 함, self-view는 항상 live 재계산) 캐시만 읽으면 갱신이 영원히 누락될 수 있다.
   * ProfileModule ↔ ReviewsModule 순환 의존을 피하기 위해 ReviewsService를 주입하지 않고 로직만 복제한다
   * (getRevealedMonthlyReviewCount()와 동일 패턴).
   *
   * 범위 한정: 이 메서드는 단일 유저 self-view(activitySummary)/공개 프로필(getPublicActivitySummary) 전용이다.
   * 팀 신뢰점수(V1TeamTrustScore)를 여러 팀 한 번에 렌더링하는 목록형 화면(팀 신청자 목록, admin 팀 목록 등)에는
   * 적용하지 않는다 — 항목마다 live 재계산하면 N+1 쿼리 문제가 생기고, 이는 이번 요청 범위(단일 유저 GET) 밖이다.
   */
  private async computeRevealedUserReputation(userId: string): Promise<{ reviewCount: number; mannerScore: number | null }> {
    const candidates = await this.prisma.v1PostEventReview.findMany({
      where: { targetUserId: userId, targetType: 'user', status: 'submitted' },
      select: { sourceId: true, reviewerUserId: true, targetUserId: true, rating: true, submittedAt: true },
    });
    if (candidates.length === 0) return { reviewCount: 0, mannerScore: null };

    const sourceIds = [...new Set(candidates.map((review) => review.sourceId))];
    const reverseReviews = await this.prisma.v1PostEventReview.findMany({
      where: { reviewerUserId: userId, sourceId: { in: sourceIds }, status: 'submitted' },
      select: { sourceId: true, reviewerUserId: true, targetUserId: true },
    });

    const now = new Date();
    const revealed = candidates.filter((review) => isReviewRevealed(review, reverseReviews, now));
    const reviewCount = revealed.length;
    const mannerScore = reviewCount
      ? Number((revealed.reduce((sum, review) => sum + review.rating, 0) / reviewCount).toFixed(2))
      : null;

    return { reviewCount, mannerScore };
  }

  /**
   * 이번 달 공개(reveal)된 리뷰 개수 — 상호제출 또는 72시간 경과 기준.
   * ReviewsService.receivedSummary()의 candidates → reverse → isReviewRevealed 패턴을 이식했다.
   * ProfileModule ↔ ReviewsModule 순환 의존을 피하기 위해 ReviewsService를 주입하지 않고 로직만 복제한다.
   */
  private async getRevealedMonthlyReviewCount(userId: string, monthStart: Date, nextMonthStart: Date) {
    const candidates = await this.prisma.v1PostEventReview.findMany({
      where: {
        targetUserId: userId,
        targetType: 'user',
        status: 'submitted',
        submittedAt: { gte: monthStart, lt: nextMonthStart },
      },
      select: { sourceId: true, reviewerUserId: true, targetUserId: true, submittedAt: true },
    });
    if (candidates.length === 0) return 0;

    const sourceIds = [...new Set(candidates.map((review) => review.sourceId))];
    const reverseReviews = await this.prisma.v1PostEventReview.findMany({
      where: { reviewerUserId: userId, sourceId: { in: sourceIds }, status: 'submitted' },
      select: { sourceId: true, reviewerUserId: true, targetUserId: true },
    });

    const now = new Date();
    return candidates.filter((review) => isReviewRevealed(review, reverseReviews, now)).length;
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
        hasPassword: snapshot.authIdentities.some((identity) => Boolean(identity.passwordHash)),
      },
      profile: {
        displayName: snapshot.profile?.nickname ?? '사용자',
      },
      notifications: toSettingsNotifications(preferences),
    };
  }

  async updateSettings(user: V1AuthUser, dto: UpdateSettingsDto) {
    this.assertMutableAccount(user);
    const [profile, preferences] = await this.prisma.$transaction(async (tx) => {
      const nextProfile = await tx.v1UserProfile.findUnique({ where: { userId: user.id } });

      const notificationInput = dto.notifications ?? {};
      const individualNotifications = {
        ...(notificationInput.matchEnabled === undefined ? {} : { matchEnabled: notificationInput.matchEnabled }),
        ...(notificationInput.teamEnabled === undefined ? {} : { teamEnabled: notificationInput.teamEnabled }),
        ...(notificationInput.teamMatchEnabled === undefined
          ? {}
          : { teamMatchEnabled: notificationInput.teamMatchEnabled }),
        ...(notificationInput.chatEnabled === undefined ? {} : { chatEnabled: notificationInput.chatEnabled }),
        ...(notificationInput.noticeEnabled === undefined ? {} : { noticeEnabled: notificationInput.noticeEnabled }),
      };
      const nextPreferences = await tx.v1NotificationPreference.upsert({
        where: { userId: user.id },
        update: {
          ...individualNotifications,
          ...(notificationInput.marketingEnabled === undefined
            ? {}
            : { marketingEnabled: notificationInput.marketingEnabled }),
        },
        create: {
          userId: user.id,
          activityEnabled: true,
          matchEnabled: notificationInput.matchEnabled ?? true,
          teamEnabled: notificationInput.teamEnabled ?? true,
          teamMatchEnabled: notificationInput.teamMatchEnabled ?? true,
          chatEnabled: notificationInput.chatEnabled ?? true,
          noticeEnabled: notificationInput.noticeEnabled ?? true,
          marketingEnabled: notificationInput.marketingEnabled ?? false,
        },
      });

      if (dto.notifications) {
        await writeUserAuditLog(tx, {
          userId: user.id,
          targetType: 'user_notification_settings',
          reason: `settings.notifications.update:${Object.keys(dto.notifications).sort().join(',') || 'no_change'}`,
        });
      }

      return [nextProfile, nextPreferences] as const;
    });

    return {
      profile: { displayName: profile?.nickname ?? '사용자' },
      notifications: toSettingsNotifications(preferences),
      updatedAt: preferences.updatedAt,
    };
  }

  async updateMyRegions(user: V1AuthUser, dto: UpdateMyRegionsDto) {
    this.assertMutableAccount(user);
    const region = await this.prisma.v1Region.findFirst({
      where: { id: dto.regionId, isActive: true, level: 2 },
      include: { parent: true },
    });

    if (!region) {
      throw validationError('regionId must be an active district region', 'regionId');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.v1UserRegion.updateMany({
        where: { userId: user.id },
        data: { isPrimary: false },
      });
      await tx.v1UserRegion.upsert({
        where: { userId_regionId: { userId: user.id, regionId: region.id } },
        update: { isPrimary: true },
        create: { userId: user.id, regionId: region.id, isPrimary: true },
      });
      await writeUserAuditLog(tx, {
        userId: user.id,
        targetType: 'user_region',
        reason: 'profile.region.update',
      });
    });

    return {
      region: {
        regionId: region.id,
        name: formatRegionName(region),
      },
      updatedAt: new Date().toISOString(),
    };
  }

  async updateMyPreferences(user: V1AuthUser, dto: UpdateMyPreferencesDto) {
    this.assertMutableAccount(user);
    validateNoDuplicates(dto.sports.map((sport) => sport.sportId), 'sports');
    validateNoDuplicates(dto.regions.map((region) => region.regionId), 'regions');

    if (dto.regions.filter((region) => region.primary).length > 1) {
      throw validationError('Only one primary region is allowed', 'regions.primary');
    }

    await this.validateSports(dto.sports);
    await this.validateRegions(dto.regions.map((region) => region.regionId));

    await this.prisma.$transaction(async (tx) => {
      await tx.v1UserSportPreference.deleteMany({ where: { userId: user.id } });
      if (dto.sports.length > 0) {
        await tx.v1UserSportPreference.createMany({
          data: dto.sports.map((sport, index) => ({
            userId: user.id,
            sportId: sport.sportId,
            sportLevelId: sport.levelId ?? null,
            isPrimary: index === 0,
          })),
        });
      }

      await tx.v1UserRegion.deleteMany({ where: { userId: user.id } });
      if (dto.regions.length > 0) {
        const primaryRegionId = dto.regions.find((region) => region.primary)?.regionId ?? dto.regions[0]?.regionId;
        await tx.v1UserRegion.createMany({
          data: dto.regions.map((region) => ({
            userId: user.id,
            regionId: region.regionId,
            isPrimary: region.regionId === primaryRegionId,
          })),
        });
      }
      await writeUserAuditLog(tx, {
        userId: user.id,
        targetType: 'user_preferences',
        reason: 'profile.preferences.update',
      });
    });

    const snapshot = await this.getUserSnapshot(user.id);

    return {
      sports: snapshot.sportPreferences.map((preference) => ({
        sportId: preference.sport.id,
        sportName: preference.sport.name,
        levelId: preference.sportLevel?.id ?? null,
        levelName: preference.sportLevel?.name ?? null,
        primary: preference.isPrimary,
      })),
      regions: snapshot.regions.map((userRegion) => ({
        regionId: userRegion.region.id,
        name: formatRegionName(userRegion.region),
        primary: userRegion.isPrimary,
      })),
      updatedAt: new Date().toISOString(),
    };
  }

  logout() {
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
        regions: {
          include: {
            region: {
              include: { parent: true },
            },
          },
          orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
        },
        sportPreferences: {
          include: {
            sport: { select: { id: true, name: true } },
            sportLevel: { select: { id: true, name: true } },
          },
          orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
        },
        authIdentities: { where: { status: 'active' }, select: { provider: true, passwordHash: true } },
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

  private async validateSports(sports: Array<{ sportId: string; levelId?: string | null }>) {
    for (const sport of sports) {
      const activeSport = await this.prisma.v1Sport.findFirst({
        where: { id: sport.sportId, isActive: true },
        select: { id: true },
      });

      if (!activeSport) {
        throw validationError('Sport is not active or does not exist', 'sports');
      }

      if (sport.levelId) {
        const level = await this.prisma.v1SportLevel.findFirst({
          where: {
            id: sport.levelId,
            sportId: sport.sportId,
            isActive: true,
          },
          select: { id: true },
        });

        if (!level) {
          throw validationError('Level does not belong to the selected active sport', 'sports.levelId');
        }
      }
    }
  }

  private async validateRegions(regionIds: string[]) {
    if (regionIds.length === 0) return;

    const count = await this.prisma.v1Region.count({
      where: {
        id: { in: regionIds },
        isActive: true,
        level: 2,
      },
    });

    if (count !== regionIds.length) {
      throw validationError('Region is not an active district region', 'regions');
    }
  }
}

function validateNoDuplicates(values: string[], field: string) {
  if (new Set(values).size !== values.length) {
    throw validationError(`Duplicate ${field} are not allowed`, field);
  }
}

function validationError(message: string, field: string) {
  return new BadRequestException({
    code: 'VALIDATION_FAILED',
    message,
    details: { field },
  });
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function isValidBirthDate(value: string) {
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(4, 6));
  const day = Number(value.slice(6, 8));
  const date = new Date(Date.UTC(year, month - 1, day));

  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function formatRegionName(region: { name: string; parent: { name: string } | null }) {
  return region.parent?.name ? `${region.parent.name} ${region.name}` : region.name;
}

function toProfileResponse(user: Awaited<ReturnType<ProfileService['getUserSnapshot']>>) {
  return {
    userId: user.id,
    accountStatus: user.accountStatus,
    email: user.email,
    phone: user.phone,
    authProvider: user.authIdentities[0]?.provider ?? null,
    authProviders: user.authIdentities.map((identity) => identity.provider),
    hasPassword: user.authIdentities.some((identity) => Boolean(identity.passwordHash)),
    onboardingStatus: user.onboardingStatus,
    regionName: formatPrimaryRegion(user.regions),
    sports: user.sportPreferences.map((preference) => ({
      sportId: preference.sport.id,
      sportName: preference.sport.name,
      levelId: preference.sportLevel?.id ?? null,
      levelName: preference.sportLevel?.name ?? null,
      primary: preference.isPrimary,
    })),
    regions: user.regions.map((userRegion) => ({
      regionId: userRegion.region.id,
      regionName: formatRegionName(userRegion.region),
      primary: userRegion.isPrimary,
    })),
    profile: toProfilePayload(user.profile),
    reputation: toReputationPayload(user.reputationSummary),
  };
}

function formatPrimaryRegion(
  regions: Array<{
    region: {
      name: string;
      parent: { name: string } | null;
    };
  }>,
) {
  const primary = regions[0];
  if (!primary) return null;
  return formatRegionName(primary.region);
}

function toProfilePayload(profile: {
  nickname: string;
  displayName: string | null;
  realName: string | null;
  profileImageUrl: string | null;
  birthDate: string | null;
  gender: string | null;
} | null) {
  return {
    displayName: profile?.nickname ?? '사용자',
    nickname: profile?.nickname ?? null,
    realName: profile?.realName ?? null,
    profileImageUrl: profile?.profileImageUrl ?? null,
    birthDate: profile?.birthDate ?? null,
    gender: normalizeProfileGender(profile?.gender),
  };
}

function normalizeProfileGender(value: string | null | undefined): 'male' | 'female' | null {
  return value === 'male' || value === 'female' ? value : null;
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

function toSettingsNotifications(preferences: {
  activityEnabled: boolean;
  matchEnabled?: boolean;
  teamEnabled?: boolean;
  teamMatchEnabled?: boolean;
  chatEnabled?: boolean;
  noticeEnabled?: boolean;
  marketingEnabled: boolean;
}) {
  return {
    matchEnabled: preferences.matchEnabled ?? preferences.activityEnabled,
    teamEnabled: preferences.teamEnabled ?? preferences.activityEnabled,
    teamMatchEnabled: preferences.teamMatchEnabled ?? preferences.activityEnabled,
    chatEnabled: preferences.chatEnabled ?? preferences.activityEnabled,
    noticeEnabled: preferences.noticeEnabled ?? preferences.activityEnabled,
    marketingEnabled: preferences.marketingEnabled,
  };
}

async function writeUserAuditLog(
  tx: Prisma.TransactionClient,
  input: { userId: string; targetType: string; reason: string },
) {
  await tx.v1StatusChangeLog.create({
    data: {
      targetType: input.targetType,
      targetId: input.userId,
      fromStatus: null,
      toStatus: 'updated',
      actorType: 'user',
      actorUserId: input.userId,
      reason: input.reason,
    },
  });
}

function changedFields(
  before: Record<string, string | null>,
  after: Record<string, string | null>,
) {
  return Object.keys(after).filter((key) => (before[key] ?? null) !== (after[key] ?? null));
}
