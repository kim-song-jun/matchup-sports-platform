import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, V1OnboardingStatus } from '@prisma/client';
import { getPendingSocialSignupRoute } from '../auth/social-signup-access';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateOnboardingPreferencesDto } from './dto/update-onboarding-preferences.dto';
import { V1OnboardingStep, derivePreferenceStatus, getMissing, getOnboardingDetail, hasAcceptedRequiredTerms } from './onboarding-summary';

@Injectable()
export class OnboardingService {
  constructor(private readonly prisma: PrismaService) {}

  async get(userId: string) {
    const user = await this.getUserSnapshot(userId);
    return getOnboardingDetail(user);
  }

  async updatePreferences(userId: string, dto: UpdateOnboardingPreferencesDto) {
    await this.assertUserCanMutate(userId);
    validateNoDuplicates(dto.sports?.map((sport) => sport.sportId) ?? [], 'sports');
    validateNoDuplicates(dto.regions?.map((region) => region.regionId) ?? [], 'regions');

    if ((dto.regions?.filter((region) => region.primary).length ?? 0) > 1) {
      throw validationError('Only one primary region is allowed', 'regions.primary');
    }

    const sports = dto.sports ?? [];
    const regions = dto.regions ?? [];
    await this.validateSports(sports);
    await this.validateRegions(regions.map((region) => region.regionId));

    const nextStatus = derivePreferenceStatus({
      sportsCount: sports.length,
      missingLevels: sports.some((sport) => !sport.levelId),
      currentStep: dto.currentStep,
    });

    await this.prisma.$transaction(async (tx) => {
      if (dto.sports) {
        await tx.v1UserSportPreference.deleteMany({ where: { userId } });
        if (sports.length > 0) {
          await tx.v1UserSportPreference.createMany({
            data: sports.map((sport) => ({
              userId,
              sportId: sport.sportId,
              sportLevelId: sport.levelId ?? null,
              isPrimary: sports[0]?.sportId === sport.sportId,
            })),
          });
        }
      }

      if (dto.regions) {
        await tx.v1UserRegion.deleteMany({ where: { userId } });
        if (regions.length > 0) {
          const primaryRegionId =
            regions.find((region) => region.primary)?.regionId ?? regions[0]?.regionId;
          await tx.v1UserRegion.createMany({
            data: regions.map((region) => ({
              userId,
              regionId: region.regionId,
              isPrimary: region.regionId === primaryRegionId,
            })),
          });
        }
      }

      const user = await tx.v1User.findUniqueOrThrow({
        where: { id: userId },
        select: { onboardingStatus: true },
      });

      await tx.v1User.update({
        where: { id: userId },
        data: { onboardingStatus: nextStatus },
      });
      await tx.v1UserOnboardingProgress.upsert({
        where: { userId },
        update: {
          currentStep: dto.currentStep,
          draftJson: dto as unknown as Prisma.InputJsonValue,
        },
        create: {
          userId,
          currentStep: dto.currentStep,
          draftJson: dto as unknown as Prisma.InputJsonValue,
        },
      });

      if (user.onboardingStatus !== nextStatus) {
        await tx.v1StatusChangeLog.create({
          data: {
            targetType: 'user_onboarding',
            targetId: userId,
            fromStatus: user.onboardingStatus,
            toStatus: nextStatus,
            actorType: 'user',
            actorUserId: userId,
            reason: 'onboarding_preferences_update',
          },
        });
      }
    });

    const snapshot = await this.getUserSnapshot(userId);
    const detail = getOnboardingDetail(snapshot);

    return {
      status: snapshot.onboardingStatus,
      currentStep: dto.currentStep,
      canContinue: !detail.missing.includes('sports') && !detail.missing.includes('levels'),
      missing: detail.missing.filter((item) => item === 'sports' || item === 'levels' || item === 'regions'),
      sports: sports.map((sport) => ({
        sportId: sport.sportId,
        levelId: sport.levelId ?? null,
      })),
      regions: regions.map((region) => ({
        regionId: region.regionId,
        primary: region.primary,
      })),
    };
  }

  async complete(userId: string) {
    await this.assertUserCanMutate(userId);
    const snapshot = await this.getUserSnapshot(userId);
    const missing = getMissing(snapshot);
    const blockingMissing = missing.filter((item) => item === 'sports' || item === 'levels');

    if (blockingMissing.length > 0) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'Onboarding completion requirements are not met',
        details: { missing: blockingMissing },
      });
    }

    await this.changeStatus(userId, snapshot.onboardingStatus, 'completed', 'onboarding_complete');

    return {
      status: 'completed',
      next: {
        route: '/home',
        reason: 'onboarding_completed',
      },
      missing: [],
      limited: false,
    };
  }

  async defer(userId: string, reason: string) {
    await this.assertUserCanMutate(userId);
    const snapshot = await this.getUserSnapshot(userId);
    const nextStatus = snapshot.onboardingStatus === 'completed' ? 'completed' : 'deferred';
    const detail = getOnboardingDetail(snapshot);

    await this.changeStatus(userId, snapshot.onboardingStatus, nextStatus, `onboarding_defer:${reason}`);

    return {
      status: nextStatus,
      next: {
        route: '/home',
        reason: 'onboarding_deferred',
      },
      missing: detail.missing.filter((item) => item === 'sports' || item === 'levels' || item === 'regions'),
      limited: nextStatus !== 'completed',
    };
  }

  private async getUserSnapshot(userId: string) {
    const user = await this.prisma.v1User.findUnique({
      where: { id: userId },
      include: {
        onboardingProgress: true,
        sportPreferences: {
          include: {
            sport: true,
            sportLevel: true,
          },
          orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
        },
        regions: {
          include: { region: true },
          orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
        },
        profile: true,
        termsConsents: {
          where: {
            revokedAt: null,
            termsDocument: {
              isRequired: true,
              status: 'published',
            },
          },
          select: { id: true },
        },
      },
    });

    if (!user) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'V1 user was not found',
      });
    }

    if (user.accountStatus === 'deleted') {
      throw new ForbiddenException({
        code: 'PERMISSION_DENIED',
        message: 'Deleted account cannot access onboarding',
      });
    }

    return {
      onboardingStatus: user.onboardingStatus,
      currentStep: user.onboardingProgress?.currentStep ?? null,
      sportPreferences: user.sportPreferences,
      regions: user.regions,
      hasRequiredTerms: hasAcceptedRequiredTerms(user.onboardingStatus, user.termsConsents.length),
      hasProfile: Boolean(user.profile?.nickname),
    };
  }

  private async assertUserCanMutate(userId: string) {
    const user = await this.prisma.v1User.findUnique({
      where: { id: userId },
      select: { accountStatus: true, onboardingStatus: true },
    });

    if (!user) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'V1 user was not found',
      });
    }

    if (user.accountStatus === 'blocked' || user.accountStatus === 'deleted') {
      throw new ForbiddenException({
        code: 'PERMISSION_DENIED',
        message: 'Account cannot mutate onboarding',
      });
    }

    const pendingSignupRoute = getPendingSocialSignupRoute(user.onboardingStatus);
    if (pendingSignupRoute) {
      throw new ForbiddenException({
        code: 'SIGNUP_INCOMPLETE',
        message: 'Social signup must be completed before onboarding can be changed',
        details: { next: { route: pendingSignupRoute } },
      });
    }
  }

  private async validateSports(
    sports: Array<{ sportId: string; levelId?: string | null }>,
  ) {
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
    if (regionIds.length === 0) {
      return;
    }

    const count = await this.prisma.v1Region.count({
      where: {
        id: { in: regionIds },
        isActive: true,
      },
    });

    if (count !== regionIds.length) {
      throw validationError('Region is not active or does not exist', 'regions');
    }
  }

  private async changeStatus(
    userId: string,
    fromStatus: V1OnboardingStatus,
    toStatus: V1OnboardingStatus,
    reason: string,
  ) {
    await this.prisma.$transaction(async (tx) => {
      if (fromStatus !== toStatus) {
        await tx.v1User.update({
          where: { id: userId },
          data: { onboardingStatus: toStatus },
        });
        await tx.v1StatusChangeLog.create({
          data: {
            targetType: 'user_onboarding',
            targetId: userId,
            fromStatus,
            toStatus,
            actorType: 'user',
            actorUserId: userId,
            reason,
          },
        });
      }

      await tx.v1UserOnboardingProgress.upsert({
        where: { userId },
        update: {
          currentStep: toStatus === 'completed' ? 'done' : 'confirm',
          completedAt: toStatus === 'completed' ? new Date() : undefined,
          deferredAt: toStatus === 'deferred' ? new Date() : undefined,
        },
        create: {
          userId,
          currentStep: toStatus === 'completed' ? 'done' : 'confirm',
          completedAt: toStatus === 'completed' ? new Date() : undefined,
          deferredAt: toStatus === 'deferred' ? new Date() : undefined,
        },
      });
    });
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
